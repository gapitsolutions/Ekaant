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

from django.core.files.base import ContentFile
from django.utils.text import get_valid_filename
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers

from billing import services as billing_services
from core.exceptions import ConflictError
from patients.models import Patient
from visits.models import VisitSession, VisitStage, VisitStatus

from .models import (
    DispenseInvoice,
    DispenseInvoiceAmendment,
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
from .serializers import ALLOWED_PURCHASE_INVOICE_DOCUMENT_MIME_TYPES

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


def _purchase_invoice_document_filename(data: dict, invoice: PurchaseInvoice) -> str:
    mime_type = data.get("invoice_document_mime_type") or data.get(
        "invoice_photo_mime_type"
    )
    extension = ALLOWED_PURCHASE_INVOICE_DOCUMENT_MIME_TYPES.get(mime_type, "bin")
    raw_name = (data.get("invoice_document_filename") or "").strip()
    if raw_name:
        stem = get_valid_filename(raw_name.rsplit(".", 1)[0]) or "invoice-document"
    else:
        stem = get_valid_filename(invoice.invoice_number) or "invoice-document"
    return f"{stem}.{extension}"


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
            order_date=data["order_date"],
            invoice_date=data["invoice_date"],
            delivery_date=data.get("delivery_date"),
            notes=data.get("notes", ""),
            created_by=user,
        )
    except IntegrityError as exc:
        # Race: the pre-check above lost to a concurrent insert of the same
        # invoice_number. Surface the same 409 envelope the pre-check uses.
        raise ConflictError("Invoice number already exists.") from exc

    document_bytes = data.get("_decoded_invoice_document")
    if document_bytes:
        invoice.invoice_photo.save(
            _purchase_invoice_document_filename(data, invoice),
            ContentFile(document_bytes),
            save=False,
        )
        invoice.save(update_fields=["invoice_photo", "updated_at"])

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

        # Auto-track the supplier on the medicine's M2M for inventory
        # display. ``.add()`` is idempotent — a no-op if the link already
        # exists, so repeat invoices from the same supplier don't bloat the
        # through table. Runs inside the outer @transaction.atomic, so a
        # downstream failure rolls this back with the rest of the invoice.
        medicine.suppliers.add(supplier)

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
# Medicine bulk import (CSV)
# ────────────────────────────────────────────────────────────


def active_medicine_exists(
    *, name: str, category: str, bup_category, exclude_pk=None
) -> bool:
    """Return True if an *active* medicine already matches the uniqueness key
    ``(name, category, bup_category)``.

    This is the application-level guard relied on by both single-create and
    bulk-import. It is necessary (not just a convenience) because the DB
    ``UniqueConstraint`` is a **partial** index and PostgreSQL treats NULLs as
    distinct — so for non-BUP medicines (``bup_category IS NULL``) the DB
    constraint never fires and would otherwise allow silent duplicates. The
    ORM ``bup_category=None`` lookup compiles to ``IS NULL`` and matches
    correctly. ``exclude_pk`` lets callers ignore the row being updated.
    """
    qs = Medicine.objects.filter(
        is_active=True,
        name=name,
        category=category,
        bup_category=bup_category,
    )
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    return qs.exists()


def _flatten_serializer_errors(errors) -> list[str]:
    """Flatten DRF ``serializer.errors`` into ``"field: message"`` strings so
    the frontend review grid can show readable, row-level reasons."""
    messages: list[str] = []
    if isinstance(errors, dict):
        for field, errs in errors.items():
            prefix = "" if field == "non_field_errors" else f"{field}: "
            if isinstance(errs, (list, tuple)):
                messages.extend(f"{prefix}{err}" for err in errs)
            else:
                messages.append(f"{prefix}{errs}")
    elif isinstance(errors, (list, tuple)):
        messages.extend(str(err) for err in errors)
    else:
        messages.append(str(errors))
    return messages


