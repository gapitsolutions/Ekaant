"""Transactional business logic for the pharmacy module.

All multi-row writes go through these services so the views remain thin.
Each public function is expected to be called inside an HTTP view that has
already authenticated and authorized the request.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers

from core.exceptions import ConflictError
from patients.models import Patient
from visits.models import VisitSession, VisitStage, VisitStatus

from .models import (
    DispenseInvoice,
    DispenseInvoiceItem,
    DispenseStatus,
    Medicine,
    MedicineBatch,
    MovementType,
    PaymentMethod,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    RemovalReason,
    StockAuditRemoval,
    StockMovement,
    Supplier,
)

logger = logging.getLogger("pharmacy")


def _q2(value) -> Decimal:
    """Quantize to 2 decimal places (currency)."""
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _log_stock_movement(
    *,
    medicine: Medicine,
    batch: MedicineBatch,
    movement_type: str,
    quantity_change: int,
    quantity_before: int,
    quantity_after: int,
    reference_type: str = "",
    reference_id=None,
    performed_by=None,
    notes: str = "",
) -> StockMovement:
    return StockMovement.objects.create(
        medicine=medicine,
        batch=batch,
        movement_type=movement_type,
        quantity_change=quantity_change,
        quantity_before=quantity_before,
        quantity_after=quantity_after,
        reference_type=reference_type,
        reference_id=reference_id,
        performed_by=performed_by,
        notes=notes,
    )


# ────────────────────────────────────────────────────────────
# Purchase Invoice
# ────────────────────────────────────────────────────────────


@transaction.atomic
def process_purchase_invoice(*, data: dict, user) -> PurchaseInvoice:
    invoice_number = data["invoice_number"]

    if PurchaseInvoice.objects.filter(invoice_number=invoice_number).exists():
        raise ConflictError("Invoice number already exists.")

    # The serializer already validates that the supplier exists and is
    # active, but re-fetch here so the .save() below has a model instance.
    supplier = Supplier.objects.get(pk=data["supplier_id"])

    try:
        invoice = PurchaseInvoice.objects.create(
            invoice_number=invoice_number,
            supplier=supplier,
            invoice_date=data["invoice_date"],
            delivery_date=data.get("delivery_date"),
            notes=data.get("notes", ""),
            created_by=user,
        )
    except IntegrityError as exc:
        # Race: the pre-check above lost to a concurrent insert of the same
        # invoice_number. Surface the same 409 envelope the pre-check uses.
        raise ConflictError("Invoice number already exists.") from exc

    total_amount = Decimal("0")
    items_count = 0

    for raw_item in data["items"]:
        try:
            medicine = Medicine.objects.get(id=raw_item["medicine_id"], is_active=True)
        except Medicine.DoesNotExist:
            raise serializers.ValidationError(
                f"Medicine {raw_item['medicine_id']} not found or inactive."
            )

        # Find-or-create batch for (medicine, batch_number)
        batch, created = MedicineBatch.objects.select_for_update().get_or_create(
            medicine=medicine,
            batch_number=raw_item["batch_number"],
            defaults={
                "expiry_date": raw_item["expiry_date"],
                "quantity": 0,
                "initial_quantity": raw_item["quantity"],
                "purchase_price": raw_item["purchase_price"],
                "gst_percentage": raw_item.get("gst_percentage", 0),
                "purchase_invoice": invoice,
                "is_active": True,
            },
        )

        qty_before = batch.quantity
        batch.quantity = qty_before + raw_item["quantity"]
        # Reactivate a depleted batch if more stock arrives.
        if not batch.is_active and batch.quantity > 0:
            batch.is_active = True
        batch.save(update_fields=["quantity", "is_active", "updated_at"])

        gst_pct = Decimal(raw_item.get("gst_percentage", 0) or 0)
        line_total = _q2(
            Decimal(raw_item["quantity"])
            * Decimal(raw_item["purchase_price"])
            * (Decimal("1") + gst_pct / Decimal("100"))
        )

        PurchaseInvoiceItem.objects.create(
            purchase_invoice=invoice,
            medicine=medicine,
            batch=batch,
            category=raw_item.get("category") or medicine.category,
            subcategory=raw_item.get("subcategory") or (medicine.bup_category or ""),
            batch_number=raw_item["batch_number"],
            expiry_date=raw_item["expiry_date"],
            quantity=raw_item["quantity"],
            purchase_price=raw_item["purchase_price"],
            gst_percentage=raw_item.get("gst_percentage", 0),
            line_total=line_total,
        )

        _log_stock_movement(
            medicine=medicine,
            batch=batch,
            movement_type=MovementType.PURCHASE,
            quantity_change=raw_item["quantity"],
            quantity_before=qty_before,
            quantity_after=batch.quantity,
            reference_type="purchaseinvoice",
            reference_id=invoice.id,
            performed_by=user,
        )

        total_amount += line_total
        items_count += 1

    invoice.total_amount = _q2(total_amount)
    invoice.items_count = items_count
    invoice.save(update_fields=["total_amount", "items_count", "updated_at"])

    logger.info(
        "PURCHASE: %s | supplier=%s | items=%d | total=%s",
        invoice.invoice_number,
        invoice.supplier,
        items_count,
        invoice.total_amount,
    )
    return invoice


# ────────────────────────────────────────────────────────────
# Audit Removal
# ────────────────────────────────────────────────────────────


@transaction.atomic
def process_audit_removal(*, data: dict, user) -> StockAuditRemoval:
    try:
        medicine = Medicine.objects.get(id=data["medicine_id"])
    except Medicine.DoesNotExist:
        raise serializers.ValidationError("Medicine not found.")

    batch = (
        MedicineBatch.objects.select_for_update()
        .filter(medicine=medicine, batch_number=data["batch_number"])
        .first()
    )
    if batch is None:
        raise serializers.ValidationError(
            f"Batch {data['batch_number']} not found for this medicine."
        )

    qty_before = batch.quantity
    requested_qty = data.get("quantity") or qty_before  # default: remove entire batch
    if requested_qty <= 0:
        raise serializers.ValidationError("Removal quantity must be positive.")
    if requested_qty > qty_before:
        raise serializers.ValidationError(
            f"Cannot remove {requested_qty} tablets; only {qty_before} available."
        )

    batch.quantity = qty_before - requested_qty
    if batch.quantity == 0:
        batch.is_active = False
    batch.save(update_fields=["quantity", "is_active", "updated_at"])

    removal = StockAuditRemoval.objects.create(
        medicine=medicine,
        batch=batch,
        batch_number=batch.batch_number,
        quantity_removed=requested_qty,
        reason=data["reason"],
        notes=data.get("notes", ""),
        removed_by=user,
    )

    _log_stock_movement(
        medicine=medicine,
        batch=batch,
        movement_type=MovementType.AUDIT_REMOVAL,
        quantity_change=-requested_qty,
        quantity_before=qty_before,
        quantity_after=batch.quantity,
        reference_type="stockauditremoval",
        reference_id=removal.id,
        performed_by=user,
        notes=data["reason"],
    )

    logger.info(
        "AUDIT_REMOVAL: %s / %s | qty=%d | reason=%s",
        medicine.name,
        batch.batch_number,
        requested_qty,
        data["reason"],
    )
    return removal


# ────────────────────────────────────────────────────────────
# Dispense
# ────────────────────────────────────────────────────────────


def _resolve_visit_session(session_id) -> VisitSession:
    try:
        session = VisitSession.objects.select_related("patient").get(id=session_id)
    except VisitSession.DoesNotExist:
        raise serializers.ValidationError("Visit session not found.")
    if session.status != VisitStatus.IN_PROGRESS:
        raise serializers.ValidationError("Visit is not in progress.")
    if session.current_stage != VisitStage.PHARMACY:
        raise serializers.ValidationError(
            f"Visit is at stage '{session.current_stage}', not at pharmacy."
        )
    return session


def _build_payment_totals(line_items: list[dict], payment: dict) -> dict:
    subtotal = sum(
        (Decimal(item["qty"]) * Decimal(item["unit_price"]) for item in line_items),
        Decimal("0"),
    )
    discount_pct = Decimal(payment.get("discount", 0) or 0)
    discount_amount = _q2(subtotal * discount_pct / Decimal("100"))
    net_payable = _q2(subtotal - discount_amount)

    method = payment["payment_method"]
    cash = Decimal(payment.get("cash_amount", 0) or 0)
    online = Decimal(payment.get("online_amount", 0) or 0)

    if method == PaymentMethod.CASH:
        if abs(cash - net_payable) > Decimal("1"):
            raise serializers.ValidationError(
                "Cash amount must equal net payable for Cash payments."
            )
        cash = net_payable
        online = Decimal("0")
    elif method == PaymentMethod.ONLINE:
        if abs(online - net_payable) > Decimal("1"):
            raise serializers.ValidationError(
                "Online amount must equal net payable for Online payments."
            )
        online = net_payable
        cash = Decimal("0")
    elif method == PaymentMethod.SPLIT:
        if abs((cash + online) - net_payable) > Decimal("1"):
            raise serializers.ValidationError(
                "Cash + Online must equal net payable (±1) for Split payments."
            )

    return {
        "subtotal": _q2(subtotal),
        "discount_percentage": discount_pct,
        "discount_amount": discount_amount,
        "net_payable": net_payable,
        "cash_amount": _q2(cash),
        "online_amount": _q2(online),
    }


@transaction.atomic
def process_dispense(*, data: dict, user) -> DispenseInvoice:
    session = _resolve_visit_session(data["session_id"])

    if DispenseInvoice.objects.filter(visit_session=session).exists():
        raise ConflictError("A dispense invoice already exists for this visit.")

    line_items = data["line_items"]
    payment = data["payment"]

    # Resolve medicines + batches and lock the batch rows.
    requested_batch_ids: list = []
    resolved: list[dict] = []  # list of {medicine, batch, raw}

    # First pass: resolve medicine + batch identifiers, validate active/expiry.
    medicine_cache: dict[str, Medicine] = {}
    batch_cache: dict[tuple[str, str], MedicineBatch] = {}
    for raw in line_items:
        medicine_id = str(raw["medicine_id"])
        if medicine_id not in medicine_cache:
            try:
                medicine_cache[medicine_id] = Medicine.objects.get(
                    id=medicine_id, is_active=True
                )
            except Medicine.DoesNotExist:
                raise serializers.ValidationError(
                    f"Medicine {medicine_id} not found or inactive."
                )
        medicine = medicine_cache[medicine_id]

        key = (medicine_id, raw["batch_number"])
        if key not in batch_cache:
            try:
                batch_cache[key] = MedicineBatch.objects.get(
                    medicine=medicine,
                    batch_number=raw["batch_number"],
                    is_active=True,
                )
            except MedicineBatch.DoesNotExist:
                raise serializers.ValidationError(
                    f"Batch {raw['batch_number']} not found for medicine {medicine.name}."
                )
        batch = batch_cache[key]

        if batch.expiry_date < timezone.localdate():
            raise serializers.ValidationError(
                f"Batch {batch.batch_number} is expired and cannot be dispensed."
            )

        requested_batch_ids.append(batch.id)
        resolved.append({"medicine": medicine, "batch": batch, "raw": raw})

    # Lock all referenced batches in a deterministic order to avoid deadlocks.
    locked_batches = {
        b.id: b
        for b in MedicineBatch.objects.select_for_update()
        .filter(id__in=requested_batch_ids)
        .order_by("id")
    }

    # Aggregate per-batch requested totals (same batch may appear multiple times).
    batch_totals: dict = defaultdict(int)
    for entry in resolved:
        batch_totals[entry["batch"].id] += int(entry["raw"]["qty"])

    for batch_id, total_qty in batch_totals.items():
        locked = locked_batches[batch_id]
        if locked.quantity < total_qty:
            raise ConflictError(
                f"Insufficient stock for batch {locked.batch_number}. "
                f"Available: {locked.quantity}, Requested: {total_qty}"
            )

    totals = _build_payment_totals(line_items, payment)

    try:
        invoice = DispenseInvoice.objects.create(
            invoice_number=DispenseInvoice.generate_invoice_number(),
            visit_session=session,
            patient=session.patient,
            dispensed_by=user,
            dispense_date=timezone.localdate(),
            subtotal=totals["subtotal"],
            discount_percentage=totals["discount_percentage"],
            discount_amount=totals["discount_amount"],
            net_payable=totals["net_payable"],
            payment_method=payment["payment_method"],
            cash_amount=totals["cash_amount"],
            online_amount=totals["online_amount"],
            notes=payment.get("notes", "") or "",
            next_followup_date=data.get("next_followup_date"),
            status=DispenseStatus.SUCCESS,
        )
    except IntegrityError as exc:
        # Race: the .exists() pre-check above lost to a concurrent dispense for
        # the same visit_session (OneToOneField). Same 409 either way.
        raise ConflictError("A dispense invoice already exists for this visit.") from exc

    # Persist line items + deduct stock + log movements.
    for entry in resolved:
        medicine: Medicine = entry["medicine"]
        batch: MedicineBatch = locked_batches[entry["batch"].id]
        raw = entry["raw"]
        line_qty = int(raw["qty"])
        line_total = _q2(Decimal(line_qty) * Decimal(raw["unit_price"]))

        item = DispenseInvoiceItem.objects.create(
            dispense_invoice=invoice,
            medicine=medicine,
            batch=batch,
            medicine_name=medicine.name,
            salt=medicine.salt,
            category=medicine.category,
            batch_number=batch.batch_number,
            expiry_date=batch.expiry_date,
            dose=raw["dose"],
            days=raw["days"],
            quantity=line_qty,
            unit_price=raw["unit_price"],
            total=line_total,
        )

        qty_before = batch.quantity
        batch.quantity = qty_before - line_qty
        if batch.quantity == 0:
            batch.is_active = False
        batch.save(update_fields=["quantity", "is_active", "updated_at"])

        _log_stock_movement(
            medicine=medicine,
            batch=batch,
            movement_type=MovementType.DISPENSE,
            quantity_change=-line_qty,
            quantity_before=qty_before,
            quantity_after=batch.quantity,
            reference_type="dispenseinvoiceitem",
            reference_id=item.id,
            performed_by=user,
            notes=str(session.patient_id) if medicine.category == "BUP" else "",
        )

    # Transition visit + populate medicines_total.
    now = timezone.now()
    session.medicines_total = totals["net_payable"]
    session.current_stage = VisitStage.COMPLETED
    session.status = VisitStatus.COMPLETED
    session.completed_time = now
    session.save(
        update_fields=[
            "medicines_total",
            "current_stage",
            "status",
            "completed_time",
            "updated_at",
        ]
    )

    # Optionally update patient's next follow-up date.
    next_followup = data.get("next_followup_date")
    if next_followup:
        Patient.objects.filter(id=session.patient_id).update(
            next_followup_date=next_followup
        )

    logger.info(
        "DISPENSE: %s | patient=%s | amount=%s | items=%d | by=%s",
        invoice.invoice_number,
        invoice.patient.file_number,
        invoice.net_payable,
        len(line_items),
        getattr(user, "full_name", "?"),
    )
    return invoice


# ────────────────────────────────────────────────────────────
# Cancel (pharmacist-only)
# ────────────────────────────────────────────────────────────


@transaction.atomic
def cancel_dispense_for_session(*, session_id, reason: str, user) -> DispenseInvoice:
    """Pharmacist marks the visit's prescription as cancelled.

    If a DispenseInvoice already exists for the session, it is flipped to
    cancelled with net_payable = 0 and stock is restored.

    If no DispenseInvoice exists yet (pharmacist cancels before any save),
    a zero-amount cancelled record is created so the visit has a
    1:1 link to a pharmacy outcome.

    The linked VisitSession transitions to completed in either case.
    """
    try:
        session = (
            VisitSession.objects.select_related("patient")
            .select_for_update()
            .get(id=session_id)
        )
    except VisitSession.DoesNotExist:
        raise serializers.ValidationError("Visit session not found.")

    now = timezone.now()
    existing = (
        DispenseInvoice.objects.select_for_update()
        .filter(visit_session=session)
        .first()
    )

    if existing is not None:
        if existing.status == DispenseStatus.CANCELLED:
            raise ConflictError("Dispense invoice is already cancelled.")

        # Restore stock for every line item before zeroing out.
        for item in existing.items.select_related("batch", "medicine"):
            batch = (
                MedicineBatch.objects.select_for_update().get(id=item.batch_id)
            )
            qty_before = batch.quantity
            batch.quantity = qty_before + item.quantity
            if not batch.is_active and batch.quantity > 0:
                batch.is_active = True
            batch.save(update_fields=["quantity", "is_active", "updated_at"])

            _log_stock_movement(
                medicine=item.medicine,
                batch=batch,
                movement_type=MovementType.ADJUSTMENT,
                quantity_change=item.quantity,
                quantity_before=qty_before,
                quantity_after=batch.quantity,
                reference_type="dispenseinvoice",
                reference_id=existing.id,
                performed_by=user,
                notes=f"cancel: {reason[:200]}",
            )

        existing.status = DispenseStatus.CANCELLED
        existing.net_payable = Decimal("0")
        existing.cash_amount = Decimal("0")
        existing.online_amount = Decimal("0")
        existing.cancelled_at = now
        existing.cancelled_by = user
        existing.cancel_reason = reason
        existing.save(
            update_fields=[
                "status",
                "net_payable",
                "cash_amount",
                "online_amount",
                "cancelled_at",
                "cancelled_by",
                "cancel_reason",
                "updated_at",
            ]
        )
        invoice = existing
    else:
        if session.current_stage != VisitStage.PHARMACY:
            raise serializers.ValidationError(
                "Cancellation is only allowed while the visit is at the pharmacy stage."
            )
        invoice = DispenseInvoice.objects.create(
            invoice_number=DispenseInvoice.generate_invoice_number(),
            visit_session=session,
            patient=session.patient,
            dispensed_by=user,
            dispense_date=timezone.localdate(),
            subtotal=Decimal("0"),
            discount_percentage=Decimal("0"),
            discount_amount=Decimal("0"),
            net_payable=Decimal("0"),
            payment_method=PaymentMethod.CASH,
            cash_amount=Decimal("0"),
            online_amount=Decimal("0"),
            status=DispenseStatus.CANCELLED,
            cancelled_at=now,
            cancelled_by=user,
            cancel_reason=reason,
        )

    session.medicines_total = Decimal("0")
    session.current_stage = VisitStage.COMPLETED
    session.status = VisitStatus.CANCELLED
    if session.completed_time is None:
        session.completed_time = now
    session.save(
        update_fields=[
            "medicines_total",
            "current_stage",
            "status",
            "completed_time",
            "updated_at",
        ]
    )

    logger.info(
        "DISPENSE_CANCEL: %s | session=%s | reason=%s | by=%s",
        invoice.invoice_number,
        session.visit_uid,
        reason,
        getattr(user, "full_name", "?"),
    )
    return invoice
