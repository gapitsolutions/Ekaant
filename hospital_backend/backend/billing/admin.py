from django.contrib import admin

from .models import BillingSettings, PatientLedgerEntry


@admin.register(BillingSettings)
class BillingSettingsAdmin(admin.ModelAdmin):
    list_display = ("__str__", "default_consultation_fee", "updated_at")

    def has_add_permission(self, request):
        # Singleton — only the pk=1 row, created on first load().
        return not BillingSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PatientLedgerEntry)
class PatientLedgerEntryAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "patient",
        "entry_type",
        "amount",
        "dispense_invoice",
        "description",
    )
    list_filter = ("entry_type",)
    search_fields = ("patient__full_name", "patient__file_number", "description")
    readonly_fields = (
        "id",
        "patient",
        "entry_type",
        "amount",
        "dispense_invoice",
        "description",
        "created_by",
        "created_at",
    )

    def has_add_permission(self, request):
        return False  # Append-only via services, never by hand.

    def has_delete_permission(self, request, obj=None):
        return False
