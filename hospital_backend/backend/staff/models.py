"""Staff / employee directory.

A standalone HR entity — deliberately **not** linked to ``accounts.User``.
``User`` rows exist only to grant server authentication (reception, pharmacist,
admin); staff records are HR data (designation, payroll, attendance, bank
details) for people who may or may not have a login. Keeping them separate
avoids polluting the auth model with sensitive PII and avoids forcing a login
account for every employee.
"""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import UniqueConstraint
from django.db.models.functions import Lower


def staff_photo_upload_path(instance, filename):
    return f"staff/photos/{instance.id}/{filename}"


class EmploymentType(models.TextChoices):
    PERMANENT = "permanent", "Permanent"
    LOCUM = "locum", "Locum"
    CONTRACT = "contract", "Contract"


class Gender(models.TextChoices):
    MALE = "male", "Male"
    FEMALE = "female", "Female"
    OTHER = "other", "Other"


class Designation(models.Model):
    """Dynamic job-title lookup. Seeded with a base set; new designations are
    get-or-created when a staff record is saved with an unrecognised value, so
    a typed title (e.g. "Lab Technician") persists and appears in the picker
    next time — preventing free-text drift / typos."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            UniqueConstraint(Lower("name"), name="staff_designation_name_ci_unique"),
        ]

    def __str__(self):
        return self.name


class Staff(models.Model):
    """HR record for an employee. ``staff_code`` is admin-entered and unique.

    Sensitive fields (Aadhaar, PAN, bank, salary) are admin-only and masked in
    list responses — see serializers. Soft-deleted via ``is_active`` to
    preserve attendance / payroll history.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Human identifier, admin-entered (e.g. "S001"); uniqueness checked at the
    # API layer + DB constraint.
    staff_code = models.CharField(max_length=32, unique=True)
    full_name = models.CharField(max_length=255)
    designation = models.ForeignKey(
        Designation, on_delete=models.PROTECT, related_name="staff"
    )
    employment_type = models.CharField(
        max_length=16,
        choices=EmploymentType.choices,
        default=EmploymentType.PERMANENT,
    )
    is_active = models.BooleanField(default=True)
    joined_date = models.DateField(blank=True, null=True)

    # Personal
    date_of_birth = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=16, choices=Gender.choices, blank=True, default="")
    mobile_number = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    photo = models.ImageField(upload_to=staff_photo_upload_path, blank=True, null=True)
    gov_registration = models.CharField(max_length=120, blank=True, default="")

    # Sensitive (admin-only; masked in list views)
    aadhaar_number = models.CharField(max_length=20, blank=True, default="")
    pan_number = models.CharField(max_length=20, blank=True, default="")
    bank_account_number = models.CharField(max_length=40, blank=True, default="")
    bank_ifsc = models.CharField(max_length=20, blank=True, default="")
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Payroll config
    holiday_allowed = models.PositiveIntegerField(default=0)
    sunday_holiday = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="staff_created",
        blank=True,
        null=True,
    )

    class Meta:
        ordering = ["staff_code"]
        verbose_name = "Staff"
        verbose_name_plural = "Staff"
        indexes = [
            models.Index(fields=["is_active"]),
            models.Index(fields=["designation"]),
            models.Index(fields=["full_name"]),
        ]

    def __str__(self):
        return f"{self.staff_code} - {self.full_name}"


class AttendanceStatus(models.TextChoices):
    PRESENT = "present", "Present"
    ABSENT = "absent", "Absent"
    HALF_DAY = "half_day", "Half Day"


class StaffAttendance(models.Model):
    """One attendance mark per (staff, date). Half-days count as 0.5 present /
    0.5 absent in payroll (computed in Phase 5, not stored here)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    staff = models.ForeignKey(
        Staff, on_delete=models.CASCADE, related_name="attendance"
    )
    date = models.DateField()
    status = models.CharField(max_length=12, choices=AttendanceStatus.choices)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="attendance_marked",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        verbose_name = "Staff Attendance"
        verbose_name_plural = "Staff Attendance"
        constraints = [
            UniqueConstraint(
                fields=["staff", "date"], name="staff_attendance_unique_per_day"
            ),
        ]
        indexes = [
            models.Index(fields=["staff", "date"]),
            models.Index(fields=["date"]),
        ]

    def __str__(self):
        return f"{self.staff_id} {self.date} {self.status}"


class AttendanceDaySubmission(models.Model):
    """A per-calendar-day lock recording that the day's attendance was
    *submitted* (typically by reception). ``date`` is unique, so a day can be
    submitted only once — the reception flow refuses a second submission and
    cannot edit after. Admins bypass this lock entirely (they correct via the
    per-staff / bulk admin endpoints). ``submitted_by_role`` snapshots the
    marking user's auth role at submission time so it stays accurate even if
    that user's role later changes.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    date = models.DateField(unique=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="attendance_day_submissions",
        blank=True,
        null=True,
    )
    submitted_by_role = models.CharField(max_length=20, blank=True, default="")
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]
        verbose_name = "Attendance Day Submission"
        verbose_name_plural = "Attendance Day Submissions"

    def __str__(self):
        return f"{self.date} by {self.submitted_by_id}"


class Payslip(models.Model):
    """A stored, immutable snapshot of a month's payroll computation for one
    staff member — kept for audit. Regenerating a month creates a NEW row
    (history is preserved; the latest ``generated_at`` is authoritative),
    mirroring the dispense-amendment pattern. All figures are snapshotted so a
    later salary/attendance change never rewrites a historical payslip."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name="payslips")
    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()  # 1–12

    # Snapshot of inputs + derived figures.
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2)
    days_in_month = models.PositiveSmallIntegerField()
    sundays_in_month = models.PositiveSmallIntegerField(default=0)
    sunday_holiday = models.BooleanField(default=True)
    holiday_allowed = models.PositiveIntegerField(default=0)
    present_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    absent_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    half_days = models.PositiveSmallIntegerField(default=0)
    paid_leave_used = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    unpaid_absent = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    per_day_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="payslips_generated",
        blank=True,
        null=True,
    )
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-year", "-month", "-generated_at"]
        verbose_name = "Payslip"
        verbose_name_plural = "Payslips"
        indexes = [
            models.Index(fields=["staff", "-year", "-month"]),
        ]

    def __str__(self):
        return f"{self.staff_id} {self.year}-{self.month:02d} net={self.net_pay}"
