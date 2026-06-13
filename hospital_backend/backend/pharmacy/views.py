"""HTTP views for the pharmacy module.

Each view is thin — validation lives in serializers, transactional writes
in services. Read endpoints query directly because they don't mutate state.
"""

import mimetypes
from datetime import datetime, timedelta
from decimal import Decimal

from django.db import IntegrityError
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.views import APIView

from core.exceptions import ConflictError
from core.pagination import paginate_queryset
from core.permissions import IsPharmacistOrAdmin, IsReceptionAdminOrPharmacist
from core.responses import success_response
from visits.models import VisitSession, VisitStage, VisitStatus

from . import services
from .models import (
    DispenseInvoice,
    DispenseInvoiceItem,
    DispenseStatus,
    Medicine,
    MedicineBatch,
    MedicineCategory,
    PaymentMethod,
    PurchaseInvoice,
    Supplier,
)
from .serializers import (
    AuditRemovalCreateSerializer,
    DispenseAmendSerializer,
    DispenseCancelSerializer,
    DispenseCreateSerializer,
    DispenseInvoiceListItemSerializer,
    MedicineBulkImportSerializer,
    MedicineDeleteSerializer,
    MedicineReadSerializer,
    MedicineWriteSerializer,
    PurchaseInvoiceCreateSerializer,
    SupplierEmbeddedSerializer,
    SupplierReadSerializer,
    SupplierWriteSerializer,
)


NEAR_EXPIRY_DAYS = 180


def _purchase_invoice_document_url(invoice: PurchaseInvoice, request) -> str | None:
    if not invoice.invoice_photo:
        return None
    path = reverse(
        "pharmacy-purchase-invoice-document",
        kwargs={"invoice_id": invoice.pk},
    )
    return request.build_absolute_uri(path) if request else path


# ────────────────────────────────────────────────────────────
# Supplier CRUD
# ────────────────────────────────────────────────────────────


def _supplier_queryset_with_invoice_count():
    return Supplier.objects.annotate(
        _invoice_count=Count("purchase_invoices", distinct=True)
    )


