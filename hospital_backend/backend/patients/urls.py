from django.urls import path

from .views import (
    PatientDetailView,
    PatientFingerprintTemplateView,
    PatientFollowUpDateUpdateView,
    PatientPhotoView,
    PatientGeneralUpdateView,
    PatientLookupView,
    PatientRegistrationView,
    ReceptionistPatientSummaryListView,
    PatientVisitsView,
    ReceptionistPatientListView,
)

urlpatterns = [
    path("patients/register/", PatientRegistrationView.as_view(), name="patient-register"),
    path("patients/lookup/", PatientLookupView.as_view(), name="patient-lookup"),
    path(
        "patients/<uuid:patient_id>/fingerprint-template/",
        PatientFingerprintTemplateView.as_view(),
        name="patient-fingerprint-template",
    ),
    path("patients/<uuid:patient_id>/photo/", PatientPhotoView.as_view(), name="patient-photo"),
    path("patients/<uuid:patient_id>/", PatientDetailView.as_view(), name="patient-detail"),
    path(
        "patients/<uuid:patient_id>/general/",
        PatientGeneralUpdateView.as_view(),
        name="patient-general-update",
    ),
    path(
        "patients/<uuid:patient_id>/next-followup-date/",
        PatientFollowUpDateUpdateView.as_view(),
        name="patient-next-followup-date",
    ),
    path("patients/<uuid:patient_id>/visits/", PatientVisitsView.as_view(), name="patient-visits"),
    path(
        "receptionist/patients/summary/",
        ReceptionistPatientSummaryListView.as_view(),
        name="receptionist-patients-summary",
    ),
    path("receptionist/patients/", ReceptionistPatientListView.as_view(), name="receptionist-patients"),
]
