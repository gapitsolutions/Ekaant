from django.contrib import admin

from .models import (
    AttendanceDaySubmission,
    Designation,
    Payslip,
    Staff,
    StaffAttendance,
)


@admin.register(Designation)
class DesignationAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)
    ordering = ("name",)


class StaffAttendanceInline(admin.TabularInline):
    """Per-staff attendance, editable inline so an admin can correct marks
    (the workflow for fixing a reception submission)."""

    model = StaffAttendance
    extra = 0
    fields = ("date", "status", "marked_by")
    readonly_fields = ("marked_by",)
    ordering = ("-date",)
    autocomplete_fields = ()


class PayslipInline(admin.TabularInline):
    """Generated payslips for a staff member — read-only snapshots."""

    model = Payslip
    extra = 0
    can_delete = False
    max_num = 0
    fields = ("year", "month", "net_pay", "deduction", "generated_at", "generated_by")
    readonly_fields = fields
    ordering = ("-year", "-month")

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = (
        "staff_code",
        "full_name",
        "designation",
        "employment_type",
        "joined_date",
        "monthly_salary",
        "is_active",
    )
    list_filter = ("is_active", "employment_type", "designation", "gender")
    search_fields = ("staff_code", "full_name", "mobile_number", "email")
    autocomplete_fields = ("designation",)
    ordering = ("full_name",)
    readonly_fields = ("created_at", "updated_at", "created_by")
    inlines = (StaffAttendanceInline, PayslipInline)
    fieldsets = (
        (
            "Identity & Role",
            {
                "fields": (
                    "staff_code",
                    "full_name",
                    "designation",
                    "employment_type",
                    "is_active",
                    "joined_date",
                    "gov_registration",
                )
            },
        ),
        (
            "Personal & Contact",
            {
                "fields": (
                    "date_of_birth",
                    "gender",
                    "mobile_number",
                    "email",
                    "address",
                    "photo",
                )
            },
        ),
        (
            "Confidential (PII)",
            {
                "classes": ("collapse",),
                "fields": (
                    "aadhaar_number",
                    "pan_number",
                    "bank_account_number",
                    "bank_ifsc",
                ),
            },
        ),
        (
            "Payroll configuration",
            {"fields": ("monthly_salary", "holiday_allowed", "sunday_holiday")},
        ),
        (
            "Audit",
            {"fields": ("created_at", "updated_at", "created_by")},
        ),
    )


@admin.register(StaffAttendance)
class StaffAttendanceAdmin(admin.ModelAdmin):
    list_display = ("staff", "date", "status", "marked_by")
    list_filter = ("status", "date")
    search_fields = ("staff__staff_code", "staff__full_name")
    autocomplete_fields = ("staff",)
    date_hierarchy = "date"
    ordering = ("-date",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(AttendanceDaySubmission)
class AttendanceDaySubmissionAdmin(admin.ModelAdmin):
    """Per-day attendance lock — a read-only audit record (written by the
    reception submit flow). Admins correct attendance via StaffAttendance, not
    by editing these."""

    list_display = ("date", "submitted_by", "submitted_by_role", "submitted_at")
    list_filter = ("submitted_by_role", "date")
    search_fields = ("submitted_by__full_name", "submitted_by__email")
    date_hierarchy = "date"
    ordering = ("-date",)
    readonly_fields = ("date", "submitted_by", "submitted_by_role", "submitted_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Payslip)
class PayslipAdmin(admin.ModelAdmin):
    """Immutable payslip snapshots generated via the payroll API. Exposed
    read-only — regeneration appends a new row, the latest is authoritative."""

    list_display = (
        "staff",
        "year",
        "month",
        "net_pay",
        "deduction",
        "generated_at",
        "generated_by",
    )
    list_filter = ("year", "month")
    search_fields = ("staff__staff_code", "staff__full_name")
    autocomplete_fields = ("staff",)
    ordering = ("-year", "-month", "-generated_at")
    list_select_related = ("staff", "generated_by")
    readonly_fields = (
        "staff",
        "year",
        "month",
        "monthly_salary",
        "days_in_month",
        "sundays_in_month",
        "sunday_holiday",
        "holiday_allowed",
        "present_days",
        "absent_days",
        "half_days",
        "paid_leave_used",
        "unpaid_absent",
        "per_day_rate",
        "deduction",
        "net_pay",
        "generated_by",
        "generated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
