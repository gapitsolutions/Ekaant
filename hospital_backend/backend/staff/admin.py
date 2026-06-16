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
    search_fields = ("name",)


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = (
        "staff_code",
        "full_name",
        "designation",
        "employment_type",
        "is_active",
    )
    list_filter = ("is_active", "employment_type", "designation")
    search_fields = ("staff_code", "full_name", "mobile_number", "email")
    autocomplete_fields = ("designation",)


@admin.register(StaffAttendance)
class StaffAttendanceAdmin(admin.ModelAdmin):
    list_display = ("staff", "date", "status", "marked_by")
    list_filter = ("status", "date")
    search_fields = ("staff__staff_code", "staff__full_name")
    autocomplete_fields = ("staff",)


@admin.register(AttendanceDaySubmission)
class AttendanceDaySubmissionAdmin(admin.ModelAdmin):
    list_display = ("date", "submitted_by", "submitted_by_role", "submitted_at")
    list_filter = ("submitted_by_role", "date")
    search_fields = ("submitted_by__full_name", "submitted_by__email")
