from django.contrib import admin

from .models import FollowUpCallAttempt, FollowUpTicket


@admin.register(FollowUpTicket)
class FollowUpTicketAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "patient",
        "cycle_number",
        "follow_up_date",
        "status",
        "pending_since",
        "next_call_date",
        "successful_at",
    )
    list_filter = ("status", "patient__patient_category", "follow_up_date", "pending_since")
    search_fields = ("patient__file_number", "patient__full_name", "patient__phone_number")
    ordering = ("-pending_since", "-created_at")


@admin.register(FollowUpCallAttempt)
class FollowUpCallAttemptAdmin(admin.ModelAdmin):
    list_display = ("id", "ticket", "result", "called_by", "called_at", "next_call_date")
    list_filter = ("result", "called_at")
    search_fields = ("ticket__patient__file_number", "ticket__patient__full_name", "note")
    ordering = ("-called_at",)
