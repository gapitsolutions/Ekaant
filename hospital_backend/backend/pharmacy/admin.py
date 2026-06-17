import csv

from django.contrib import admin
from django.http import StreamingHttpResponse
from django.utils import timezone

from .models import (
    DispenseInvoice,
    DispenseInvoiceAmendment,
    DispenseInvoiceItem,
    Medicine,
    MedicineBatch,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    StockAuditRemoval,
    StockMovement,
    Supplier,
    SupplierLedgerEntry,
)


class _CsvEcho:
    """File-like object whose ``write`` just returns the value — lets
    ``csv.writer`` feed a ``StreamingHttpResponse`` generator row by row
    instead of buffering the whole export in memory (Django docs pattern)."""

    def write(self, value):
        return value


class ExportCsvMixin:
    """Adds an admin action that streams the *currently filtered/searched*
    changelist queryset to CSV.

    The action receives the queryset Django already narrowed by the active
    search box, list filters and date hierarchy — so ticking "select all N
    that match" exports exactly that search, not just the visible page.
    Subclasses declare ``csv_export_columns`` as ``(header, accessor)`` pairs.
    """

    # tuple[ tuple[str, Callable[[Model], object]] , ... ]
    csv_export_columns: tuple = ()
    csv_filename_prefix = "export"

    @admin.action(description="Export to CSV (current search & filters)")
    def export_as_csv(self, request, queryset):
        headers = [header for header, _ in self.csv_export_columns]
        accessors = [accessor for _, accessor in self.csv_export_columns]
        writer = csv.writer(_CsvEcho())

        def stream():
            yield writer.writerow(headers)
            for obj in queryset.iterator():
                yield writer.writerow([accessor(obj) for accessor in accessors])

        stamp = timezone.localtime().strftime("%Y%m%d-%H%M%S")
        filename = f"{self.csv_filename_prefix}-{stamp}.csv"
        response = StreamingHttpResponse(stream(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class SupplierLedgerEntryInline(admin.TabularInline):
    """Accounts-payable ledger for a supplier — read-only (written only by
    services; the cached ``outstanding_payable`` is derived from these)."""

    model = SupplierLedgerEntry
    extra = 0
    can_delete = False
    max_num = 0
    fields = (
        "created_at",
        "entry_type",
        "amount",
        "purchase_invoice",
        "payment_mode",
        "reference",
        "created_by",
    )
    readonly_fields = fields
    ordering = ("-created_at",)

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = (
        "company_name",
        "contact_person",
        "mobile_number",
        "gst_number",
        "drug_license_number",
        "outstanding_payable",
        "is_active",
        "updated_at",
    )
    list_filter = ("is_active",)
    search_fields = (
        "company_name",
        "contact_person",
        "mobile_number",
        "email",
        "gst_number",
        "drug_license_number",
    )
    ordering = ("company_name",)
    inlines = (SupplierLedgerEntryInline,)
    # outstanding_payable is a cache recomputed from the ledger — never hand-edit.
    readonly_fields = (
        "outstanding_payable",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
    )
    fieldsets = (
        (
            "Identity",
            {"fields": ("company_name", "is_active", "categories")},
        ),
        (
            "Contact",
            {"fields": ("contact_person", "mobile_number", "email")},
        ),
        (
            "Business",
            {"fields": ("gst_number", "drug_license_number", "full_address")},
        ),
        (
            "Financials",
            {"fields": ("outstanding_payable",)},
        ),
        (
            "Audit",
            {"fields": ("created_at", "updated_at", "created_by", "updated_by")},
        ),
    )


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "salt",
        "category",
        "bup_category",
        "manufacturer",
        "reorder_level",
        "mrp",
        "selling_price",
        "is_active",
    )
    list_filter = ("category", "is_active", "bup_category", "suppliers")
    search_fields = ("name", "salt", "manufacturer")
    ordering = ("name",)
    # Twin-panel picker for the Medicine↔Supplier M2M added in the supplier work.
    filter_horizontal = ("suppliers",)
    readonly_fields = ("created_at", "updated_at", "created_by", "updated_by")


@admin.register(MedicineBatch)
class MedicineBatchAdmin(admin.ModelAdmin):
    list_display = (
        "medicine",
        "batch_number",
        "expiry_date",
        "quantity",
        "initial_quantity",
        "is_active",
    )
    list_filter = ("is_active",)
    search_fields = ("batch_number", "medicine__name")
    date_hierarchy = "expiry_date"
    ordering = ("expiry_date",)
    autocomplete_fields = ("medicine",)
    readonly_fields = ("created_at", "updated_at", "initial_quantity")


class PurchaseInvoiceItemInline(admin.TabularInline):
    """Line items for a purchase invoice — read-only (created via the dispense/
    purchase API, which also writes stock movements)."""

    model = PurchaseInvoiceItem
    extra = 0
    can_delete = False
    max_num = 0
    fields = (
        "medicine",
        "batch_number",
        "expiry_date",
        "quantity",
        "purchase_price",
        "gst_percentage",
        "line_total",
    )
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(PurchaseInvoice)
class PurchaseInvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "supplier",
        "order_date",
        "invoice_date",
        "delivery_date",
        "form6",
        "items_count",
        "total_amount",
        "created_at",
    )
    list_filter = ("form6", "order_date", "invoice_date", "delivery_date", "supplier")
    search_fields = (
        "invoice_number",
        "supplier__company_name",
        "supplier__gst_number",
        "notes",
    )
    list_select_related = ("supplier",)
    autocomplete_fields = ("supplier",)
    inlines = (PurchaseInvoiceItemInline,)
    date_hierarchy = "invoice_date"
    ordering = ("-created_at",)
    readonly_fields = ("created_at", "updated_at", "created_by", "total_amount", "items_count")


