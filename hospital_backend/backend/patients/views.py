import mimetypes
import shutil
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from core.pagination import paginate_queryset
from core.permissions import IsReceptionAdminOrPharmacist, IsReceptionOrAdmin
from core.responses import success_response
from visits.models import VisitSession

from .models import Patient
from .serializers import (
    PatientGeneralDataSerializer,
    PatientFollowUpDateUpdateSerializer,
    PatientGeneralUpdateSerializer,
    PatientLookupSerializer,
    PatientRegistrationSerializer,
    PatientSummarySerializer,
    patient_search_queryset,
)


def _patient_media_dir(patient_id):
    media_root = getattr(settings, "MEDIA_ROOT", "")
    if not media_root:
        return None

    root = Path(media_root).resolve()
    candidate = (root / "patients" / str(patient_id)).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def _apply_reception_list_filters(request, queryset):
    district = request.query_params.get("district", "").strip()
    state = request.query_params.get("state", "").strip()
    addiction_type = request.query_params.get("addiction_type", "").strip()
    registration_start = request.query_params.get("registration_start", "").strip()
    registration_end = request.query_params.get("registration_end", "").strip()

    if district:
        queryset = queryset.filter(district__iexact=district)

    if state:
        queryset = queryset.filter(state__iexact=state)

    if addiction_type:
        queryset = queryset.filter(addiction_type=addiction_type)

    if registration_start:
        start_date = parse_date(registration_start)
        if start_date:
            queryset = queryset.filter(registration_date__gte=start_date)

    if registration_end:
        end_date = parse_date(registration_end)
        if end_date:
            queryset = queryset.filter(registration_date__lte=end_date)

    return queryset


class PatientRegistrationView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def post(self, request):
        serializer = PatientRegistrationSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        patient = serializer.save()
        payload = PatientLookupSerializer(
            patient,
            context={"request": request},
        ).data
        payload["fingerprint_reenrollment_required"] = False
        return success_response(payload, status_code=status.HTTP_201_CREATED)


class PatientLookupView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        file_number = request.query_params.get("file_number", "").strip()

        if file_number:
            queryset = Patient.objects.filter(file_number__iexact=file_number)
        elif query:
            queryset = patient_search_queryset(query)
        else:
            return success_response({"items": [], "total": 0})

        items = PatientLookupSerializer(
            queryset.order_by("file_number"),
            many=True,
            context={"request": request},
        ).data
        return success_response({"items": items, "total": len(items)})


class PatientFingerprintTemplateView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request, patient_id):
        patient = get_object_or_404(Patient, pk=patient_id)
        if not patient.fingerprint_template:
            raise NotFound("Fingerprint enrollment not found.")

        return success_response(
            {
                "patient_id": str(patient.pk),
                "fingerprint_template": patient.fingerprint_template,
                "fingerprint_enrolled_at": patient.fingerprint_enrolled_at,
                "fingerprint_template_key_version": patient.fingerprint_template_key_version,
            }
        )


class PatientPhotoView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request, patient_id):
        patient = get_object_or_404(Patient, pk=patient_id)
        if not patient.photo:
            raise NotFound("Patient photo not found.")

        guessed_type, _ = mimetypes.guess_type(patient.photo.name)
        content_type = guessed_type or "application/octet-stream"

        response = FileResponse(
            patient.photo.open("rb"),
            content_type=content_type,
        )
        response["Cache-Control"] = "private, no-store"
        return response


class ReceptionistPatientListView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        try:
            page = int(request.query_params.get("page", 1))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get("pageSize", 100))
        except (TypeError, ValueError):
            page_size = 100

        queryset = Patient.objects.all().order_by("file_number")
        if query:
            queryset = patient_search_queryset(query).order_by("file_number")

        queryset = _apply_reception_list_filters(request, queryset)

        paginated_queryset, pagination = paginate_queryset(queryset, page, page_size)
        items = PatientLookupSerializer(
            paginated_queryset,
            many=True,
            context={"request": request},
        ).data

        return success_response({"items": items, "pagination": pagination})


class ReceptionistPatientSummaryListView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        try:
            page = int(request.query_params.get("page", 1))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get("pageSize", 100))
        except (TypeError, ValueError):
            page_size = 100

        queryset = Patient.objects.all().order_by("file_number")
        if query:
            queryset = patient_search_queryset(query).order_by("file_number")

        queryset = _apply_reception_list_filters(request, queryset)

        paginated_queryset, pagination = paginate_queryset(queryset, page, page_size)
        items = PatientSummarySerializer(
            paginated_queryset,
            many=True,
            context={"request": request},
        ).data

        return success_response({"items": items, "pagination": pagination})


class PatientDetailView(APIView):
    permission_classes = [IsReceptionAdminOrPharmacist]

    def get(self, request, patient_id):
        patient = get_object_or_404(Patient, pk=patient_id)
        return success_response(
            PatientGeneralDataSerializer(
                patient,
                context={"request": request},
            ).data
        )

    def delete(self, request, patient_id):
        patient = get_object_or_404(Patient, pk=patient_id)
        media_dir = _patient_media_dir(patient.pk)

        with transaction.atomic():
            patient.delete()
            if media_dir is not None:
                transaction.on_commit(lambda: shutil.rmtree(media_dir, ignore_errors=True))

        return success_response(
            {
                "deleted": True,
                "patient_id": str(patient_id),
            },
            status_code=status.HTTP_200_OK,
        )


class PatientGeneralUpdateView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def patch(self, request, patient_id):
        patient = get_object_or_404(Patient, pk=patient_id)
        serializer = PatientGeneralUpdateSerializer(
            patient,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        updated_patient = serializer.save()
        return success_response(
            PatientGeneralDataSerializer(
                updated_patient,
                context={"request": request},
            ).data
        )


class PatientFollowUpDateUpdateView(APIView):
    permission_classes = [IsReceptionAdminOrPharmacist]

    def patch(self, request, patient_id):
        patient = get_object_or_404(Patient, pk=patient_id)
        serializer = PatientFollowUpDateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if "next_followup_date" not in serializer.validated_data:
            return success_response(
                {
                    "patient_id": str(patient.pk),
                    "next_followup_date": patient.next_followup_date,
                }
            )

        patient.next_followup_date = serializer.validated_data["next_followup_date"]
        patient.save(update_fields=["next_followup_date", "updated_at"])

        return success_response(
            {
                "patient_id": str(patient.pk),
                "next_followup_date": patient.next_followup_date,
            }
        )


class PatientVisitsView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request, patient_id):
        patient = get_object_or_404(Patient, pk=patient_id)
        visits = VisitSession.objects.filter(patient=patient).order_by("-visit_date", "-checkin_time")
        items = [
            {
                "id": str(visit.pk),
                "visit_uid": visit.visit_uid,
                "visit_date": visit.visit_date,
                "visit_type": visit.visit_type,
                "checkin_time": visit.checkin_time,
                "completed_time": visit.completed_time,
                "status": visit.status,
                "current_stage": visit.current_stage,
                "medicines_total": visit.medicines_total,
            }
            for visit in visits
        ]
        return success_response({"items": items})
