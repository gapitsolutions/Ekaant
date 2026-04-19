import base64
import binascii
import mimetypes
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from core.exceptions import ConflictError
from core.pagination import paginate_queryset
from core.permissions import IsReceptionOrAdmin
from core.responses import success_response
from patients.models import Patient, PatientStatus

from .models import CheckinVerificationMethod, VisitSession, VisitStage, VisitStatus


MAX_VERIFICATION_PHOTO_BYTES = 2 * 1024 * 1024
ALLOWED_VERIFICATION_PHOTO_MIME_TYPES = {"image/jpeg", "image/png"}


def _decode_verification_photo_payload(payload: str) -> bytes:
    compact_payload = "".join(payload.split())
    if not compact_payload:
        raise serializers.ValidationError("Invalid verification_photo_base64 payload")

    max_encoded_chars = ((MAX_VERIFICATION_PHOTO_BYTES * 4) // 3) + 8
    if len(compact_payload) > max_encoded_chars:
        raise serializers.ValidationError("Verification photo exceeds maximum allowed size (2 MB)")

    try:
        decoded = base64.b64decode(compact_payload, validate=True)
    except (binascii.Error, ValueError):
        raise serializers.ValidationError("Invalid verification_photo_base64 payload")

    if not decoded:
        raise serializers.ValidationError("Invalid verification_photo_base64 payload")

    if len(decoded) > MAX_VERIFICATION_PHOTO_BYTES:
        raise serializers.ValidationError("Verification photo exceeds maximum allowed size (2 MB)")

    return decoded


class CheckinRequestSerializer(serializers.Serializer):
    patient_id = serializers.UUIDField()
    verification_method = serializers.ChoiceField(
        choices=CheckinVerificationMethod.choices,
        required=False,
        default=CheckinVerificationMethod.FINGERPRINT,
    )
    verification_photo_base64 = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
    )
    verification_photo_mime_type = serializers.CharField(required=False, allow_blank=True)
    verification_photo_captured_at = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        method = attrs.get("verification_method", CheckinVerificationMethod.FINGERPRINT)
        photo_base64 = attrs.get("verification_photo_base64", "")
        photo_mime_type = (attrs.get("verification_photo_mime_type") or "").strip().lower()
        if photo_mime_type:
            attrs["verification_photo_mime_type"] = photo_mime_type

        if method == CheckinVerificationMethod.PHOTO:
            if bool(photo_base64) != bool(photo_mime_type):
                raise serializers.ValidationError(
                    "verification_photo_base64 and verification_photo_mime_type must be provided together"
                )

            if not photo_base64:
                raise serializers.ValidationError(
                    "verification photo is required when verification_method is photo"
                )

            if photo_mime_type not in ALLOWED_VERIFICATION_PHOTO_MIME_TYPES:
                raise serializers.ValidationError(
                    "Unsupported verification_photo_mime_type. Allowed: image/jpeg, image/png"
                )

            attrs["_decoded_verification_photo"] = _decode_verification_photo_payload(photo_base64)
        else:
            if photo_base64 or photo_mime_type:
                raise serializers.ValidationError(
                    "verification_photo_* fields are only allowed when verification_method is photo"
                )

        return attrs


class DailyReportQuerySerializer(serializers.Serializer):
    date = serializers.DateField(required=False)


class MonthlyReportQuerySerializer(serializers.Serializer):
    year = serializers.IntegerField(required=False, min_value=2000, max_value=2100)
    month = serializers.IntegerField(required=False, min_value=1, max_value=12)


class CustomRangeReportQuerySerializer(serializers.Serializer):
    start_date = serializers.DateField(required=True)
    end_date = serializers.DateField(required=True)

    def validate(self, attrs):
        if attrs["start_date"] > attrs["end_date"]:
            raise serializers.ValidationError("start_date cannot be after end_date")
        return attrs


class CheckinHistoryQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=True)
    page = serializers.IntegerField(required=False, min_value=1, default=1)
    pageSize = serializers.IntegerField(required=False, min_value=1, default=50)
    verification_method = serializers.ChoiceField(
        choices=CheckinVerificationMethod.choices,
        required=False,
    )
    status = serializers.ChoiceField(choices=VisitStatus.choices, required=False)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)

    def validate(self, attrs):
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError("start_date cannot be after end_date")
        return attrs


def _report_patient_payload(patient: Patient):
    return {
        "registration_number": patient.registration_number,
        "full_name": patient.full_name,
        "date_of_birth": patient.date_of_birth,
        "gender": patient.sex,
        "phone": patient.phone_number,
        "patient_category": patient.patient_category,
    }


def _queue_item_payload(session: VisitSession):
    return {
        "session_id": str(session.pk),
        "patient_id": str(session.patient_id),
        "patient_name": session.patient.full_name,
        "checked_in_at": session.checkin_time,
        "checked_in_by_name": session.checked_in_by.full_name,
        "status": session.status,
        "current_stage": session.current_stage,
        "outstanding_debt": session.outstanding_debt_at_checkin,
    }


def _report_session_payload(session: VisitSession):
    return {
        "id": str(session.pk),
        "patient_id": str(session.patient_id),
        "visit_date": session.visit_date,
        "checkin_time": session.checkin_time,
        "status": session.status,
        "current_stage": session.current_stage,
        "patient": _report_patient_payload(session.patient),
    }


def _build_daily_report_payload(target_date):
    daily_sessions = (
        VisitSession.objects.select_related("patient")
        .filter(visit_date=target_date)
        .order_by("checkin_time")
    )

    return {
        "date": target_date,
        "total_checkins": daily_sessions.count(),
        "active_checkins": daily_sessions.filter(status=VisitStatus.IN_PROGRESS).count(),
        "completed_checkins": daily_sessions.filter(status=VisitStatus.COMPLETED).count(),
        "items": [_report_session_payload(session) for session in daily_sessions],
    }


def _build_monthly_report_payload(*, year: int, month: int):
    monthly_sessions = VisitSession.objects.filter(
        visit_date__year=year,
        visit_date__month=month,
    )
    return {
        "year": year,
        "month": month,
        "total_checkins": monthly_sessions.count(),
        "active_checkins": monthly_sessions.filter(status=VisitStatus.IN_PROGRESS).count(),
        "completed_checkins": monthly_sessions.filter(status=VisitStatus.COMPLETED).count(),
        "breakdown": VisitSession.build_month_breakdown(year=year, month=month),
    }


def _build_custom_range_report_payload(*, start_date, end_date):
    range_sessions = (
        VisitSession.objects.select_related("patient")
        .filter(visit_date__gte=start_date, visit_date__lte=end_date)
        .order_by("-visit_date", "-checkin_time")
    )
    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_checkins": range_sessions.count(),
        "active_checkins": range_sessions.filter(status=VisitStatus.IN_PROGRESS).count(),
        "completed_checkins": range_sessions.filter(status=VisitStatus.COMPLETED).count(),
        "unique_patients": range_sessions.values("patient_id").distinct().count(),
        "items": [_report_session_payload(session) for session in range_sessions],
    }


def _resolve_media_path(path_value: str):
    media_root = getattr(settings, "MEDIA_ROOT", "")
    if not media_root or not path_value:
        return None, None

    root = Path(media_root).resolve()
    candidate = (root / path_value).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None, None

    return root, candidate


def _delete_media_file_and_empty_dirs(path_value: str):
    root, candidate = _resolve_media_path(path_value)
    if not root or not candidate:
        return

    if candidate.exists():
        candidate.unlink(missing_ok=True)

    parent = candidate.parent
    while parent != root and parent.exists():
        try:
            parent.rmdir()
        except OSError:
            break
        parent = parent.parent


