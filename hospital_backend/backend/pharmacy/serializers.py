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
        ]

    def get_batches(self, obj: Medicine):
        # FEFO ordering by expiry_date; only active batches.
        batches = obj.batches.filter(is_active=True).order_by("expiry_date")
        return [MedicineBatchReadSerializer.from_batch(b) for b in batches]


class MedicineWriteSerializer(serializers.ModelSerializer):
    """Used for both POST (create) and PATCH (partial update)."""

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
    invoice_date = serializers.DateField()
    delivery_date = serializers.DateField(required=False, allow_null=True)
    invoice_photo_base64 = serializers.CharField(
        required=False, allow_blank=True, default=""
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
        invoice_date = attrs.get("invoice_date")
        delivery_date = attrs.get("delivery_date")
        if delivery_date and invoice_date and delivery_date < invoice_date:
            raise serializers.ValidationError(
                {"delivery_date": "Delivery date cannot be before invoice date."}
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
    discount = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100, default=0
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
        }
