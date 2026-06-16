"""Staff write logic — keeps designation get-or-create and field mapping out
of the views."""

import calendar
from datetime import date as date_cls
from decimal import Decimal, ROUND_HALF_UP

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from core.exceptions import ConflictError

from .models import (
    AttendanceDaySubmission,
    AttendanceStatus,
    Payslip,
    Staff,
    StaffAttendance,
)
from .serializers import resolve_designation


def staff_summary() -> dict:
    """Directory-wide aggregate for the staff console KPI cards.

    Counts come from aggregate queries (not the paginated list) so headline
    figures are independent of page size. ``by_designation`` covers active
    staff only — used for the role filter chips.
    """
    counts = Staff.objects.aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(is_active=True)),
        inactive=Count("id", filter=Q(is_active=False)),
    )
    by_designation = {
        row["designation__name"]: row["n"]
        for row in (
            Staff.objects.filter(is_active=True)
            .values("designation__name")
            .annotate(n=Count("id"))
            .order_by("designation__name")
        )
    }
    return {
        "total": counts["total"],
        "active": counts["active"],
        "inactive": counts["inactive"],
        "by_designation": by_designation,
    }


def _q2(value) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

# Fields copied verbatim from validated_data onto the Staff instance.
_DIRECT_FIELDS = [
    "staff_code",
    "full_name",
    "employment_type",
    "is_active",
    "joined_date",
    "date_of_birth",
    "gender",
    "mobile_number",
    "email",
    "address",
    "gov_registration",
    "aadhaar_number",
    "pan_number",
    "bank_account_number",
    "bank_ifsc",
    "monthly_salary",
    "holiday_allowed",
    "sunday_holiday",
]


def _apply_photo(staff: Staff, data: dict) -> None:
    """Persist an uploaded base64 photo (decoded by the serializer) onto the
    staff record's ImageField. No-op when no photo was supplied."""
    photo_bytes = data.get("_decoded_photo")
    mime_type = (data.get("photo_mime_type") or "").lower()
    if not photo_bytes or not mime_type:
        return
    extension = "jpg" if mime_type == "image/jpeg" else "png"
    timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
    staff.photo.save(
        f"profile_{timestamp}.{extension}",
        ContentFile(photo_bytes),
        save=True,
    )


@transaction.atomic
def create_staff(*, data: dict, user) -> Staff:
    designation = resolve_designation(data["designation"])
    staff = Staff(designation=designation, created_by=user)
    for field in _DIRECT_FIELDS:
        if field in data:
            setattr(staff, field, data[field])
    staff.save()
    _apply_photo(staff, data)
    return staff


@transaction.atomic
def update_staff(*, staff: Staff, data: dict) -> Staff:
    if "designation" in data:
        staff.designation = resolve_designation(data["designation"])
    for field in _DIRECT_FIELDS:
        if field in data:
            setattr(staff, field, data[field])
    staff.save()
    _apply_photo(staff, data)
    return staff


# ── Attendance ──

@transaction.atomic
def upsert_attendance(*, staff_id, on_date, status, user) -> StaffAttendance:
    """Create or update one staff member's mark for a date (idempotent)."""
    obj, _ = StaffAttendance.objects.update_or_create(
        staff_id=staff_id,
        date=on_date,
        defaults={"status": status, "marked_by": user},
    )
    return obj


@transaction.atomic
def bulk_mark_attendance(*, on_date, entries: list[dict], user) -> int:
    """Upsert many (staff, date) marks for one date. Returns rows written.

    Unlocked — used by the admin flow, which may mark/edit any day repeatedly.
    """
    count = 0
    for entry in entries:
        StaffAttendance.objects.update_or_create(
            staff_id=entry["staff_id"],
            date=on_date,
            defaults={"status": entry["status"], "marked_by": user},
        )
        count += 1
    return count


def day_submission(on_date):
    """Return the AttendanceDaySubmission for a date, or None."""
    return AttendanceDaySubmission.objects.filter(date=on_date).first()


def submission_dict(submission) -> dict | None:
    """Serialise a day-submission row for API responses (or None)."""
    if submission is None:
        return None
    return {
        "submitted_by_name": (
            submission.submitted_by.full_name if submission.submitted_by_id else ""
        ),
        "submitted_by_role": submission.submitted_by_role,
        "submitted_at": submission.submitted_at.isoformat(),
    }


def attendance_roster(on_date) -> list[dict]:
    """Active staff with their mark for ``on_date`` (``status`` null when
    unmarked) — the bulk-mark grid payload."""
    staff = Staff.objects.filter(is_active=True).select_related("designation")
    marks = {
        a.staff_id: a.status for a in StaffAttendance.objects.filter(date=on_date)
    }
    return [
        {
            "staff_id": str(s.id),
            "staff_code": s.staff_code,
            "full_name": s.full_name,
            "designation": s.designation.name,
            "status": marks.get(s.id),
        }
        for s in staff
    ]


def today_attendance_status() -> dict:
    """Lightweight lock state for *today* — for the reception dashboard button
    (avoids fetching the whole roster just to read submission state)."""
    submission = day_submission(timezone.localdate())
    return {"submitted": submission is not None, "submission": submission_dict(submission)}


