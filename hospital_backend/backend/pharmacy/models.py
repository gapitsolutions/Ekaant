import uuid
from decimal import Decimal

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.db.models import CheckConstraint, F, Index, Q, UniqueConstraint
from django.db.models.functions import Lower
from django.utils import timezone


# ────────────────────────────────────────────────────────────
# Enums
# ────────────────────────────────────────────────────────────


class MedicineCategory(models.TextChoices):
    BUP = "BUP", "BUP (Controlled Substance)"
    RX = "Rx", "Rx (Prescription Only)"
    NRX = "NRx", "NRx (Non-Prescription / General)"


class BupStrength(models.TextChoices):
    MG_04 = "0.4mg + 0.1mg", "Buprenorphine 0.4mg + Naloxone 0.1mg"
    MG_10 = "1.0mg + 0.25mg", "Buprenorphine 1.0mg + Naloxone 0.25mg"
    MG_20 = "2.0mg + 0.5mg", "Buprenorphine 2.0mg + Naloxone 0.5mg"


class PaymentMethod(models.TextChoices):
    CASH = "Cash", "Cash"
    ONLINE = "Online", "Online / Digital Payment"
    SPLIT = "Split", "Split Payment (Cash + Online)"


class RemovalReason(models.TextChoices):
    DESTROYED = "destroyed", "Destroyed"
    RETURNED = "returned", "Returned to Supplier"
    DAMAGED = "damaged", "Damaged"
    DEFECT = "defect", "Manufacturing Defect"


class MovementType(models.TextChoices):
    PURCHASE = "purchase", "Purchase / Stock In"
    DISPENSE = "dispense", "Dispense / Stock Out"
    AUDIT_REMOVAL = "audit_removal", "Audit Removal"
    ADJUSTMENT = "adjustment", "Manual Adjustment"


class DispenseStatus(models.TextChoices):
    SUCCESS = "success", "Success"
    CANCELLED = "cancelled", "Cancelled"


# ────────────────────────────────────────────────────────────
# Upload paths
# ────────────────────────────────────────────────────────────


def purchase_invoice_upload_path(instance, filename):
    return f"pharmacy/purchase_invoices/{instance.id}/{filename}"


def audit_removal_upload_path(instance, filename):
    return f"pharmacy/audit_removals/{instance.id}/{filename}"


# ────────────────────────────────────────────────────────────
# Models
# ────────────────────────────────────────────────────────────


