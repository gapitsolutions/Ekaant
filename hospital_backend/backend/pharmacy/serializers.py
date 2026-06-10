import base64
import binascii
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from core.exceptions import ConflictError

from .models import (
    BupStrength,
    DispenseInvoice,
    DispenseStatus,
    Medicine,
    MedicineBatch,
    MedicineCategory,
    PaymentMethod,
    RemovalReason,
    Supplier,
)


def _digits_only(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


MAX_PURCHASE_INVOICE_DOCUMENT_BYTES = 5 * 1024 * 1024
ALLOWED_PURCHASE_INVOICE_DOCUMENT_MIME_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def _decode_purchase_invoice_document_payload(payload: str) -> bytes:
    compact_payload = "".join(payload.split())
    if not compact_payload:
        raise serializers.ValidationError("Invalid invoice_document_base64 payload")

    max_encoded_chars = ((MAX_PURCHASE_INVOICE_DOCUMENT_BYTES * 4) // 3) + 8
    if len(compact_payload) > max_encoded_chars:
        raise serializers.ValidationError(
            "Invoice document exceeds maximum allowed size (5 MB)"
        )

    try:
        decoded = base64.b64decode(compact_payload, validate=True)
    except (binascii.Error, ValueError):
        raise serializers.ValidationError("Invalid invoice_document_base64 payload")

    if not decoded:
        raise serializers.ValidationError("Invalid invoice_document_base64 payload")

    if len(decoded) > MAX_PURCHASE_INVOICE_DOCUMENT_BYTES:
        raise serializers.ValidationError(
            "Invoice document exceeds maximum allowed size (5 MB)"
        )

    return decoded


# ────────────────────────────────────────────────────────────
# Medicine + Batch
# ────────────────────────────────────────────────────────────


class MedicineBatchReadSerializer(serializers.Serializer):
    """Read-only batch representation nested inside medicine list."""

    batch_number = serializers.CharField()
    expiry_date = serializers.DateField()
    quantity = serializers.IntegerField()

    @classmethod
    def from_batch(cls, batch: MedicineBatch) -> dict:
        return {
            "batch_number": batch.batch_number,
            "expiry_date": batch.expiry_date,
            "quantity": batch.quantity,
        }


class MedicineReadSerializer(serializers.ModelSerializer):
    """Medicine list/detail payload, with active batches inline."""

    batches = serializers.SerializerMethodField()
    # Inline supplier summary — kept lightweight (id + company_name + the
    # two flags the frontend uses to render badges) to avoid bloating the
    # medicine list payload. ``categories`` is included so the frontend
    # can de-emphasise suppliers whose categories don't include the
    # current medicine's category.
    suppliers = serializers.SerializerMethodField()

    class Meta:
        model = Medicine
        fields = [
            "id",
            "name",
            "salt",
            "category",
            "bup_category",
            "manufacturer",
            "reorder_level",
            "tablets_per_strip",
            "mrp",
            "selling_price",
            "is_active",
            "batches",
            "suppliers",
        ]

    def get_batches(self, obj: Medicine):
        # FEFO ordering by expiry_date; only active batches.
        batches = obj.batches.filter(is_active=True).order_by("expiry_date")
        return [MedicineBatchReadSerializer.from_batch(b) for b in batches]

    def get_suppliers(self, obj: Medicine):
        # The view ``prefetch_related("suppliers")`` so iterating here
        # doesn't trigger N+1.
        return [
            {
                "id": str(s.id),
                "company_name": s.company_name,
                "is_active": s.is_active,
                "categories": list(s.categories or []),
            }
            for s in obj.suppliers.all()
        ]


class MedicineWriteSerializer(serializers.ModelSerializer):
    """Used for both POST (create) and PATCH (partial update)."""

    # Write-only side of the explicit Medicine↔Supplier relation. Optional;
    # an absent key on PATCH is a no-op (existing links preserved), while
    # an empty list ``[]`` is an explicit clear. PKRelatedField validates
    # each id against the Supplier table — unknown ids raise 400 with the
    # ``supplier_ids`` key so ``useApiErrors`` highlights the picker.
    supplier_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        required=False,
        queryset=Supplier.objects.all(),
        source="suppliers",
    )

    class Meta:
        model = Medicine
        fields = [
            "name",
            "salt",
            "category",
            "bup_category",
            "manufacturer",
            "reorder_level",
            "tablets_per_strip",
            "mrp",
            "selling_price",
            "supplier_ids",
        ]

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        category = attrs.get("category", getattr(instance, "category", None))
        bup_category = attrs.get(
            "bup_category", getattr(instance, "bup_category", None)
        )
        mrp = attrs.get("mrp", getattr(instance, "mrp", None))
        selling_price = attrs.get(
            "selling_price", getattr(instance, "selling_price", None)
        )

        if category == MedicineCategory.BUP and not bup_category:
            raise serializers.ValidationError(
                {"bup_category": "BUP category requires a strength subcategory."}
            )
        if category and category != MedicineCategory.BUP and bup_category:
            raise serializers.ValidationError(
                {
                    "bup_category": "Non-BUP medicines must not have a BUP subcategory."
                }
            )
        if mrp is not None and selling_price is not None:
            if Decimal(selling_price) > Decimal(mrp):
                raise serializers.ValidationError(
                    {"selling_price": "Selling price cannot exceed MRP."}
                )
        return attrs


class MedicineDeleteSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


# ────────────────────────────────────────────────────────────
# Supplier
# ────────────────────────────────────────────────────────────


class SupplierReadSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    invoice_count = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = (
            "id",
            "company_name",
            "contact_person",
            "mobile_number",
            "email",
            "full_address",
            "gst_number",
            "drug_license_number",
            "categories",
            "is_active",
            "invoice_count",
            "created_at",
            "updated_at",
        )

    def get_id(self, obj):
        return str(obj.pk)

    def get_invoice_count(self, obj):
        # Populated by view via .annotate(_invoice_count=Count(...)) so that
        # large supplier lists don't trigger N+1. Falls back to a fresh query
        # for one-off reads.
        annotated = getattr(obj, "_invoice_count", None)
        if annotated is not None:
            return annotated
        return obj.purchase_invoices.count()


class SupplierEmbeddedSerializer(serializers.Serializer):
    """Compact supplier representation embedded in PurchaseInvoice responses.

    Trades schema flexibility for one less round-trip on invoice list pages.
    """

    @classmethod
    def from_supplier(cls, supplier: Supplier | None) -> dict | None:
        if supplier is None:
            return None
        return {
            "id": str(supplier.pk),
            "company_name": supplier.company_name,
            "mobile_number": supplier.mobile_number,
        }


class SupplierWriteSerializer(serializers.ModelSerializer):
    """Used for both POST (create) and PATCH (partial update).

    ``mobile_number`` is required at this layer even though the underlying
    column is nullable (legacy / seeded rows may have NULL). The model-level
    case-insensitive uniqueness is mirrored in ``validate_company_name`` so
    we can raise the canonical ConflictError envelope rather than the raw
    IntegrityError.
    """

    class Meta:
        model = Supplier
        fields = (
            "company_name",
            "contact_person",
            "mobile_number",
            "email",
            "full_address",
            "gst_number",
            "drug_license_number",
            "categories",
            "is_active",
        )
        extra_kwargs = {
            "contact_person": {"required": False, "allow_blank": True, "default": ""},
            "email": {"required": False, "allow_null": True, "allow_blank": True},
            "full_address": {"required": False, "allow_blank": True, "default": ""},
            "gst_number": {"required": False, "allow_null": True, "allow_blank": True},
            "drug_license_number": {
                "required": False,
                "allow_null": True,
                "allow_blank": True,
            },
            "categories": {"required": False, "default": list},
            "is_active": {"required": False, "default": True},
        }

    def validate_company_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Company name is required.")
        qs = Supplier.objects.filter(company_name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise ConflictError(
                "A supplier with this company name already exists."
            )
        return value

    def validate_mobile_number(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Mobile number is required.")
        digits = _digits_only(value)
        if len(digits) < 7:
            raise serializers.ValidationError("Mobile number looks too short.")
        if len(digits) > 15:
            raise serializers.ValidationError("Mobile number looks too long.")
        return digits

    def validate_email(self, value):
        return (value or "").strip().lower() or None

    def validate_gst_number(self, value):
        return (value or "").strip().upper() or None

    def validate_drug_license_number(self, value):
        return (value or "").strip().upper() or None

    def validate_categories(self, value):
        if value is None:
            return []
        valid = set(MedicineCategory.values)
        normalised: list[str] = []
        seen: set[str] = set()
        for item in value:
            if item not in valid:
                raise serializers.ValidationError(
                    f"Unknown category '{item}'. Allowed: {sorted(valid)}."
                )
            if item not in seen:
                normalised.append(item)
                seen.add(item)
        return normalised


# ────────────────────────────────────────────────────────────
# Purchase Invoice
# ────────────────────────────────────────────────────────────


class PurchaseInvoiceItemWriteSerializer(serializers.Serializer):
    medicine_id = serializers.UUIDField()
    category = serializers.CharField(required=False, allow_blank=True, default="")
    subcategory = serializers.CharField(required=False, allow_blank=True, allow_null=True, default="")
    batch_number = serializers.CharField(max_length=50)
    expiry_date = serializers.DateField()
    quantity = serializers.IntegerField(min_value=1)
    purchase_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0
    )
    gst_percentage = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100, default=0
    )

    def validate_expiry_date(self, value):
        if value <= timezone.localdate():
            raise serializers.ValidationError(
                "Expiry date must be in the future."
            )
        return value


class PurchaseInvoiceCreateSerializer(serializers.Serializer):
    invoice_number = serializers.CharField(max_length=50)
    supplier_id = serializers.UUIDField()
    order_date = serializers.DateField()
    invoice_date = serializers.DateField()
    delivery_date = serializers.DateField(required=False, allow_null=True)
    invoice_document_base64 = serializers.CharField(
        required=False, allow_blank=True, default="", trim_whitespace=False
    )
    invoice_document_mime_type = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    invoice_document_filename = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    invoice_photo_base64 = serializers.CharField(
        required=False, allow_blank=True, default="", trim_whitespace=False
    )
    invoice_photo_mime_type = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    items = PurchaseInvoiceItemWriteSerializer(many=True, min_length=1)

    def validate_invoice_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError(
                "Invoice date cannot be in the future."
            )
        return value

    def validate_order_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Order date cannot be in the future.")
        return value

    def validate_supplier_id(self, value):
        try:
            supplier = Supplier.objects.get(pk=value)
        except Supplier.DoesNotExist as exc:
            raise serializers.ValidationError("Supplier not found.") from exc
        if not supplier.is_active:
            raise serializers.ValidationError(
                "This supplier has been deactivated and cannot accept new invoices."
            )
        return value

    def validate(self, attrs):
        order_date = attrs.get("order_date")
        invoice_date = attrs.get("invoice_date")
        delivery_date = attrs.get("delivery_date")
        document_base64 = attrs.get("invoice_document_base64") or attrs.get(
            "invoice_photo_base64", ""
        )
        document_mime_type = (
            attrs.get("invoice_document_mime_type")
            or attrs.get("invoice_photo_mime_type")
            or ""
        ).strip().lower()

        if order_date and invoice_date and order_date > invoice_date:
            raise serializers.ValidationError(
                {"order_date": "Order date cannot be after invoice date."}
            )
        if delivery_date and invoice_date and delivery_date < invoice_date:
            raise serializers.ValidationError(
                {"delivery_date": "Delivery date cannot be before invoice date."}
            )
        if delivery_date and order_date and delivery_date < order_date:
            raise serializers.ValidationError(
                {"delivery_date": "Delivery date cannot be before order date."}
            )

        if bool(document_base64) != bool(document_mime_type):
            raise serializers.ValidationError(
                "invoice_document_base64 and invoice_document_mime_type must be provided together"
            )

        if document_mime_type:
            if (
                document_mime_type
                not in ALLOWED_PURCHASE_INVOICE_DOCUMENT_MIME_TYPES
            ):
                raise serializers.ValidationError(
                    "Unsupported invoice_document_mime_type. Allowed: application/pdf, image/jpeg, image/png, image/webp"
                )
            attrs["invoice_document_mime_type"] = document_mime_type
            attrs["_decoded_invoice_document"] = (
                _decode_purchase_invoice_document_payload(document_base64)
            )
        # Detect duplicate (medicine, batch_number) within items
        seen = set()
        for item in attrs.get("items", []):
            key = (str(item["medicine_id"]), item["batch_number"])
            if key in seen:
                raise serializers.ValidationError(
                    "Duplicate (medicine, batch_number) combination in items."
                )
            seen.add(key)
        return attrs


# ────────────────────────────────────────────────────────────
# Audit Removal
# ────────────────────────────────────────────────────────────


class AuditRemovalCreateSerializer(serializers.Serializer):
    medicine_id = serializers.UUIDField()
    batch_number = serializers.CharField(max_length=50)
    quantity = serializers.IntegerField(required=False, min_value=1)
    reason = serializers.ChoiceField(choices=RemovalReason.choices)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


# ────────────────────────────────────────────────────────────
# Dispense
# ────────────────────────────────────────────────────────────


class DispenseLineItemWriteSerializer(serializers.Serializer):
    medicine_id = serializers.UUIDField()
    batch_number = serializers.CharField(max_length=50)
    dose = serializers.CharField(max_length=20)
    days = serializers.IntegerField(min_value=1)
    qty = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0
    )


class PaymentWriteSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(choices=PaymentMethod.choices)
    cash_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, default=0
    )
    online_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, default=0
    )
    # ``discount`` is a rupee AMOUNT (not a percentage). Constrained to 2 dp
    # (whole paise) so the frontend and backend agree to the cent. The
    # discount percentage is derived server-side for storage/reporting.
    discount = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, default=0
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class DispenseCreateSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    line_items = DispenseLineItemWriteSerializer(many=True, min_length=1)
    payment = PaymentWriteSerializer()
    next_followup_date = serializers.DateField(required=False, allow_null=True)

    def validate_next_followup_date(self, value):
        if value is not None and value <= timezone.localdate():
            raise serializers.ValidationError(
                "Follow-up date must be in the future."
            )
        return value


class DispenseAmendSerializer(serializers.Serializer):
    """Body for PATCH /pharmacy/dispense/<session_id>/ (post-dispense edit).

    Same shape as create minus ``session_id`` (taken from the URL), plus a
    mandatory ``amend_reason`` — every amendment is recorded in the
    append-only ``DispenseInvoiceAmendment`` audit table, so the reason is
    as non-negotiable as it is for cancellation.
    """

    amend_reason = serializers.CharField(max_length=255)
    line_items = DispenseLineItemWriteSerializer(many=True, min_length=1)
    payment = PaymentWriteSerializer()
    next_followup_date = serializers.DateField(required=False, allow_null=True)

    def validate_amend_reason(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Amendment reason is required.")
        return value

    def validate_next_followup_date(self, value):
        if value is not None and value <= timezone.localdate():
            raise serializers.ValidationError(
                "Follow-up date must be in the future."
            )
        return value


class DispenseCancelSerializer(serializers.Serializer):
    """Body for cancel endpoint. Reason is required for audit clarity."""

    reason = serializers.CharField(max_length=255)


class DispenseInvoiceItemReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = DispenseInvoice  # placeholder so DRF picks the model
        fields: list[str] = []  # not used (we override to_representation)

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "medicine_id": str(instance.medicine_id),
            "medicine_name": instance.medicine_name,
            "salt": instance.salt,
            "category": instance.category,
            "batch_number": instance.batch_number,
            "expiry_date": instance.expiry_date,
            "dose": instance.dose,
            "days": instance.days,
            "quantity": instance.quantity,
            "unit_price": instance.unit_price,
            "total": instance.total,
        }


class DispenseInvoiceListItemSerializer(serializers.Serializer):
    """Flat row representation for the dispense-history list."""

    @classmethod
    def from_invoice(cls, invoice: DispenseInvoice) -> dict:
        return {
            "id": str(invoice.id),
            "session_id": str(invoice.visit_session_id) if invoice.visit_session_id else "",
            "invoice_number": invoice.invoice_number,
            "patient": invoice.patient.full_name if invoice.patient_id else "",
            "patient_id": str(invoice.patient_id),
            "file_number": invoice.visit_session.file_number
            if invoice.visit_session_id
            else "",
            "amount": invoice.net_payable,
            "date": invoice.dispense_date,
            "time": invoice.dispense_time.strftime("%I:%M %p"),
            "pharmacist": invoice.dispensed_by.full_name
            if invoice.dispensed_by_id
            else "",
            "status": invoice.status,
            "payment_method": invoice.payment_method,
            # Set via ``annotate(amendment_count=Count("amendments"))`` in
            # the history view; defaults to 0 when the annotation is absent.
            "is_amended": getattr(invoice, "amendment_count", 0) > 0,
        }
