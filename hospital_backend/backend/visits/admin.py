import csv

from django.contrib import admin
from django.contrib.admin.helpers import ACTION_CHECKBOX_NAME
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.utils import timezone

from .models import VisitSession


VISIT_EXPORT_FIELD_CHOICES = (
    ("visit_uid", "Visit UID"),
    ("patient_registration_number", "Patient Registration Number"),
    ("patient_name", "Patient Name"),
    ("checked_in_by_email", "Checked In By (Email)"),
    ("visit_date", "Visit Date"),
    ("visit_type", "Visit Type"),
    ("checkin_time", "Check-in Time"),
    ("completed_time", "Completed Time"),
    ("status", "Status"),
    ("current_stage", "Current Stage"),
    ("outstanding_debt_at_checkin", "Outstanding Debt At Check-in"),
    ("medicines_total", "Medicines Total"),
    ("created_at", "Created At"),
    ("updated_at", "Updated At"),
)

VISIT_EXPORT_FIELD_KEYS = [field for field, _label in VISIT_EXPORT_FIELD_CHOICES]


@admin.register(VisitSession)
class VisitSessionAdmin(admin.ModelAdmin):
    actions = ("export_selected_visits_csv",)

    list_display = ("visit_uid", "patient", "visit_date", "status", "current_stage")
    list_filter = ("status", "current_stage", "visit_date")
    search_fields = ("visit_uid", "patient__registration_number", "patient__full_name")

    default_export_fields = tuple(VISIT_EXPORT_FIELD_KEYS)

    @admin.action(description="Download selected visits as CSV")
    def export_selected_visits_csv(self, request, queryset):
        if "apply" in request.POST:
            selected_fields = request.POST.getlist("fields")
            allowed_fields = {field for field, _label in VISIT_EXPORT_FIELD_CHOICES}
            selected_fields = [field for field in selected_fields if field in allowed_fields]

            if not selected_fields:
                selected_fields = list(self.default_export_fields)

            return self._build_export_response(queryset, selected_fields)

        context = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "title": "Choose fields to export",
            "queryset": queryset,
            "selected_count": queryset.count(),
            "field_choices": VISIT_EXPORT_FIELD_CHOICES,
            "selected_fields": set(self.default_export_fields),
            "action_checkbox_name": ACTION_CHECKBOX_NAME,
            "action_name": "export_selected_visits_csv",
        }
        return TemplateResponse(
            request,
            "admin/visits/visitsession/export_fields.html",
            context,
        )

    def _build_export_response(self, queryset, selected_fields):
        labels = dict(VISIT_EXPORT_FIELD_CHOICES)

        response = HttpResponse(content_type="text/csv")
        timestamp = timezone.localtime().strftime("%Y%m%d_%H%M%S")
        response["Content-Disposition"] = (
            f'attachment; filename="visits_export_{timestamp}.csv"'
        )

        writer = csv.writer(response)
        writer.writerow([labels.get(field, field) for field in selected_fields])

        for visit in queryset.select_related("patient", "checked_in_by").iterator():
            row = []
            for field in selected_fields:
                value = self._extract_field_value(visit, field)
                if isinstance(value, list):
                    value = ", ".join(str(item) for item in value)
                row.append("" if value is None else value)
            writer.writerow(row)

        return response

    def _extract_field_value(self, visit, field):
        if field == "patient_registration_number":
            return visit.patient.registration_number
        if field == "patient_name":
            return visit.patient.full_name
        if field == "checked_in_by_email":
            return visit.checked_in_by.email
        return getattr(visit, field, "")
