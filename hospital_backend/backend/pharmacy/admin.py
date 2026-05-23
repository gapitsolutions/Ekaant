from django.contrib import admin

from .models import (
    DispenseInvoice,
    DispenseInvoiceItem,
    Medicine,
    MedicineBatch,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    StockAuditRemoval,
    StockMovement,
)


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "bup_category", "manufacturer", "is_active")
    list_filter = ("category", "is_active")
    search_fields = ("name", "salt", "manufacturer")


@admin.register(MedicineBatch)
class MedicineBatchAdmin(admin.ModelAdmin):
    list_display = ("medicine", "batch_number", "expiry_date", "quantity", "is_active")
    list_filter = ("is_active",)
    search_fields = ("batch_number", "medicine__name")


@admin.register(PurchaseInvoice)
class PurchaseInvoiceAdmin(admin.ModelAdmin):
    list_display = ("invoice_number", "supplier", "invoice_date", "total_amount")
    search_fields = ("invoice_number", "supplier")


@admin.register(DispenseInvoice)
class DispenseInvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "patient",
        "dispensed_by",
        "dispense_date",
        "net_payable",
        "status",
    )
    list_filter = ("status", "payment_method")
    search_fields = ("invoice_number", "patient__full_name")


admin.site.register(PurchaseInvoiceItem)
admin.site.register(DispenseInvoiceItem)
admin.site.register(StockAuditRemoval)
admin.site.register(StockMovement)