def _checkin_history_session_payload(session: VisitSession, request):
    verification_photo_url = None
    if session.verification_photo:
        verification_photo_url = request.build_absolute_uri(
            reverse(
                "receptionist-checkin-history-photo",
                kwargs={"session_id": session.pk},
            )
        )

    return {
        "id": str(session.pk),
        "visit_uid": session.visit_uid,
        "patient_id": str(session.patient_id),
        "visit_date": session.visit_date,
        "visit_type": session.visit_type,
        "checkin_time": session.checkin_time,
        "completed_time": session.completed_time,
        "status": session.status,
        "current_stage": session.current_stage,
        "checked_in_by_name": session.checked_in_by.full_name,
        "outstanding_debt_at_checkin": session.outstanding_debt_at_checkin,
        "verification_method": session.verification_method,
        "verification_photo_captured_at": session.verification_photo_captured_at,
        "verification_photo_available": bool(session.verification_photo),
        "verification_photo_url": verification_photo_url,
        "patient": {
            "registration_number": session.patient.registration_number,
            "full_name": session.patient.full_name,
            "date_of_birth": session.patient.date_of_birth,
            "gender": session.patient.sex,
            "phone": session.patient.phone_number,
            "patient_category": session.patient.patient_category,
            "address_line1": session.patient.address_line1,
            "relative_phone": session.patient.relative_phone,
            "blood_group": session.patient.blood_group,
            "addiction_type": session.patient.addiction_type,
            "addiction_duration": session.patient.addiction_duration,
        },
    }


class CheckinPatientView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def post(self, request):
        serializer = CheckinRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        verification_method = serializer.validated_data["verification_method"]
        verification_photo_bytes = serializer.validated_data.get("_decoded_verification_photo")
        verification_photo_mime_type = serializer.validated_data.get("verification_photo_mime_type")
        verification_photo_captured_at = serializer.validated_data.get(
            "verification_photo_captured_at"
        )

        patient = get_object_or_404(Patient, pk=serializer.validated_data["patient_id"])

        if patient.status == PatientStatus.DEAD:
            raise serializers.ValidationError(
                "This patient is marked as deceased and cannot be checked in."
            )

        today = timezone.localdate()
        existing_session = VisitSession.objects.filter(
            patient=patient,
            visit_date=today,
        ).first()
        if existing_session:
            raise ConflictError("This patient is already checked in for today.")

        prior_visits = VisitSession.objects.filter(patient=patient).count()
        now = timezone.now()
        session = VisitSession.objects.create(
            visit_uid=VisitSession.generate_visit_uid(),
            patient=patient,
            checked_in_by=request.user,
            visit_type="first_visit" if prior_visits == 0 else "follow_up",
            outstanding_debt_at_checkin=patient.outstanding_debt,
            status=VisitStatus.COMPLETED,
            current_stage=VisitStage.COMPLETED,
            completed_time=now,
            verification_method=verification_method,
            verification_photo_captured_at=verification_photo_captured_at
            or (now if verification_method == CheckinVerificationMethod.PHOTO else None),
        )

        if verification_photo_bytes and verification_photo_mime_type:
            extension = "jpg" if verification_photo_mime_type == "image/jpeg" else "png"
            filename = f"checkin_{session.visit_uid}_{now.strftime('%Y%m%d%H%M%S')}.{extension}"
            session.verification_photo.save(filename, ContentFile(verification_photo_bytes), save=False)
            session.save(update_fields=["verification_photo", "updated_at"])

        return success_response(
            {
                "session_id": str(session.pk),
                "patient_id": str(patient.pk),
                "patient_name": patient.full_name,
                "checked_in_by_name": request.user.full_name,
                "checked_in_at": session.checkin_time,
                "status": VisitStatus.COMPLETED,
                "current_stage": VisitStage.COMPLETED,
                "completed_at": session.completed_time,
                "outstanding_debt_at_checkin": session.outstanding_debt_at_checkin,
                "verification_method": session.verification_method,
                "verification_photo_captured_at": session.verification_photo_captured_at,
            },
            status_code=status.HTTP_201_CREATED,
        )