class SupplierListCreateView(APIView):
    """List + create suppliers.

    GET is broadly readable (reception + pharmacy + admin) so any supplier
    selector across the app can populate without a role escalation; POST is
    pharmacist/admin only since it mutates the master data.
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsReceptionAdminOrPharmacist()]
        return [IsPharmacistOrAdmin()]

    def get(self, request):
        queryset = _supplier_queryset_with_invoice_count().order_by("company_name")

        q = (request.query_params.get("q") or "").strip()
        if q:
            # Search company / contact / GST / drug license / mobile.
            queryset = queryset.filter(
                Q(company_name__icontains=q)
                | Q(contact_person__icontains=q)
                | Q(gst_number__icontains=q)
                | Q(drug_license_number__icontains=q)
                | Q(mobile_number__icontains=q)
            )

        is_active_raw = (request.query_params.get("is_active") or "").strip().lower()
        if is_active_raw in {"true", "1", "yes"}:
            queryset = queryset.filter(is_active=True)
        elif is_active_raw in {"false", "0", "no"}:
            queryset = queryset.filter(is_active=False)

        category = (request.query_params.get("category") or "").strip()
        if category:
            if category not in set(MedicineCategory.values):
                raise drf_serializers.ValidationError(
                    {"category": f"Unknown category '{category}'."}
                )
            queryset = queryset.filter(categories__contains=[category])

        try:
            page = int(request.query_params.get("page", 1))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get("pageSize", 50))
        except (TypeError, ValueError):
            page_size = 50

        paginated_queryset, pagination = paginate_queryset(queryset, page, page_size)
        items = SupplierReadSerializer(paginated_queryset, many=True).data
        return success_response({"items": items, "pagination": pagination})

    def post(self, request):
        serializer = SupplierWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            supplier = serializer.save(created_by=request.user, updated_by=request.user)
        except IntegrityError as exc:
            # Race vs. validate_company_name's case-insensitive uniqueness check.
            raise ConflictError(
                "A supplier with this company name already exists."
            ) from exc
        # Re-fetch with annotation so the response shape matches list rows.
        annotated = _supplier_queryset_with_invoice_count().get(pk=supplier.pk)
        return success_response(
            SupplierReadSerializer(annotated).data,
            status_code=status.HTTP_201_CREATED,
        )


class SupplierDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [IsReceptionAdminOrPharmacist()]
        return [IsPharmacistOrAdmin()]

    def _get(self, pk):
        return get_object_or_404(_supplier_queryset_with_invoice_count(), pk=pk)

    def get(self, request, supplier_id):
        supplier = self._get(supplier_id)
        return success_response(SupplierReadSerializer(supplier).data)

    def patch(self, request, supplier_id):
        supplier = self._get(supplier_id)
        serializer = SupplierWriteSerializer(
            supplier, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save(updated_by=request.user)
        except IntegrityError as exc:
            raise ConflictError(
                "A supplier with this company name already exists."
            ) from exc
        annotated = _supplier_queryset_with_invoice_count().get(pk=supplier.pk)
        return success_response(SupplierReadSerializer(annotated).data)

    def delete(self, request, supplier_id):
        """Soft-delete: flip ``is_active`` to False.

        We never hard-delete: PROTECT on PurchaseInvoice.supplier would refuse
        anyway when the supplier has invoices, and deactivation preserves the
        historical relationship while removing the supplier from active
        dropdowns/lists.
        """
        supplier = self._get(supplier_id)
        if supplier.is_active:
            supplier.is_active = False
            supplier.updated_by = request.user
            supplier.save(update_fields=["is_active", "updated_by", "updated_at"])
        return success_response(
            {
                "deactivated": True,
                "supplier_id": str(supplier.pk),
                "is_active": supplier.is_active,
            }
        )


# ────────────────────────────────────────────────────────────
# Medicine CRUD
# ────────────────────────────────────────────────────────────


class MedicineListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [IsReceptionAdminOrPharmacist()]
        return [IsPharmacistOrAdmin()]

    def get(self, request):
        queryset = (
            Medicine.objects.filter(is_active=True)
            .prefetch_related("batches", "suppliers")
            .order_by("name")
        )

        category = (request.query_params.get("category") or "").strip()
        bup_category = (request.query_params.get("bup_category") or "").strip()
        search = (request.query_params.get("search") or "").strip()

        if category:
            queryset = queryset.filter(category=category)
        if bup_category:
            queryset = queryset.filter(bup_category=bup_category)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(salt__icontains=search)
            )

        items = MedicineReadSerializer(queryset, many=True).data
        return success_response({"items": items, "total": len(items)})

    def post(self, request):
        serializer = MedicineWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        medicine = serializer.save(created_by=request.user, updated_by=request.user)
        return success_response(
            MedicineReadSerializer(medicine).data,
            status_code=status.HTTP_201_CREATED,
        )


class MedicineBulkImportView(APIView):
    """Bulk-create medicines from a parsed CSV (Inventory → Import Medicines).

    Validation/business rules are reused per row from ``MedicineWriteSerializer``
    via the service. Returns a per-row report (created / skipped / failed)
    rather than a single resource, so it responds 200 with the report body
    regardless of the mix of outcomes.
    """

    permission_classes = [IsPharmacistOrAdmin]

    def post(self, request):
        serializer = MedicineBulkImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.bulk_create_medicines(
            rows=serializer.validated_data["items"], user=request.user
        )
        return success_response(result)


class MedicineDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [IsReceptionAdminOrPharmacist()]
        return [IsPharmacistOrAdmin()]

    def _get_medicine(self, pk):
        return get_object_or_404(Medicine, pk=pk)

    def get(self, request, pk):
        return success_response(MedicineReadSerializer(self._get_medicine(pk)).data)

    def patch(self, request, pk):
        medicine = self._get_medicine(pk)
        serializer = MedicineWriteSerializer(
            medicine, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        medicine = serializer.save(updated_by=request.user)
        return success_response(MedicineReadSerializer(medicine).data)

    def delete(self, request, pk):
        medicine = self._get_medicine(pk)
        serializer = MedicineDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        medicine.is_active = False
        medicine.deletion_reason = serializer.validated_data["reason"]
        medicine.deletion_notes = serializer.validated_data.get("notes", "")
        medicine.updated_by = request.user
        medicine.save(
            update_fields=[
                "is_active",
                "deletion_reason",
                "deletion_notes",
                "updated_by",
                "updated_at",
            ]
        )
        return success_response({"deleted": True, "medicine_id": str(medicine.id)})


# ────────────────────────────────────────────────────────────
# Inventory Stats
# ────────────────────────────────────────────────────────────


class InventoryStatsView(APIView):
    permission_classes = [IsReceptionAdminOrPharmacist]

    def get(self, request):
        today = timezone.localdate()

        total_medicines = Medicine.objects.filter(is_active=True).count()

        # Aggregate stock per medicine for low-stock comparison
        stock_per_medicine = (
            Medicine.objects.filter(is_active=True)
            .annotate(
                current_stock=Coalesce(
                    Sum("batches__quantity", filter=Q(batches__is_active=True)),
                    0,
                )
            )
        )
        low_stock_count = stock_per_medicine.filter(
            current_stock__lte=F("reorder_level")
        ).count()

        active_batches = MedicineBatch.objects.filter(
            is_active=True, medicine__is_active=True
        )
        expired_count = active_batches.filter(expiry_date__lt=today).count()
        near_expiry_count = active_batches.filter(
            expiry_date__gte=today,
            expiry_date__lte=today + timedelta(days=NEAR_EXPIRY_DAYS),
        ).count()

        total_stock_value = (
            active_batches.aggregate(
                value=Coalesce(
                    Sum(F("quantity") * F("medicine__selling_price")),
                    Decimal("0"),
                )
            )["value"]
            or Decimal("0")
        )

        todays_dispenses = DispenseInvoice.objects.filter(
            dispense_date=today, status=DispenseStatus.SUCCESS
        )
        # Single aggregate query — pulls both revenue and count in one round-trip.
        todays_dispense_agg = todays_dispenses.aggregate(
            revenue=Coalesce(Sum("net_payable"), Decimal("0")),
            count=Count("pk"),
        )
        todays_revenue = todays_dispense_agg["revenue"] or Decimal("0")
        dispensed_today_count = todays_dispense_agg["count"] or 0

        return success_response(
            {
                "total_medicines": total_medicines,
                "low_stock_count": low_stock_count,
                "near_expiry_count": near_expiry_count,
                "expired_count": expired_count,
                "total_stock_value": total_stock_value,
                "todays_revenue": todays_revenue,
                "dispensed_today_count": dispensed_today_count,
            }
        )


# ────────────────────────────────────────────────────────────
# Purchase Invoice + Audit Removal
# ────────────────────────────────────────────────────────────


class PurchaseInvoiceCreateView(APIView):
    permission_classes = [IsPharmacistOrAdmin]

    def post(self, request):
        serializer = PurchaseInvoiceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = services.process_purchase_invoice(
            data=serializer.validated_data, user=request.user
        )
        return success_response(
            {
                "id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "order_date": invoice.order_date,
                "invoice_date": invoice.invoice_date,
                "delivery_date": invoice.delivery_date,
                "supplier": SupplierEmbeddedSerializer.from_supplier(
                    invoice.supplier
                ),
                "items_loaded": invoice.items_count,
                "total_amount": invoice.total_amount,
                "invoice_document_url": _purchase_invoice_document_url(
                    invoice, request
                ),
            },
            status_code=status.HTTP_201_CREATED,
        )


class PurchaseInvoiceDocumentView(APIView):
    permission_classes = [IsPharmacistOrAdmin]

    def get(self, request, invoice_id):
        invoice = get_object_or_404(PurchaseInvoice, pk=invoice_id)
        if not invoice.invoice_photo:
            raise drf_serializers.ValidationError(
                "No invoice document is attached to this purchase invoice."
            )

        content_type = (
            mimetypes.guess_type(invoice.invoice_photo.name)[0]
            or "application/octet-stream"
        )
        return FileResponse(
            invoice.invoice_photo.open("rb"),
            content_type=content_type,
            as_attachment=content_type == "application/pdf",
            filename=invoice.invoice_photo.name.rsplit("/", 1)[-1],
        )


class AuditStockRemovalView(APIView):
    permission_classes = [IsPharmacistOrAdmin]

    def post(self, request):
        serializer = AuditRemovalCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        removal = services.process_audit_removal(
            data=serializer.validated_data, user=request.user
        )
        return success_response(
            {
                "id": str(removal.id),
                "medicine_id": str(removal.medicine_id),
                "batch_number": removal.batch_number,
                "quantity_removed": removal.quantity_removed,
                "reason": removal.reason,
            },
            status_code=status.HTTP_201_CREATED,
        )


# ────────────────────────────────────────────────────────────
# Product Dispense History
# ────────────────────────────────────────────────────────────


class ProductDispenseHistoryView(APIView):
    permission_classes = [IsReceptionAdminOrPharmacist]

    def get(self, request, pk):
        medicine = get_object_or_404(Medicine, pk=pk)
        items_qs = (
            DispenseInvoiceItem.objects.select_related(
                "dispense_invoice", "dispense_invoice__patient"
            )
            .filter(
                medicine=medicine,
                dispense_invoice__status=DispenseStatus.SUCCESS,
            )
            .order_by("-dispense_invoice__dispense_date", "-created_at")
        )

        month = (request.query_params.get("month") or "").strip()
        date_filter = (request.query_params.get("date") or "").strip()
        if date_filter:
            items_qs = items_qs.filter(
                dispense_invoice__dispense_date=date_filter
            )
        elif month:
            try:
                year_part, month_part = month.split("-")
                items_qs = items_qs.filter(
                    dispense_invoice__dispense_date__year=int(year_part),
                    dispense_invoice__dispense_date__month=int(month_part),
                )
            except (ValueError, IndexError):
                raise drf_serializers.ValidationError("month must be YYYY-MM")

        total_quantity = (
            items_qs.aggregate(t=Coalesce(Sum("quantity"), 0))["t"] or 0
        )

        items = [
            {
                "id": str(item.id),
                # ``dispense_time`` is the real per-invoice timestamp
                # (``DispenseInvoice.dispense_time`` — ``auto_now_add``).
                # The earlier ``dispense_date`` field was a pure ``date``
                # which made every row render the same midnight time on
                # the frontend. Callers needing the date alone can derive
                # it from this datetime.
                "dispense_time": item.dispense_invoice.dispense_time,
                "patient_name": item.dispense_invoice.patient.full_name,
                # Human-facing identifier; replaces the previous
                # ``patient_id`` (UUID) which leaked the internal PK into
                # the table view and CSV export.
                "file_number": item.dispense_invoice.patient.file_number,
                "batch_number": item.batch_number,
                "expiry_date": item.expiry_date,
                "quantity": item.quantity,
                "total_price": item.total,
            }
            for item in items_qs
        ]
        return success_response(
            {
                "medicine_id": str(medicine.id),
                "items": items,
                "total_quantity": total_quantity,
            }
        )


# ────────────────────────────────────────────────────────────
# Pharmacy Queue
# ────────────────────────────────────────────────────────────


class PharmacyQueueView(APIView):
    permission_classes = [IsReceptionAdminOrPharmacist]

    def get(self, request):
        today = timezone.localdate()
        sessions = (
            VisitSession.objects.select_related("patient", "checked_in_by")
            .filter(
                visit_date=today,
                status=VisitStatus.IN_PROGRESS,
                current_stage=VisitStage.PHARMACY,
            )
            .order_by("checkin_time")
        )
        items = [
            {
                "session_id": str(s.pk),
                "patient_id": str(s.patient_id),
                "patient_name": s.patient.full_name,
                "current_stage": s.current_stage,
                "status": s.status,
                "checked_in_at": s.checkin_time,
                "checked_in_by_name": s.checked_in_by.full_name,
                "outstanding_debt": s.outstanding_debt_at_checkin,
                "patient": {
                    "file_number": s.file_number,
                    "phone": s.patient.phone_number,
                    "date_of_birth": s.patient.date_of_birth,
                    "sex": s.patient.sex,
                },
            }
            for s in sessions
        ]
        return success_response({"items": items, "total": len(items)})


# ────────────────────────────────────────────────────────────
# Dispense
# ────────────────────────────────────────────────────────────


class DispenseCreateView(APIView):
    permission_classes = [IsPharmacistOrAdmin]

    def post(self, request):
        serializer = DispenseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = services.process_dispense(
            data=serializer.validated_data, user=request.user
        )
        return success_response(
            {
                "id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "session_id": str(invoice.visit_session_id),
                "patient_id": str(invoice.patient_id),
                "patient_name": invoice.patient.full_name,
                "subtotal": invoice.subtotal,
                "discount_percentage": invoice.discount_percentage,
                "discount_amount": invoice.discount_amount,
                "net_payable": invoice.net_payable,
                "payment_method": invoice.payment_method,
                "cash_amount": invoice.cash_amount,
                "online_amount": invoice.online_amount,
                "item_count": invoice.items.count(),
                "dispensed_at": invoice.dispense_time,
                "dispensed_by": invoice.dispensed_by.full_name,
                "current_stage": VisitStage.COMPLETED,
                "status": invoice.status,
            },
            status_code=status.HTTP_201_CREATED,
        )


def _dispense_invoice_detail_payload(invoice: DispenseInvoice) -> dict:
    """Full invoice payload shared by GET and PATCH (amend) responses."""
    items = [
        {
            "id": str(item.id),
            "medicine_id": str(item.medicine_id),
            "medicine_name": item.medicine_name,
            "salt": item.salt,
            "category": item.category,
            "batch_number": item.batch_number,
            "dose": item.dose,
            "days": item.days,
            "quantity": item.quantity,
            "unit_price": str(item.unit_price),
            "total": str(item.total),
        }
        for item in invoice.items.all()
    ]
    amendments = [
        {
            "amended_at": amendment.amended_at,
            "amended_by_name": (
                amendment.amended_by.full_name if amendment.amended_by_id else ""
            ),
            "reason": amendment.reason,
        }
        for amendment in invoice.amendments.select_related("amended_by")
    ]
    return {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "session_id": str(invoice.visit_session_id),
        "patient_id": str(invoice.patient_id),
        "patient_name": invoice.patient.full_name if invoice.patient_id else "",
        "dispense_date": invoice.dispense_date,
        "dispense_time": invoice.dispense_time,
        "subtotal": str(invoice.subtotal),
        "discount_percentage": str(invoice.discount_percentage),
        "discount_amount": str(invoice.discount_amount),
        "net_payable": str(invoice.net_payable),
        "payment_method": invoice.payment_method,
        "cash_amount": str(invoice.cash_amount),
        "online_amount": str(invoice.online_amount),
        "pharmacist": invoice.dispensed_by.full_name if invoice.dispensed_by_id else "",
        "status": invoice.status,
        "notes": invoice.notes,
        "next_followup_date": invoice.next_followup_date,
        "items": items,
        "amendments": amendments,
    }


class DispenseInvoiceDetailView(APIView):
    """Full dispense invoice (with line items) for a visit session.

    GET — used by the patient profile's "View Invoice" expansion and the
    pharmacy invoice history dialog.
    PATCH — post-dispense amendment (pharmacist corrects a wrongly recorded
    dispense). See ``services.amend_dispense_for_session``.
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsReceptionAdminOrPharmacist()]
        return [IsPharmacistOrAdmin()]

    def get(self, request, session_id):
        invoice = get_object_or_404(
            DispenseInvoice.objects.select_related("patient", "dispensed_by")
            .prefetch_related("items__medicine"),
            visit_session_id=session_id,
        )
        return success_response(_dispense_invoice_detail_payload(invoice))

    def patch(self, request, session_id):
        serializer = DispenseAmendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = services.amend_dispense_for_session(
            session_id=session_id,
            data=serializer.validated_data,
            user=request.user,
        )
        return success_response(_dispense_invoice_detail_payload(invoice))