@admin.register(PurchaseInvoiceItem)
class PurchaseInvoiceItemAdmin(admin.ModelAdmin):
    list_display = (
        "purchase_invoice",
        "medicine",
        "batch_number",
        "quantity",
        "purchase_price",
        "gst_percentage",
        "line_total",
    )
    list_select_related = ("purchase_invoice", "medicine")
    search_fields = (
        "purchase_invoice__invoice_number",
        "medicine__name",
        "batch_number",
    )
    list_filter = ("category",)
    autocomplete_fields = ("medicine",)
    readonly_fields = ("created_at",)


@admin.register(DispenseInvoice)
class DispenseInvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "patient",
        "dispensed_by",
        "dispense_date",
        "net_payable",
        "payment_method",
        "status",
    )
    list_filter = ("status", "payment_method", "dispense_date")
    search_fields = (
        "invoice_number",
        "patient__full_name",
        "patient__file_number",
    )
    date_hierarchy = "dispense_date"
    ordering = ("-dispense_time",)
    readonly_fields = (
        "invoice_number",
        "dispense_time",
        "created_at",
        "updated_at",
        "subtotal",
        "discount_amount",
        "net_payable",
    )


@admin.register(DispenseInvoiceItem)
class DispenseInvoiceItemAdmin(admin.ModelAdmin):
    list_display = (
        "dispense_invoice",
        "medicine_name",
        "batch_number",
        "dose",
        "days",
        "quantity",
        "unit_price",
        "total",
    )
    list_select_related = ("dispense_invoice", "medicine")
    search_fields = (
        "dispense_invoice__invoice_number",
        "medicine_name",
        "batch_number",
    )
    list_filter = ("category",)
    autocomplete_fields = ("medicine",)
    readonly_fields = ("created_at",)


