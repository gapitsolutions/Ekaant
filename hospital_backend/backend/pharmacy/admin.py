from django.contrib import admin

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
)


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = (
        "company_name",
        "contact_person",
        "mobile_number",
        "gst_number",
        "drug_license_number",
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
    readonly_fields = ("created_at", "updated_at", "created_by", "updated_by")
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
            "Audit",
            {"fields": ("created_at", "updated_at", "created_by", "updated_by")},
        ),
    )


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "category",
        "bup_category",
        "manufacturer",
        "reorder_level",
        "selling_price",
        "is_active",
    )
    list_filter = ("category", "is_active", "bup_category")
    search_fields = ("name", "salt", "manufacturer")
    ordering = ("name",)
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


@admin.register(PurchaseInvoice)
class PurchaseInvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "supplier",
        "order_date",
        "invoice_date",
        "delivery_date",
        "items_count",
        "total_amount",
        "created_at",
    )
    list_filter = ("order_date", "invoice_date", "delivery_date", "supplier")
    search_fields = (
        "invoice_number",
        "supplier__company_name",
        "supplier__gst_number",
        "notes",
    )
    list_select_related = ("supplier",)
    autocomplete_fields = ("supplier",)
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
class StockMovementAdmin(admin.ModelAdmin):
    """Append-only ledger — fully read-only in admin."""

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

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