class DispenseCancelView(APIView):
    """Pharmacist marks a prescription as cancelled for a given visit.

    Accepts a session UUID rather than an invoice UUID so the pharmacist can
    cancel without first creating a draft invoice (the system has no draft
    state — see blueprint §3.5 A-3).
    """

    permission_classes = [IsPharmacistOrAdmin]

    def post(self, request, session_id):
        serializer = DispenseCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = services.cancel_dispense_for_session(
            session_id=session_id,
            reason=serializer.validated_data["reason"],
            user=request.user,
        )
        return success_response(
            {
                "id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "session_id": str(invoice.visit_session_id),
                "status": invoice.status,
                "net_payable": invoice.net_payable,
                "cancelled_at": invoice.cancelled_at,
                "cancel_reason": invoice.cancel_reason,
            }
        )


# ────────────────────────────────────────────────────────────
# Dispense History
# ────────────────────────────────────────────────────────────


class DispenseHistoryListView(APIView):
    permission_classes = [IsReceptionAdminOrPharmacist]

    def get(self, request):
        # ``amendment_count`` powers the "Amended" badge in the history
        # table without an N+1 ``exists()`` per row.
        queryset = (
            DispenseInvoice.objects.select_related(
                "patient", "dispensed_by", "visit_session"
            )
            .annotate(amendment_count=Count("amendments"))
            .order_by("-dispense_time")
        )

        q = (request.query_params.get("q") or "").strip()
        start_date = (request.query_params.get("start_date") or "").strip()
        end_date = (request.query_params.get("end_date") or "").strip()
        status_filter = (request.query_params.get("status") or "").strip()
        today_only = (
            (request.query_params.get("today_only") or "").strip().lower()
            in {"1", "true", "yes"}
        )

        if q:
            queryset = queryset.filter(
                Q(patient__full_name__icontains=q)
                | Q(patient__file_number__icontains=q)
                | Q(invoice_number__icontains=q)
            )
        if start_date:
            queryset = queryset.filter(dispense_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(dispense_date__lte=end_date)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if today_only:
            queryset = queryset.filter(dispense_date=timezone.localdate())

        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("pageSize", 50))
        except (TypeError, ValueError):
            page, page_size = 1, 50

        # Aggregate KPIs for the three cards on the invoice history page.
        # Computed over the same filtered queryset as the list, so the
        # numbers describe the matched set — independent of pagination
        # and consistent with what ``pagination.total`` would report.
        # Cancelled invoices have ``net_payable = 0`` so they contribute
        # zero to revenue regardless of whether the status filter
        # includes them.
        stats_agg = queryset.aggregate(
            unique_patients=Count("patient_id", distinct=True),
            total_revenue=Coalesce(Sum("net_payable"), Decimal("0")),
            total_records=Count("id"),
        )
        stats = {
            "unique_patients": stats_agg["unique_patients"] or 0,
            "total_revenue": str(stats_agg["total_revenue"] or Decimal("0")),
            "total_records": stats_agg["total_records"] or 0,
        }

        paginated, pagination = paginate_queryset(queryset, page, page_size)
        items = [
            DispenseInvoiceListItemSerializer.from_invoice(inv) for inv in paginated
        ]
        return success_response(
            {"items": items, "pagination": pagination, "stats": stats}
        )


