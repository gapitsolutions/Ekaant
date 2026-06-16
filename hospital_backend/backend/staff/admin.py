from django.contrib import admin

from .models import Designation, Payslip, Staff, StaffAttendance


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