def bulk_create_medicines(*, rows: list[dict], user) -> dict:
    """Create medicines in bulk, returning per-row outcomes.

    Reuses :class:`MedicineWriteSerializer` for per-row validation and
    business rules (BUP↔strength, selling_price ≤ mrp, …) so bulk import is
    consistent with single-medicine creation — no duplicated logic.

    Product behaviour (confirmed with the client):

    * **Duplicates** — a row matching an existing *active* medicine on
      ``(name, category, bup_category)`` (the model's unique key) is
      **skipped** (never modified) and reported.
    * **Partial success** — valid, non-duplicate rows are committed even when
      sibling rows fail; failures come back with row-level reasons. Each row
      is saved inside its own savepoint, so one failure can't roll back the
      successful rows.
    """
    # Local import avoids any import-order coupling at module load.
    from .serializers import MedicineWriteSerializer

    created: list[dict] = []
    skipped: list[dict] = []
    errors: list[dict] = []

    for idx, raw in enumerate(rows):
        # 1-based row number that matches the CSV data row shown in the review
        # grid. The frontend forwards it; fall back to positional index.
        row_number = raw.get("row_number") or (idx + 1)
        payload = {k: v for k, v in raw.items() if k != "row_number"}

        serializer = MedicineWriteSerializer(data=payload)
        if not serializer.is_valid():
            errors.append(
                {
                    "row_number": row_number,
                    "errors": _flatten_serializer_errors(serializer.errors),
                }
            )
            continue

        data = serializer.validated_data
        name = data["name"]
        category = data["category"]
        bup_category = data.get("bup_category")

        if active_medicine_exists(
            name=name, category=category, bup_category=bup_category
        ):
            skipped.append(
                {
                    "row_number": row_number,
                    "name": name,
                    "reason": "Already exists — an active medicine with the same name, category and strength is registered.",
                }
            )
            continue

        try:
            with transaction.atomic():
                medicine = serializer.save(created_by=user, updated_by=user)
        except IntegrityError:
            # Lost a race to a concurrent insert of the same unique key.
            skipped.append(
                {
                    "row_number": row_number,
                    "name": name,
                    "reason": "Already exists (created concurrently).",
                }
            )
            continue

        created.append(
            {"row_number": row_number, "id": str(medicine.id), "name": medicine.name}
        )

    logger.info(
        "MEDICINE_BULK_IMPORT: created=%d skipped=%d failed=%d (by %s)",
        len(created),
        len(skipped),
        len(errors),
        getattr(user, "email", user),
    )

    return {
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "summary": {
            "total": len(rows),
            "created": len(created),
            "skipped": len(skipped),
            "failed": len(errors),
        },
    }


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