# ────────────────────────────────────────────────────────────
# Reports
# ────────────────────────────────────────────────────────────


def _parse_report_range(request):
    """Resolve (start_date, end_date, label) from query params."""
    today = timezone.localdate()
    range_type = (request.query_params.get("range") or "monthly").strip()

    if range_type == "daily":
        date_str = (request.query_params.get("date") or "").strip()
        target = today
        if date_str:
            try:
                target = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                raise drf_serializers.ValidationError("date must be YYYY-MM-DD")
        return target, target, target.strftime("%d %b %Y")

    if range_type == "custom":
        try:
            start = datetime.strptime(
                request.query_params.get("start_date", ""), "%Y-%m-%d"
            ).date()
            end = datetime.strptime(
                request.query_params.get("end_date", ""), "%Y-%m-%d"
            ).date()
        except ValueError:
            raise drf_serializers.ValidationError(
                "start_date and end_date are required (YYYY-MM-DD) for custom range"
            )
        if start > end:
            raise drf_serializers.ValidationError(
                "start_date cannot be after end_date"
            )
        return start, end, f"{start.isoformat()} → {end.isoformat()}"

    # monthly (default)
    month_str = (request.query_params.get("month") or "").strip()
    if month_str:
        try:
            anchor = datetime.strptime(month_str, "%Y-%m").date()
        except ValueError:
            raise drf_serializers.ValidationError("month must be YYYY-MM")
    else:
        anchor = today.replace(day=1)

    start = anchor.replace(day=1)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        end = start.replace(month=start.month + 1, day=1) - timedelta(days=1)
    return start, end, start.strftime("%B %Y")


