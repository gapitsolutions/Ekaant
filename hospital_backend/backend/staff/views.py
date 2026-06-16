import mimetypes

from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers as drf_serializers
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from core.pagination import paginate_queryset
from core.permissions import IsAdminRole, IsReceptionOrAdmin
from core.responses import success_response

from . import services
from .models import Designation, Payslip, Staff, StaffAttendance
from .serializers import (
    BulkAttendanceSerializer,
    DesignationSerializer,
    PayslipGenerateSerializer,
    PayslipSerializer,
    SingleAttendanceSerializer,
    StaffListItemSerializer,
    StaffReadSerializer,
    StaffWriteSerializer,
)


class DesignationListCreateView(APIView):
    """Active designations (the dynamic job-title lookup). Admin-only."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        designations = Designation.objects.filter(is_active=True).order_by("name")
        return success_response(
            {"items": DesignationSerializer(designations, many=True).data}
        )

    def post(self, request):
        serializer = DesignationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(serializer.data, status_code=201)


class StaffSummaryView(APIView):
    """Directory-wide KPI aggregate for the staff console cards. Admin-only."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        return success_response(services.staff_summary())


class StaffPhotoView(APIView):
    """Serve a staff member's profile photo through a permission gate
    (admin-only) instead of the raw /media/ URL, mirroring PatientPhotoView so
    staff PII isn't exposed on open media."""

    permission_classes = [IsAdminRole]

    def get(self, request, staff_id):
        staff = get_object_or_404(Staff, pk=staff_id)
        if not staff.photo:
            raise NotFound("Staff photo not found.")
        guessed_type, _ = mimetypes.guess_type(staff.photo.name)
        response = FileResponse(
            staff.photo.open("rb"),
            content_type=guessed_type or "application/octet-stream",
        )
        response["Cache-Control"] = "private, no-store"
        return response


class StaffListCreateView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        queryset = Staff.objects.select_related("designation").all()

        q = (request.query_params.get("q") or "").strip()
        designation = (request.query_params.get("designation") or "").strip()
        status_filter = (request.query_params.get("status") or "").strip()

        if q:
            queryset = queryset.filter(
                Q(full_name__icontains=q)
                | Q(staff_code__icontains=q)
                | Q(mobile_number__icontains=q)
                | Q(email__icontains=q)
            )
        if designation:
            queryset = queryset.filter(designation__name__iexact=designation)
        if status_filter == "active":
            queryset = queryset.filter(is_active=True)
        elif status_filter == "inactive":
            queryset = queryset.filter(is_active=False)

        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("pageSize", 50))
        except (TypeError, ValueError):
            page, page_size = 1, 50

        paginated, pagination = paginate_queryset(queryset, page, page_size)
        items = StaffListItemSerializer(
            paginated, many=True, context={"request": request}
        ).data
        return success_response({"items": items, "pagination": pagination})

    def post(self, request):
        serializer = StaffWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = services.create_staff(data=serializer.validated_data, user=request.user)
        return success_response(
            StaffReadSerializer(staff, context={"request": request}).data,
            status_code=201,
        )