class Medicine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    salt = models.CharField(max_length=255)
    category = models.CharField(max_length=10, choices=MedicineCategory.choices)
    bup_category = models.CharField(
        max_length=20, choices=BupStrength.choices, blank=True, null=True
    )
    manufacturer = models.CharField(max_length=255)
    reorder_level = models.PositiveIntegerField(default=50)
    tablets_per_strip = models.PositiveIntegerField(default=10)
    mrp = models.DecimalField(max_digits=10, decimal_places=2)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)
    # Tracking-only relation: which suppliers stock this medicine. Distinct
    # from the implicit Medicine↔Supplier link that arises from purchase
    # invoices — this one is declared up-front by the pharmacist at
    # register/edit time, so a brand-new medicine can already carry its
    # known supplier(s) before any invoice has been booked. ``blank=True``
    # because it's optional ("for tracking purposes"). PROTECT lives on
    # PurchaseInvoice.supplier, so deleting a supplier with active
    # invoices remains blocked; the M2M itself has no cascade impact.
    suppliers = models.ManyToManyField(
        "Supplier", blank=True, related_name="medicines"
    )
    is_active = models.BooleanField(default=True)
    deletion_reason = models.CharField(max_length=255, blank=True, default="")
    deletion_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="medicines_created",
        blank=True,
        null=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="medicines_updated",
        blank=True,
        null=True,
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Medicine"
        verbose_name_plural = "Medicines"
        constraints = [
            UniqueConstraint(
                fields=["name", "category", "bup_category"],
                condition=Q(is_active=True),
                name="pharmacy_unique_active_medicine",
            ),
        ]
        indexes = [
            Index(fields=["category"]),
            Index(fields=["is_active"]),
            Index(fields=["category", "bup_category"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.category})"


class MedicineBatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    medicine = models.ForeignKey(
        Medicine, on_delete=models.CASCADE, related_name="batches"
    )
    batch_number = models.CharField(max_length=50)
    expiry_date = models.DateField()
    quantity = models.IntegerField(default=0)
    initial_quantity = models.PositiveIntegerField()
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    gst_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    purchase_invoice = models.ForeignKey(
        "PurchaseInvoice",
        on_delete=models.SET_NULL,
        related_name="created_batches",
        blank=True,
        null=True,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["expiry_date"]  # FEFO ordering
        verbose_name = "Medicine Batch"
        verbose_name_plural = "Medicine Batches"
        constraints = [
            UniqueConstraint(
                fields=["medicine", "batch_number"],
                name="pharmacy_unique_medicine_batch",
            ),
            CheckConstraint(
                condition=Q(quantity__gte=0),
                name="pharmacy_non_negative_batch_qty",
            ),
        ]
        indexes = [
            Index(fields=["medicine", "expiry_date"]),
            Index(fields=["expiry_date"]),
            Index(fields=["is_active"]),
        ]

    def __str__(self):
        return f"{self.medicine.name} / {self.batch_number}"

    @property
    def is_expired(self) -> bool:
        return self.expiry_date < timezone.localdate()

    @property
    def days_until_expiry(self) -> int:
        return (self.expiry_date - timezone.localdate()).days


class Supplier(models.Model):
    """Pharmaceutical supplier / wholesaler entity.

    Owns the supplier-side relationships for PurchaseInvoice. Treated as a
    core business entity: full CRUD, soft-delete via ``is_active``, and
    referenced (PROTECT) from PurchaseInvoice so accidentally removing a
    supplier with active invoices is rejected by the database.

    Design notes:

    * ``company_name`` is uniquely-constrained case-insensitively via a
      functional UniqueConstraint over ``Lower("company_name")``.
    * ``mobile_number`` is nullable at the DB layer to accommodate legacy
      / migrated rows that pre-date this model; serializers enforce its
      presence for create/update.
    * ``categories`` reuses :class:`MedicineCategory` and is stored as a
      PostgreSQL array so queries like "suppliers that stock BUP" can be
      satisfied with a GIN-indexed ``categories__contains`` predicate.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company_name = models.CharField(max_length=255)
    contact_person = models.CharField(max_length=255, blank=True, default="")
    mobile_number = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    full_address = models.TextField(blank=True, default="")
    gst_number = models.CharField(max_length=20, blank=True, null=True)
    drug_license_number = models.CharField(max_length=50, blank=True, null=True)
    categories = ArrayField(
        base_field=models.CharField(max_length=10, choices=MedicineCategory.choices),
        default=list,
        blank=True,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="suppliers_created",
        blank=True,
        null=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="suppliers_updated",
        blank=True,
        null=True,
    )

    class Meta:
        ordering = ["company_name"]
        verbose_name = "Supplier"
        verbose_name_plural = "Suppliers"
        constraints = [
            UniqueConstraint(
                Lower("company_name"),
                name="pharmacy_supplier_company_name_ci_unique",
            ),
        ]
        indexes = [
            Index(fields=["is_active"]),
            Index(fields=["company_name"]),
            GinIndex(fields=["categories"], name="pharmacy_supplier_categories"),
        ]

    def __str__(self):
        return self.company_name


class PurchaseInvoice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=50, unique=True)
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchase_invoices",
    )
    order_date = models.DateField(blank=True, null=True)
    invoice_date = models.DateField()
    delivery_date = models.DateField(blank=True, null=True)
    invoice_photo = models.FileField(
        upload_to=purchase_invoice_upload_path, blank=True, null=True
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    items_count = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="purchase_invoices_created",
        blank=True,
        null=True,
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Purchase Invoice"
        verbose_name_plural = "Purchase Invoices"
        indexes = [
            Index(fields=["supplier"]),
            Index(fields=["order_date"]),
            Index(fields=["invoice_date"]),
            Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return self.invoice_number


class PurchaseInvoiceItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_invoice = models.ForeignKey(
        PurchaseInvoice, on_delete=models.CASCADE, related_name="items"
    )
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT)
    batch = models.ForeignKey(MedicineBatch, on_delete=models.PROTECT)
    category = models.CharField(max_length=10)
    subcategory = models.CharField(max_length=20, blank=True, default="")
    batch_number = models.CharField(max_length=50)
    expiry_date = models.DateField()
    quantity = models.PositiveIntegerField()
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2)
    gst_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Purchase Invoice Line Item"
        verbose_name_plural = "Purchase Invoice Line Items"
        indexes = [
            Index(fields=["purchase_invoice"]),
            Index(fields=["medicine"]),
        ]


class DispenseInvoice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=30, unique=True)
    visit_session = models.OneToOneField(
        "visits.VisitSession",
        on_delete=models.PROTECT,
        related_name="dispense_invoice",
    )
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="dispense_invoices"
    )
    dispensed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="dispenses",
    )
    dispense_date = models.DateField(default=timezone.localdate)
    dispense_time = models.DateTimeField(auto_now_add=True)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=0
    )
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    net_payable = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_method = models.CharField(
        max_length=10, choices=PaymentMethod.choices, default=PaymentMethod.CASH
    )
    cash_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    online_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default="")
    next_followup_date = models.DateField(blank=True, null=True)
    status = models.CharField(
        max_length=10, choices=DispenseStatus.choices, default=DispenseStatus.SUCCESS
    )
    cancelled_at = models.DateTimeField(blank=True, null=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="dispenses_cancelled",
        blank=True,
        null=True,
    )
    cancel_reason = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-dispense_time"]
        verbose_name = "Dispense Invoice"
        verbose_name_plural = "Dispense Invoices"
        constraints = [
            CheckConstraint(
                condition=Q(discount_percentage__gte=0, discount_percentage__lte=100),
                name="pharmacy_valid_discount_percentage",
            ),
            CheckConstraint(
                condition=Q(cash_amount__gte=0),
                name="pharmacy_non_negative_cash",
            ),
            CheckConstraint(
                condition=Q(online_amount__gte=0),
                name="pharmacy_non_negative_online",
            ),
        ]
        indexes = [
            Index(fields=["patient", "-dispense_date"]),
            Index(fields=["-dispense_date"]),
            Index(fields=["dispensed_by", "-dispense_date"]),
            Index(fields=["payment_method"]),
            Index(fields=["status"]),
        ]

    def __str__(self):
        return self.invoice_number

    @classmethod
    def generate_invoice_number(cls) -> str:
        today_str = timezone.localdate().strftime("%Y%m%d")
        prefix = f"INV-{today_str}-"
        last = (
            cls.objects.filter(invoice_number__startswith=prefix)
            .order_by("-invoice_number")
            .first()
        )
        if last:
            try:
                seq = int(last.invoice_number.split("-")[-1]) + 1
            except (ValueError, IndexError):
                seq = cls.objects.filter(invoice_number__startswith=prefix).count() + 1
        else:
            seq = 1
        return f"{prefix}{seq:04d}"


class DispenseInvoiceItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dispense_invoice = models.ForeignKey(
        DispenseInvoice, on_delete=models.CASCADE, related_name="items"
    )
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT)
    batch = models.ForeignKey(MedicineBatch, on_delete=models.PROTECT)
    medicine_name = models.CharField(max_length=255)
    salt = models.CharField(max_length=255)
    category = models.CharField(max_length=10)
    batch_number = models.CharField(max_length=50)
    expiry_date = models.DateField()
    dose = models.CharField(max_length=20)
    days = models.PositiveIntegerField()
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Dispense Invoice Line Item"
        verbose_name_plural = "Dispense Invoice Line Items"
        indexes = [
            Index(fields=["dispense_invoice"]),
            Index(fields=["medicine", "-created_at"]),
            Index(fields=["batch"]),
        ]


class DispenseInvoiceAmendment(models.Model):
    """Append-only audit record of a post-dispense invoice correction.

    Created by ``services.amend_dispense_for_session`` every time a
    pharmacist edits a successful dispense invoice (wrong quantity, wrong
    medicine, wrong payment split, ...). ``previous_state`` snapshots the
    invoice exactly as it was before the amendment — line items, totals,
    payment method, notes, follow-up date — so no history is lost even
    though the invoice and its items are updated in place.

    Stock corrections are NOT stored here: they live in the
    :class:`StockMovement` ledger as corrective rows (an ``adjustment``
    restoring the old items followed by fresh ``dispense`` rows for the
    new ones), keeping the ledger append-only and the before/after
    quantity chain unbroken.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(
        DispenseInvoice, on_delete=models.CASCADE, related_name="amendments"
    )
    amended_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="dispense_amendments",
    )
    amended_at = models.DateTimeField(auto_now_add=True)
    reason = models.CharField(max_length=255)
    previous_state = models.JSONField()

    class Meta:
        ordering = ["-amended_at"]
        verbose_name = "Dispense Invoice Amendment"
        verbose_name_plural = "Dispense Invoice Amendments"
        indexes = [
            Index(fields=["invoice", "-amended_at"]),
        ]

    def __str__(self):
        return f"Amendment of {self.invoice.invoice_number} @ {self.amended_at:%Y-%m-%d %H:%M}"


class StockAuditRemoval(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT)
    batch = models.ForeignKey(MedicineBatch, on_delete=models.PROTECT)
    batch_number = models.CharField(max_length=50)
    quantity_removed = models.PositiveIntegerField()
    reason = models.CharField(max_length=20, choices=RemovalReason.choices)
    notes = models.TextField(blank=True, default="")
    audit_document = models.FileField(
        upload_to=audit_removal_upload_path, blank=True, null=True
    )
    removed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_removals",
    )
    removed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-removed_at"]
        verbose_name = "Stock Audit Removal"
        verbose_name_plural = "Stock Audit Removals"
        indexes = [
            Index(fields=["medicine"]),
            Index(fields=["batch"]),
            Index(fields=["reason"]),
            Index(fields=["-removed_at"]),
        ]


class StockMovement(models.Model):
    """Append-only audit ledger for every stock change."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT)
    batch = models.ForeignKey(MedicineBatch, on_delete=models.PROTECT)
    movement_type = models.CharField(max_length=20, choices=MovementType.choices)
    quantity_change = models.IntegerField()
    quantity_before = models.IntegerField()
    quantity_after = models.IntegerField()
    reference_type = models.CharField(max_length=30, blank=True, default="")
    reference_id = models.UUIDField(blank=True, null=True)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="stock_movements",
        blank=True,
        null=True,
    )
    performed_at = models.DateTimeField(auto_now_add=True)
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ["-performed_at"]
        verbose_name = "Stock Movement (Ledger Entry)"
        verbose_name_plural = "Stock Movements (Ledger)"
        indexes = [
            Index(fields=["medicine", "-performed_at"]),
            Index(fields=["batch", "-performed_at"]),
            Index(fields=["movement_type"]),
            Index(fields=["-performed_at"]),
        ]