class RevenueReportView(APIView):
    permission_classes = [IsPharmacistOrAdmin]

    def get(self, request):
        start, end, label = _parse_report_range(request)
        qs = DispenseInvoice.objects.filter(
            status=DispenseStatus.SUCCESS,
            dispense_date__gte=start,
            dispense_date__lte=end,
        )

        summary = qs.aggregate(
            total_revenue=Coalesce(Sum("net_payable"), Decimal("0")),
            total_cash=Coalesce(Sum("cash_amount"), Decimal("0")),
            total_online=Coalesce(Sum("online_amount"), Decimal("0")),
            total_transactions=Count("id"),
        )

        daily = (
            qs.values("dispense_date")
            .annotate(
                revenue=Coalesce(Sum("net_payable"), Decimal("0")),
                cash=Coalesce(Sum("cash_amount"), Decimal("0")),
                online=Coalesce(Sum("online_amount"), Decimal("0")),
                transactions=Count("id"),
            )
            .order_by("dispense_date")
        )

        breakdown = [
            {
                "date": row["dispense_date"],
                "day_name": row["dispense_date"].strftime("%A"),
                "revenue": row["revenue"],
                "cash": row["cash"],
                "online": row["online"],
                "transactions": row["transactions"],
            }
            for row in daily
        ]

        return success_response(
            {"period": label, "summary": summary, "breakdown": breakdown}
        )