class StaffDetailView(APIView):
    permission_classes = [IsAdminRole]

    def _get(self, pk):
        return get_object_or_404(Staff.objects.select_related("designation"), pk=pk)

    def get(self, request, staff_id):
        staff = self._get(staff_id)
        return success_response(
            StaffReadSerializer(staff, context={"request": request}).data
        )

    def patch(self, request, staff_id):
        staff = self._get(staff_id)
        serializer = StaffWriteSerializer(staff, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        staff = services.update_staff(staff=staff, data=serializer.validated_data)
        return success_response(
            StaffReadSerializer(staff, context={"request": request}).data
        )

    def delete(self, request, staff_id):
        """Soft-delete — flip ``is_active`` to False (preserves history)."""
        staff = self._get(staff_id)
        if staff.is_active:
            staff.is_active = False
            staff.save(update_fields=["is_active", "updated_at"])
        return success_response(
            {"deactivated": True, "staff_id": str(staff.pk), "is_active": staff.is_active}
        )


class AttendanceRosterView(APIView):
    """Daily attendance roster (admin-only).

    GET ?date=YYYY-MM-DD — every active staff member with their mark for that
    date (``status`` null when unmarked) so the UI can render a bulk-mark grid,
    plus the day's submission/lock state.
    POST — bulk upsert ``{ date, entries: [{staff_id, status}] }``.

    Reception + admin. Reception is restricted to **today** and may submit a
    day only **once** (the day is then locked — no edits). Admin may mark/edit
    any day repeatedly and is never blocked by the lock.
    """

    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        date_str = (request.query_params.get("date") or "").strip()
        if not date_str:
            raise drf_serializers.ValidationError("date is required (YYYY-MM-DD).")

        submission = services.day_submission(date_str)
        is_admin = getattr(request.user, "role", None) == "admin"
        return success_response(
            {
                "date": date_str,
                "items": services.attendance_roster(date_str),
                "submission": services.submission_dict(submission),
                # Admins can always mark/edit; reception only if not yet locked.
                "can_submit": is_admin or submission is None,
            }
        )

    def post(self, request):
        serializer = BulkAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        on_date = serializer.validated_data["date"]
        entries = serializer.validated_data["entries"]
        is_admin = getattr(request.user, "role", None) == "admin"

        if is_admin:
            # Admin path — unlocked, may mark/edit any day repeatedly.
            written = services.bulk_mark_attendance(
                on_date=on_date, entries=entries, user=request.user
            )
            return success_response(
                {"date": on_date, "marked": written, "submission": None}
            )

        # Reception path — today only, once per day, then locked.
        if on_date != timezone.localdate():
            raise drf_serializers.ValidationError(
                "Reception can only mark attendance for the current day."
            )
        result = services.submit_daily_attendance(
            on_date=on_date, entries=entries, user=request.user
        )
        return success_response(
            {
                "date": on_date,
                "marked": result["marked"],
                "submission": services.submission_dict(result["submission"]),
            }
        )


class AttendanceTodayStatusView(APIView):
    """Lightweight today's-attendance lock state for the reception dashboard
    button — avoids fetching the full roster just to read submission state."""

    permission_classes = [IsReceptionOrAdmin]

    def get(self, request):
        return success_response(services.today_attendance_status())


class StaffAttendanceView(APIView):
    """Per-staff monthly attendance (admin-only).

    GET ?month=YYYY-MM — per-day map + summary stats.
    PATCH — upsert one day ``{ date, status }``.
    """

    permission_classes = [IsAdminRole]

    def get(self, request, staff_id):
        get_object_or_404(Staff, pk=staff_id)
        year, month = services._parse_month(
            (request.query_params.get("month") or "").strip()
        )
        return success_response(
            services.month_attendance(staff_id=staff_id, year=year, month=month)
        )

    def patch(self, request, staff_id):
        get_object_or_404(Staff, pk=staff_id)
        serializer = SingleAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.upsert_attendance(
            staff_id=staff_id,
            on_date=serializer.validated_data["date"],
            status=serializer.validated_data["status"],
            user=request.user,
        )
        return success_response({"updated": True})


class StaffPayrollView(APIView):
    """Compute (preview) a month's pay for one staff member. Admin-only.
    Does NOT persist — use the payslips endpoint to store a snapshot."""

    permission_classes = [IsAdminRole]

    def get(self, request, staff_id):
        staff = get_object_or_404(Staff, pk=staff_id)
        year, month = services._parse_month(
            (request.query_params.get("month") or "").strip()
        )
        payroll = services.compute_payroll(staff=staff, year=year, month=month)
        # Decimals serialise cleanly via DRF's JSON encoder.
        return success_response(payroll)


class StaffPayslipView(APIView):
    """Generate (POST) + list (GET) stored payslips for one staff member.
    Admin-only. Regenerating a month creates a new snapshot (history kept)."""

    permission_classes = [IsAdminRole]

    def get(self, request, staff_id):
        get_object_or_404(Staff, pk=staff_id)
        payslips = Payslip.objects.filter(staff_id=staff_id).select_related(
            "staff", "staff__designation", "generated_by"
        )
        return success_response(
            {"items": PayslipSerializer(payslips, many=True).data}
        )

    def post(self, request, staff_id):
        staff = get_object_or_404(
            Staff.objects.select_related("designation"), pk=staff_id
        )
        serializer = PayslipGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        year, month = services._parse_month(serializer.validated_data["month"])
        payslip = services.generate_payslip(
            staff=staff, year=year, month=month, user=request.user
        )
        return success_response(
            PayslipSerializer(payslip).data, status_code=201
        )
