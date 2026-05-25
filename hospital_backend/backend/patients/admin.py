import csv

from django.contrib import admin
from django.contrib.admin.helpers import ACTION_CHECKBOX_NAME
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.utils import timezone

from .models import Patient


PATIENT_EXPORT_FIELD_CHOICES = (
    ("file_number", "File Number"),
    ("hdams_id", "HDAMS ID"),
    ("full_name", "Full Name"),
    ("patient_category", "Patient Category"),
    ("status", "Status"),
    ("phone_number", "Phone Number"),
    ("aadhaar_number", "Aadhaar Number"),
    ("date_of_birth", "Date of Birth"),
    ("sex", "Sex"),
    ("registration_date", "Registration Date"),
    ("district", "District"),
    ("state", "State"),
    ("created_at", "Created At"),
    ("updated_at", "Updated At"),
)

PATIENT_EXPORT_FIELD_KEYS = [field for field, _label in PATIENT_EXPORT_FIELD_CHOICES]


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    actions = ("export_selected_patients_csv",)

    list_display = (
        "file_number",
        "full_name",
        "patient_category",
        "phone_number",
        "status",
        "registration_date",
    )
    list_filter = ("patient_category", "status", "sex")
    search_fields = (
        "file_number",
        "full_name",
        "phone_number",
        "aadhaar_number",
    )

    default_export_fields = tuple(PATIENT_EXPORT_FIELD_KEYS)

    @admin.action(description="Download selected patients as CSV")
    def export_selected_patients_csv(self, request, queryset):
        if "apply" in request.POST:
            selected_fields = request.POST.getlist("fields")
            allowed_fields = {field for field, _label in PATIENT_EXPORT_FIELD_CHOICES}
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
            "field_choices": PATIENT_EXPORT_FIELD_CHOICES,
            "selected_fields": set(self.default_export_fields),
            "action_checkbox_name": ACTION_CHECKBOX_NAME,
            "action_name": "export_selected_patients_csv",
        }
        return TemplateResponse(
            request,
            "admin/patients/patient/export_fields.html",
            context,
        )

    def _build_export_response(self, queryset, selected_fields):
        labels = dict(PATIENT_EXPORT_FIELD_CHOICES)

        response = HttpResponse(content_type="text/csv")
        timestamp = timezone.localtime().strftime("%Y%m%d_%H%M%S")
        response["Content-Disposition"] = (
            f'attachment; filename="patients_export_{timestamp}.csv"'
        )

        writer = csv.writer(response)
        writer.writerow([labels.get(field, field) for field in selected_fields])

        for patient in queryset.iterator():
            row = []
            for field in selected_fields:
                value = getattr(patient, field, "")
                if isinstance(value, list):
                    value = ", ".join(str(item) for item in value)
                row.append("" if value is None else value)
            writer.writerow(row)

        return response