class ConsumptionReportView(APIView):
    permission_classes = [IsPharmacistOrAdmin]

    def get(self, request):
        start, end, label = _parse_report_range(request)
        category = (request.query_params.get("category") or "").strip()

        items_qs = DispenseInvoiceItem.objects.filter(
            dispense_invoice__status=DispenseStatus.SUCCESS,
            dispense_invoice__dispense_date__gte=start,
            dispense_invoice__dispense_date__lte=end,
        )
        if category and category != "All":
            items_qs = items_qs.filter(category=category)

        trend = (
            items_qs.values("dispense_invoice__dispense_date")
            .annotate(
                rx=Coalesce(Sum("quantity", filter=Q(category=MedicineCategory.RX)), 0),
                nrx=Coalesce(
                    Sum("quantity", filter=Q(category=MedicineCategory.NRX)), 0
                ),
                bup=Coalesce(
                    Sum("quantity", filter=Q(category=MedicineCategory.BUP)), 0
                ),
                total=Coalesce(Sum("quantity"), 0),
            )
            .order_by("dispense_invoice__dispense_date")
        )

        trend_data = [
            {
                "date": row["dispense_invoice__dispense_date"],
                "day_name": row["dispense_invoice__dispense_date"].strftime("%A"),
                "rx": row["rx"],
                "nrx": row["nrx"],
                "bup": row["bup"],
                "total": row["total"],
            }
            for row in trend
        ]

        breakdown = (
            items_qs.values(
                "medicine__name",
                "medicine__salt",
                "category",
                "medicine__bup_category",
            )
            .annotate(
                quantity=Coalesce(Sum("quantity"), 0),
                selling_value=Coalesce(Sum("total"), Decimal("0")),
            )
            .order_by("-quantity")
        )

        medicine_breakdown = [
            {
                "name": row["medicine__name"],
                "salt": row["medicine__salt"],
                "category": row["category"],
                "strength": row["medicine__bup_category"] or "",
                "quantity": row["quantity"],
                "selling_value": row["selling_value"],
            }
            for row in breakdown
        ]

        return success_response(
            {
                "period": label,
                "trend_data": trend_data,
                "medicine_breakdown": medicine_breakdown,
            }
        )