def _build_payment_totals(
    line_items: list[dict],
    payment: dict,
    consultation_fee: Decimal = Decimal("0"),
) -> dict:
    """Compute authoritative invoice totals on the server.

    Money policy:
    - ``discount`` arrives as a rupee AMOUNT (2 dp) against the medicine
      subtotal. The server is the sole authority for ``net_payable``; the
      frontend's displayed total is never trusted for persistence.
    - ``consultation_fee`` is added on top:
      ``net_payable = subtotal − discount + consultation_fee`` (the BILLED
      amount).
    - ``cash_amount`` / ``online_amount`` are the amounts ACTUALLY TENDERED at
      this settlement (not derived from net_payable). Their sum, ``amount_paid``,
      may be **less** than net_payable — the shortfall becomes patient
      outstanding — or **more**, when the patient also pays down previously
      outstanding dues in the same settlement (recovery). The
      "cash + online must equal net payable" rule is intentionally gone.
    - For Cash, the online leg is zeroed; for Online, the cash leg is zeroed;
      for Split, both are taken as supplied. The upper bound (can't pay more
      than total owed) is enforced by the caller, which knows the patient's
      prior due.
    - ``discount_percentage`` is DERIVED from the amount purely for
      storage/reporting; it never drives the math.
    """
    # Quantize each unit price first so the per-line totals persisted later
    # (also computed with _q2 per line) reconcile exactly with the subtotal.
    subtotal = _q2(
        sum(
            (Decimal(item["qty"]) * _q2(item["unit_price"]) for item in line_items),
            Decimal("0"),
        )
    )

    discount_amount = _q2(payment.get("discount", 0) or 0)
    if discount_amount < Decimal("0"):
        raise serializers.ValidationError("Discount cannot be negative.")
    if discount_amount > subtotal:
        raise serializers.ValidationError("Discount cannot exceed the subtotal.")

    consultation_fee = _q2(consultation_fee or 0)
    if consultation_fee < Decimal("0"):
        raise serializers.ValidationError("Consultation fee cannot be negative.")

    net_payable = _q2(subtotal - discount_amount + consultation_fee)

    # Derived percentage (storage/reporting only). Bounded 0–100 by the
    # discount<=subtotal check above, satisfying the model check constraint.
    discount_pct = (
        _q2(discount_amount / subtotal * Decimal("100"))
        if subtotal > Decimal("0")
        else Decimal("0")
    )

    method = payment["payment_method"]
    cash = _q2(payment.get("cash_amount", 0) or 0)
    online = _q2(payment.get("online_amount", 0) or 0)
    if method == PaymentMethod.CASH:
        online = Decimal("0")
    elif method == PaymentMethod.ONLINE:
        cash = Decimal("0")
    # SPLIT: both legs taken as supplied.

    if cash < Decimal("0") or online < Decimal("0"):
        raise serializers.ValidationError("Payment amounts cannot be negative.")

    amount_paid = _q2(cash + online)

    return {
        "subtotal": subtotal,
        "consultation_fee": consultation_fee,
        "discount_percentage": discount_pct,
        "discount_amount": discount_amount,
        "net_payable": net_payable,
        "cash_amount": _q2(cash),
        "online_amount": _q2(online),
        "amount_paid": amount_paid,
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

    # Consultation fee: explicit value from the client, else the configured
    # hospital default. Snapshotted onto the invoice so later config changes
    # never rewrite this invoice.
    consultation_fee = data.get("consultation_fee")
    if consultation_fee is None:
        consultation_fee = billing_services.get_default_consultation_fee()

    totals = _build_payment_totals(line_items, payment, consultation_fee)

    # Underpayment is allowed (shortfall → outstanding), and the patient may
    # also pay down PRIOR dues here (recovery). What's not allowed is paying
    # more than the grand total owed (current invoice + prior balance), which
    # would create an unexpected credit.
    previous_due = billing_services.current_outstanding(session.patient_id)
    prior_owed = previous_due if previous_due > Decimal("0") else Decimal("0")
    total_payable = _q2(totals["net_payable"] + prior_owed)
    if totals["amount_paid"] > total_payable + Decimal("0.01"):
        raise serializers.ValidationError(
            "Amount paid cannot exceed the total payable "
            f"(current ₹{totals['net_payable']} + previous due ₹{prior_owed})."
        )

    try:
        invoice = DispenseInvoice.objects.create(
            invoice_number=DispenseInvoice.generate_invoice_number(),
            visit_session=session,
            patient=session.patient,
            dispensed_by=user,
            dispense_date=timezone.localdate(),
            subtotal=totals["subtotal"],
            consultation_fee=totals["consultation_fee"],
            discount_percentage=totals["discount_percentage"],
            discount_amount=totals["discount_amount"],
            net_payable=totals["net_payable"],
            amount_paid=totals["amount_paid"],
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

    # Post the financial ledger: charge (+net_payable) and payment
    # (-amount_paid). Any shortfall raises the patient's outstanding; any
    # excess pays down prior dues. Refreshes the cached Patient.outstanding_debt.
    billing_services.post_invoice_charge_and_payment(
        invoice=invoice, amount_paid=totals["amount_paid"], user=user
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
        existing.consultation_fee = Decimal("0")
        existing.amount_paid = Decimal("0")
        existing.cash_amount = Decimal("0")
        existing.online_amount = Decimal("0")
        existing.cancelled_at = now
        existing.cancelled_by = user
        existing.cancel_reason = reason
        existing.save(
            update_fields=[
                "status",
                "net_payable",
                "consultation_fee",
                "amount_paid",
                "cash_amount",
                "online_amount",
                "cancelled_at",
                "cancelled_by",
                "cancel_reason",
                "updated_at",
            ]
        )
        # Reverse this invoice's entire ledger impact so the patient is no
        # longer charged for a voided dispense (append-only adjustment row).
        billing_services.reverse_invoice_entries(
            invoice=existing, user=user, reason=f"Cancelled: {reason[:200]}"
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


# ────────────────────────────────────────────────────────────
# Amend (post-dispense correction, pharmacist-only)
# ────────────────────────────────────────────────────────────


def _amendment_snapshot(invoice: DispenseInvoice, old_items) -> dict:
    """JSON-safe snapshot of the invoice exactly as it was pre-amendment."""
    return {
        "items": [
            {
                "medicine_id": str(item.medicine_id),
                "medicine_name": item.medicine_name,
                "salt": item.salt,
                "category": item.category,
                "batch_number": item.batch_number,
                "expiry_date": str(item.expiry_date),
                "dose": item.dose,
                "days": item.days,
                "quantity": item.quantity,
                "unit_price": str(item.unit_price),
                "total": str(item.total),
            }
            for item in old_items
        ],
        "subtotal": str(invoice.subtotal),
        "consultation_fee": str(invoice.consultation_fee),
        "discount_percentage": str(invoice.discount_percentage),
        "discount_amount": str(invoice.discount_amount),
        "net_payable": str(invoice.net_payable),
        "amount_paid": str(invoice.amount_paid),
        "payment_method": invoice.payment_method,
        "cash_amount": str(invoice.cash_amount),
        "online_amount": str(invoice.online_amount),
        "notes": invoice.notes,
        "next_followup_date": (
            str(invoice.next_followup_date) if invoice.next_followup_date else None
        ),
    }


@transaction.atomic
def amend_dispense_for_session(*, session_id, data: dict, user) -> DispenseInvoice:
    """Correct a successful dispense invoice in place (revert-then-reapply).

    The invoice and its line items are updated; the StockMovement ledger is
    NEVER rewritten — the amendment appends an ``adjustment`` row restoring
    each old item, then fresh ``dispense`` rows for the new items, so the
    before/after quantity chain stays unbroken and the correction is
    explicitly narrated in the ledger. The pre-amendment state is snapshot
    into the append-only ``DispenseInvoiceAmendment`` table.

    Lock order mirrors ``cancel_dispense_for_session`` (session → invoice →
    batches) so a concurrent amend and cancel cannot deadlock.
    """
    reason = data["amend_reason"]
    line_items = data["line_items"]
    payment = data["payment"]

    try:
        session = (
            VisitSession.objects.select_related("patient")
            .select_for_update()
            .get(id=session_id)
        )
    except VisitSession.DoesNotExist:
        raise serializers.ValidationError("Visit session not found.")

    invoice = (
        DispenseInvoice.objects.select_for_update()
        .filter(visit_session=session)
        .first()
    )
    if invoice is None:
        raise serializers.ValidationError(
            "No dispense invoice exists for this visit."
        )
    if invoice.status == DispenseStatus.CANCELLED:
        raise ConflictError(
            "Cannot amend a cancelled invoice. Re-dispense is not supported."
        )

    old_items = list(invoice.items.select_related("medicine"))

    # Per-batch totals of the ORIGINAL invoice. Basis for the expiry
    # exemption below: re-applying a batch the patient already received,
    # at up to its original quantity, must not be blocked just because the
    # batch expired between dispense and correction — no *new* stock leaves
    # the shelf in that case.
    original_batch_qty: dict = defaultdict(int)
    for item in old_items:
        original_batch_qty[item.batch_id] += item.quantity

    # Resolve new line items (existence checks only — stock/expiry checks
    # run after locking).
    medicine_cache: dict[str, Medicine] = {}
    batch_cache: dict[tuple[str, str], MedicineBatch] = {}
    resolved: list[dict] = []
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
            # No ``is_active=True`` filter here (unlike create): a batch the
            # original invoice fully depleted is inactive right now, but the
            # revert below restores its stock and reactivates it.
            try:
                batch_cache[key] = MedicineBatch.objects.get(
                    medicine=medicine, batch_number=raw["batch_number"]
                )
            except MedicineBatch.DoesNotExist:
                raise serializers.ValidationError(
                    f"Batch {raw['batch_number']} not found for medicine {medicine.name}."
                )
        resolved.append(
            {"medicine": medicine, "batch": batch_cache[key], "raw": raw}
        )

    # Lock the union of old + new batches in deterministic order.
    all_batch_ids = sorted(
        {item.batch_id for item in old_items}
        | {entry["batch"].id for entry in resolved},
    )
    locked_batches = {
        b.id: b
        for b in MedicineBatch.objects.select_for_update()
        .filter(id__in=all_batch_ids)
        .order_by("id")
    }

    # Snapshot BEFORE any mutation.
    snapshot = _amendment_snapshot(invoice, old_items)

    # ── Revert: restore stock for every original item ──
    for item in old_items:
        batch = locked_batches[item.batch_id]
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
            reference_id=invoice.id,
            performed_by=user,
            notes=f"amend revert: {reason[:200]}",
        )

    invoice.items.all().delete()

    # ── Validate new items against post-revert stock ──
    today = timezone.localdate()
    new_batch_totals: dict = defaultdict(int)
    for entry in resolved:
        new_batch_totals[entry["batch"].id] += int(entry["raw"]["qty"])

    for batch_id, total_qty in new_batch_totals.items():
        batch = locked_batches[batch_id]
        if batch.expiry_date < today and total_qty > original_batch_qty.get(
            batch_id, 0
        ):
            raise serializers.ValidationError(
                f"Batch {batch.batch_number} is expired; quantity can be "
                f"reduced but not increased beyond the originally dispensed "
                f"{original_batch_qty.get(batch_id, 0)}."
            )
        if batch.quantity < total_qty:
            raise ConflictError(
                f"Insufficient stock for batch {batch.batch_number}. "
                f"Available: {batch.quantity}, Requested: {total_qty}"
            )

    # Preserve the invoice's existing consultation fee unless the client
    # explicitly supplies a new value in the amendment.
    consultation_fee = data.get("consultation_fee")
    if consultation_fee is None:
        consultation_fee = invoice.consultation_fee
    totals = _build_payment_totals(line_items, payment, consultation_fee)

    # Re-base the ledger: reverse this invoice's prior charge/payment impact,
    # then validate the new tendered amount against the patient's remaining
    # (prior) due + the amended net. Both happen inside the atomic block, so a
    # validation failure rolls the reversal back too.
    billing_services.reverse_invoice_entries(
        invoice=invoice, user=user, reason=f"Amend re-base: {reason[:180]}"
    )
    previous_due = billing_services.current_outstanding(session.patient_id)
    prior_owed = previous_due if previous_due > Decimal("0") else Decimal("0")
    total_payable = _q2(totals["net_payable"] + prior_owed)
    if totals["amount_paid"] > total_payable + Decimal("0.01"):
        raise serializers.ValidationError(
            "Amount paid cannot exceed the total payable "
            f"(amended ₹{totals['net_payable']} + previous due ₹{prior_owed})."
        )

    # ── Reapply: create new items, deduct stock, log dispense rows ──
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
            notes=(
                f"{session.patient_id} | amend"
                if medicine.category == "BUP"
                else "amend"
            ),
        )

    # ── Update invoice money fields + metadata ──
    invoice.subtotal = totals["subtotal"]
    invoice.consultation_fee = totals["consultation_fee"]
    invoice.discount_percentage = totals["discount_percentage"]
    invoice.discount_amount = totals["discount_amount"]
    invoice.net_payable = totals["net_payable"]
    invoice.amount_paid = totals["amount_paid"]
    invoice.payment_method = payment["payment_method"]
    invoice.cash_amount = totals["cash_amount"]
    invoice.online_amount = totals["online_amount"]
    invoice.notes = payment.get("notes", "") or ""
    if "next_followup_date" in data:
        invoice.next_followup_date = data.get("next_followup_date")
    invoice.save(
        update_fields=[
            "subtotal",
            "consultation_fee",
            "discount_percentage",
            "discount_amount",
            "net_payable",
            "amount_paid",
            "payment_method",
            "cash_amount",
            "online_amount",
            "notes",
            "next_followup_date",
            "updated_at",
        ]
    )

    # Post the amended charge/payment to the ledger and refresh the cache.
    billing_services.post_invoice_charge_and_payment(
        invoice=invoice, amount_paid=totals["amount_paid"], user=user
    )

    # Keep the visit's denormalised total in sync (drives reception
    # check-in history and reports).
    session.medicines_total = totals["net_payable"]
    session.save(update_fields=["medicines_total", "updated_at"])

    next_followup = data.get("next_followup_date")
    if next_followup:
        Patient.objects.filter(id=session.patient_id).update(
            next_followup_date=next_followup
        )

    DispenseInvoiceAmendment.objects.create(
        invoice=invoice,
        amended_by=user,
        reason=reason,
        previous_state=snapshot,
    )

    logger.info(
        "DISPENSE_AMEND: %s | session=%s | reason=%s | new_amount=%s | by=%s",
        invoice.invoice_number,
        session.visit_uid,
        reason,
        invoice.net_payable,
        getattr(user, "full_name", "?"),
    )
    return invoice