@transaction.atomic
def submit_daily_attendance(*, on_date, entries: list[dict], user) -> dict:
    """Reception flow: mark every staff member for ``on_date`` and lock the day.

    A day can be submitted only once (``AttendanceDaySubmission.date`` is
    unique). The lock row is claimed FIRST via ``get_or_create`` — which the DB
    unique constraint makes atomic even under concurrent submits — so a second
    attempt is refused (409) before any marks are written and can't 500 on an
    IntegrityError. Corrections after submission are an admin task. The marking
    user and a snapshot of their auth role are recorded on the lock row.
    """
    submission, created = AttendanceDaySubmission.objects.get_or_create(
        date=on_date,
        defaults={
            "submitted_by": user,
            "submitted_by_role": getattr(user, "role", "") or "",
        },
    )
    if not created:
        raise ConflictError(
            "Attendance for this day has already been submitted and cannot be "
            "changed. Ask an admin to make corrections."
        )

    written = bulk_mark_attendance(on_date=on_date, entries=entries, user=user)
    return {"marked": written, "submission": submission}


def month_attendance(*, staff_id, year: int, month: int) -> dict:
    """Per-day map + summary stats for one staff member in a month.

    Half-days are surfaced raw in counts; ``effective_present`` /
    ``effective_absent`` apply the 0.5/0.5 split used by payroll (Phase 5)."""
    rows = StaffAttendance.objects.filter(
        staff_id=staff_id, date__year=year, date__month=month
    ).order_by("date")

    by_date: dict[str, str] = {}
    present = absent = half_day = 0
    for row in rows:
        by_date[row.date.isoformat()] = row.status
        if row.status == AttendanceStatus.PRESENT:
            present += 1
        elif row.status == AttendanceStatus.ABSENT:
            absent += 1
        elif row.status == AttendanceStatus.HALF_DAY:
            half_day += 1

    return {
        "year": year,
        "month": month,
        "by_date": by_date,
        "stats": {
            "present": present,
            "absent": absent,
            "half_day": half_day,
            "marked_days": present + absent + half_day,
            "effective_present": float(present) + 0.5 * half_day,
            "effective_absent": float(absent) + 0.5 * half_day,
        },
    }


def _parse_month(month_str: str) -> tuple[int, int]:
    """``"YYYY-MM"`` → (year, month). Falls back to today on bad input."""
    try:
        year, month = month_str.split("-")
        return int(year), int(month)
    except (ValueError, AttributeError):
        today = date_cls.today()
        return today.year, today.month


# ── Payroll ──

def compute_payroll(*, staff: Staff, year: int, month: int) -> dict:
    """Derive a month's pay for one staff member from salary + attendance.

    Transparent deduction model:
        per_day        = monthly_salary / days_in_month
        effective_absent = absent + 0.5*half_day          (marked attendance)
        paid_leave_used  = min(holiday_allowed, effective_absent)
        unpaid_absent    = effective_absent - paid_leave_used
        deduction        = per_day * unpaid_absent
        net_pay          = max(0, monthly_salary - deduction)

    ``holiday_allowed`` is a monthly paid-leave allowance that offsets the
    first N absences. ``sunday_holiday`` / ``sundays_in_month`` are surfaced
    for context — deductions come only from *marked* unpaid absences, so
    Sundays left unmarked never deduct. Every figure is returned (and
    snapshotted onto a Payslip) so the policy is auditable and adjustable.
    """
    att = month_attendance(staff_id=staff.id, year=year, month=month)
    stats = att["stats"]
    present = Decimal(str(stats["present"]))
    absent = Decimal(str(stats["absent"]))
    half_day = int(stats["half_day"])
    effective_present = Decimal(str(stats["effective_present"]))
    effective_absent = Decimal(str(stats["effective_absent"]))

    days_in_month = calendar.monthrange(year, month)[1]
    sundays = sum(
        1
        for d in range(1, days_in_month + 1)
        if date_cls(year, month, d).weekday() == 6
    )

    monthly_salary = Decimal(staff.monthly_salary)
    per_day = _q2(monthly_salary / Decimal(days_in_month)) if days_in_month else Decimal("0")
    allowance = Decimal(staff.holiday_allowed)
    paid_leave_used = min(allowance, effective_absent)
    unpaid_absent = effective_absent - paid_leave_used
    deduction = _q2(per_day * unpaid_absent)
    net_pay = monthly_salary - deduction
    if net_pay < 0:
        net_pay = Decimal("0")

    return {
        "year": year,
        "month": month,
        "monthly_salary": monthly_salary,
        "days_in_month": days_in_month,
        "sundays_in_month": sundays,
        "sunday_holiday": staff.sunday_holiday,
        "holiday_allowed": int(staff.holiday_allowed),
        "present_days": effective_present,
        "absent_days": absent,
        "half_days": half_day,
        "paid_leave_used": paid_leave_used,
        "unpaid_absent": unpaid_absent,
        "per_day_rate": per_day,
        "deduction": deduction,
        "net_pay": _q2(net_pay),
        "marked_days": stats["marked_days"],
    }


@transaction.atomic
def generate_payslip(*, staff: Staff, year: int, month: int, user) -> Payslip:
    """Compute + persist a payslip snapshot. Regeneration creates a NEW row
    (history preserved); the latest by ``generated_at`` is authoritative."""
    p = compute_payroll(staff=staff, year=year, month=month)
    return Payslip.objects.create(
        staff=staff,
        year=year,
        month=month,
        monthly_salary=p["monthly_salary"],
        days_in_month=p["days_in_month"],
        sundays_in_month=p["sundays_in_month"],
        sunday_holiday=p["sunday_holiday"],
        holiday_allowed=p["holiday_allowed"],
        present_days=p["present_days"],
        absent_days=p["absent_days"],
        half_days=p["half_days"],
        paid_leave_used=p["paid_leave_used"],
        unpaid_absent=p["unpaid_absent"],
        per_day_rate=p["per_day_rate"],
        deduction=p["deduction"],
        net_pay=p["net_pay"],
        generated_by=user,
    )