class LowStockReportView(APIView):
    permission_classes = [IsReceptionAdminOrPharmacist]

    def get(self, request):
        queryset = (
            Medicine.objects.filter(is_active=True)
            .annotate(
                current_stock=Coalesce(
                    Sum("batches__quantity", filter=Q(batches__is_active=True)),
                    0,
                )
            )
            .filter(current_stock__lte=F("reorder_level"))
            .order_by("current_stock")
        )

        items = [
            {
                "id": str(m.id),
                "name": m.name,
                "salt": m.salt,
                "category": m.category,
                "current_stock": m.current_stock,
                "reorder_level": m.reorder_level,
            }
            for m in queryset
        ]
        return success_response({"items": items, "total": len(items)})


class ExpiryReportView(APIView):
    permission_classes = [IsReceptionAdminOrPharmacist]

    def get(self, request):
        today = timezone.localdate()
        threshold = today + timedelta(days=NEAR_EXPIRY_DAYS)

        expired_qs = (
            MedicineBatch.objects.filter(
                is_active=True,
                medicine__is_active=True,
                expiry_date__lt=today,
            )
            .select_related("medicine")
            .order_by("expiry_date")
        )
        near_qs = (
            MedicineBatch.objects.filter(
                is_active=True,
                medicine__is_active=True,
                expiry_date__gte=today,
                expiry_date__lte=threshold,
            )
            .select_related("medicine")
            .order_by("expiry_date")
        )

        expired = [
            {
                "medicine_id": str(b.medicine_id),
                "medicine_name": b.medicine.name,
                "batch_number": b.batch_number,
                "expiry_date": b.expiry_date,
                "quantity": b.quantity,
                "days_overdue": (today - b.expiry_date).days,
            }
            for b in expired_qs
        ]
        near_expiry = [
            {
                "medicine_id": str(b.medicine_id),
                "medicine_name": b.medicine.name,
                "batch_number": b.batch_number,
                "expiry_date": b.expiry_date,
                "quantity": b.quantity,
                "days_until_expiry": (b.expiry_date - today).days,
            }
            for b in near_qs
        ]

        return success_response({"expired": expired, "near_expiry": near_expiry})