class DashboardStatsView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        today = timezone.localdate()
        total_patients = Patient.objects.count()
        today_sessions = VisitSession.objects.filter(visit_date=today)
        completed_today = today_sessions.filter(status=VisitStatus.COMPLETED).count()

        return success_response(
            {
                "totalPatients": total_patients,
                "todayVisits": today_sessions.count(),
                "completedToday": completed_today,
            }
        )


class QueueStatusView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        today = timezone.localdate()
        sessions = (
            VisitSession.objects.select_related("patient", "checked_in_by")
            .filter(visit_date=today, status=VisitStatus.COMPLETED)
            .order_by("-checkin_time")
        )
        items = [_queue_item_payload(session) for session in sessions]
        return success_response({"items": items, "total": len(items)})


class ReceptionDailyReportView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        serializer = DailyReportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        target_date = serializer.validated_data.get("date") or timezone.localdate()
        return success_response(_build_daily_report_payload(target_date))


class ReceptionMonthlyReportView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        serializer = MonthlyReportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        today = timezone.localdate()
        target_year = serializer.validated_data.get("year", today.year)
        target_month = serializer.validated_data.get("month", today.month)

        return success_response(
            _build_monthly_report_payload(year=target_year, month=target_month)
        )


class ReceptionCustomRangeReportView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        serializer = CustomRangeReportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        start_date = serializer.validated_data["start_date"]
        end_date = serializer.validated_data["end_date"]

        return success_response(
            _build_custom_range_report_payload(start_date=start_date, end_date=end_date)
        )


class ReceptionCheckinHistoryListView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        serializer = CheckinHistoryQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        query = (serializer.validated_data.get("q") or "").strip()
        page = serializer.validated_data["page"]
        page_size = serializer.validated_data["pageSize"]
        verification_method = serializer.validated_data.get("verification_method")
        status_filter = serializer.validated_data.get("status")
        start_date = serializer.validated_data.get("start_date")
        end_date = serializer.validated_data.get("end_date")

        queryset = VisitSession.objects.select_related("patient", "checked_in_by").order_by(
            "-checkin_time"
        )

        if query:
            queryset = queryset.filter(
                Q(visit_uid__icontains=query)
                | Q(patient__registration_number__icontains=query)
                | Q(patient__full_name__icontains=query)
                | Q(patient__phone_number__icontains=query)
            )

        if verification_method:
            queryset = queryset.filter(verification_method=verification_method)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if start_date:
            queryset = queryset.filter(visit_date__gte=start_date)

        if end_date:
            queryset = queryset.filter(visit_date__lte=end_date)

        paginated_queryset, pagination = paginate_queryset(queryset, page, page_size)
        items = [
            _checkin_history_session_payload(session, request) for session in paginated_queryset
        ]
        return success_response({"items": items, "pagination": pagination})


class ReceptionCheckinHistoryPhotoView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def get(self, request, session_id):
        session = get_object_or_404(VisitSession, pk=session_id)
        if not session.verification_photo:
            raise NotFound("Verification photo not found.")

        guessed_type, _ = mimetypes.guess_type(session.verification_photo.name)
        content_type = guessed_type or "application/octet-stream"
        response = FileResponse(session.verification_photo.open("rb"), content_type=content_type)
        response["Cache-Control"] = "private, no-store"
        return response


class ReceptionCheckinHistoryDeleteView(APIView):
    permission_classes = [IsReceptionOrAdmin]

    def delete(self, request, session_id):
        session = get_object_or_404(VisitSession, pk=session_id)
        verification_photo_name = session.verification_photo.name if session.verification_photo else ""
        session_pk = str(session.pk)
        patient_id = str(session.patient_id)

        with transaction.atomic():
            session.delete()
            if verification_photo_name:
                transaction.on_commit(
                    lambda photo_name=verification_photo_name: _delete_media_file_and_empty_dirs(
                        photo_name
                    )
                )

        return success_response(
            {
                "deleted": True,
                "session_id": session_pk,
                "patient_id": patient_id,
            }
        )