@admin.register(DispenseInvoiceAmendment)
class DispenseInvoiceAmendmentAdmin(admin.ModelAdmin):
    """Append-only amendment audit log, exposed read-only in admin."""

    list_display = (
        "invoice",
        "amended_by",
        "amended_at",
        "reason",
    )
    list_filter = ("amended_at",)
    search_fields = (
        "invoice__invoice_number",
        "invoice__patient__full_name",
        "invoice__patient__file_number",
        "amended_by__full_name",
        "reason",
    )
    date_hierarchy = "amended_at"
    ordering = ("-amended_at",)
    list_select_related = ("invoice", "invoice__patient", "amended_by")
    readonly_fields = (
        "invoice",
        "amended_by",
        "amended_at",
        "reason",
        "previous_state",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(StockAuditRemoval)
class StockAuditRemovalAdmin(admin.ModelAdmin):
    list_display = (
        "medicine",
        "batch_number",
        "quantity_removed",
        "reason",
        "removed_by",
        "removed_at",
    )
    list_filter = ("reason", "removed_at")
    search_fields = ("medicine__name", "batch_number", "notes")
    date_hierarchy = "removed_at"
    ordering = ("-removed_at",)
    autocomplete_fields = ("medicine",)
    readonly_fields = ("removed_at",)


@admin.register(StockMovement)
class StockMovementAdmin(ExportCsvMixin, admin.ModelAdmin):
    """Append-only ledger — fully read-only in admin, exportable to CSV."""

    list_display = (
        "performed_at",
        "medicine",
        "batch",
        "movement_type",
        "quantity_change",
        "quantity_before",
        "quantity_after",
        "performed_by",
    )
    list_filter = ("movement_type", "performed_at")
    search_fields = (
        "medicine__name",
        "batch__batch_number",
        "reference_type",
        "notes",
    )
    date_hierarchy = "performed_at"
    ordering = ("-performed_at",)
    list_select_related = ("medicine", "batch", "performed_by")

    actions = ("export_as_csv",)
    csv_filename_prefix = "stock-movement-ledger"
    csv_export_columns = (
        # performed_at is stored UTC (auto_now_add + USE_TZ); export IST so the
        # spreadsheet matches the admin list and the rest of the app.
        ("Performed At (IST)", lambda o: timezone.localtime(o.performed_at).strftime("%Y-%m-%d %H:%M:%S")),
        ("Movement Type", lambda o: o.get_movement_type_display()),
        ("Medicine", lambda o: o.medicine.name if o.medicine_id else ""),
        ("Salt", lambda o: o.medicine.salt if o.medicine_id else ""),
        ("Category", lambda o: o.medicine.category if o.medicine_id else ""),
        ("Batch", lambda o: o.batch.batch_number if o.batch_id else ""),
        ("Quantity Change", lambda o: o.quantity_change),
        ("Quantity Before", lambda o: o.quantity_before),
        ("Quantity After", lambda o: o.quantity_after),
        ("Reference Type", lambda o: o.reference_type),
        ("Reference ID", lambda o: str(o.reference_id) if o.reference_id else ""),
        ("Performed By", lambda o: o.performed_by.full_name if o.performed_by_id else ""),
        ("Notes", lambda o: o.notes),
    )

    def get_queryset(self, request):
        # Ensure the FK columns in the CSV don't trigger N+1 during the
        # streamed export (the action's queryset derives from this).
        return super().get_queryset(request).select_related(
            "medicine", "batch", "performed_by"
        )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SupplierLedgerEntry)
class SupplierLedgerEntryAdmin(admin.ModelAdmin):
    """Append-only supplier accounts-payable ledger — fully read-only in admin
    (written only by pharmacy.services; the cached Supplier.outstanding_payable
    is derived from these rows)."""

    list_display = (
        "created_at",
        "supplier",
        "entry_type",
        "amount",
        "purchase_invoice",
        "payment_mode",
        "reference",
        "created_by",
    )
    list_filter = ("entry_type", "payment_mode", "created_at")
    search_fields = (
        "supplier__company_name",
        "purchase_invoice__invoice_number",
        "reference",
        "note",
    )
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_select_related = ("supplier", "purchase_invoice", "created_by")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
