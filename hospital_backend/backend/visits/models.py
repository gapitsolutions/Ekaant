import re
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Count, Max, Q
from django.utils import timezone


class VisitStatus(models.TextChoices):
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class VisitStage(models.TextChoices):
    COUNSELLOR = "counsellor", "Counsellor"
    DOCTOR = "doctor", "Doctor"
    PHARMACY = "pharmacy", "Pharmacy"
    COMPLETED = "completed", "Completed"


class CheckinVerificationMethod(models.TextChoices):
    FINGERPRINT = "fingerprint", "Fingerprint"
    PHOTO = "photo", "Photo"
    MANUAL = "manual", "Manual"


def visit_verification_photo_upload_path(instance, filename):
    return f"patients/{instance.patient_id}/visits/{instance.visit_uid}/{filename}"


class VisitSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    visit_uid = models.CharField(max_length=32, unique=True)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="visits",
    )
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="checked_in_sessions",
    )
    visit_date = models.DateField(default=timezone.localdate)
    visit_type = models.CharField(max_length=32, default="follow_up")
    file_number = models.CharField(max_length=32, blank=True, default="")  # denormalized snapshot of patient.file_number at check-in
    checkin_time = models.DateTimeField(default=timezone.now)
    completed_time = models.DateTimeField(blank=True, null=True)
    status = models.CharField(
        max_length=32,
        choices=VisitStatus.choices,
        default=VisitStatus.IN_PROGRESS,
    )
    current_stage = models.CharField(
        max_length=32,
        choices=VisitStage.choices,
        default=VisitStage.PHARMACY,
    )
    outstanding_debt_at_checkin = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )
    medicines_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    verification_method = models.CharField(
        max_length=16,
        choices=CheckinVerificationMethod.choices,
        default=CheckinVerificationMethod.FINGERPRINT,
    )
    verification_photo = models.ImageField(
        upload_to=visit_verification_photo_upload_path,
        blank=True,
        null=True,
    )
    verification_photo_captured_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-visit_date", "-checkin_time"]
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "visit_date"],
                condition=Q(status=VisitStatus.IN_PROGRESS),
                name="unique_active_session_per_patient_per_day",
            ),
        ]
        indexes = [
            models.Index(fields=["visit_date", "status"]),
            models.Index(fields=["patient", "visit_date"]),
        ]

    def __str__(self):
        return self.visit_uid

    @classmethod
    def generate_visit_uid(cls) -> str:
        """Allocate the next per-year visit UID, e.g. ``VST-2026-0007``.

        The sequence number is derived from the **highest UID already issued
        this year**, not from a live row ``count()``. Using ``count()`` was a
        bug: deleting a session made the count drop below an existing UID, so
        the next check-in regenerated a UID that still belonged to a surviving
        row and the ``unique`` constraint raised ``IntegrityError`` (HTTP 500).

        Deriving from ``Max`` instead means deletions leave harmless gaps (e.g.
        a missing ``0005``) rather than colliding. A residual race still exists
        when two check-ins run concurrently and both read the same ``Max`` — the
        caller guards against that with an ``IntegrityError`` retry loop, which
        re-invokes this method so the second attempt sees the new maximum.
        """
        year = timezone.localdate().year
        prefix = f"VST-{year}-"
        last_uid = cls.objects.filter(visit_uid__startswith=prefix).aggregate(
            max_uid=Max("visit_uid")
        )["max_uid"]

        next_number = 1
        if last_uid:
            match = re.search(r"(\d+)$", last_uid)
            if match:
                next_number = int(match.group(1)) + 1

        return f"{prefix}{next_number:04d}"

    @classmethod
    def build_month_breakdown(cls, *, year: int, month: int):
        rows = (
            cls.objects.filter(visit_date__year=year, visit_date__month=month)
            .values("visit_date")
            .annotate(count=Count("id"))
            .order_by("visit_date")
        )
        return [{"day": row["visit_date"].day, "count": row["count"]} for row in rows]

    @classmethod
    def build_year_breakdown(cls, *, year: int):
        rows = (
            cls.objects.filter(visit_date__year=year)
            .values_list("visit_date__month")
            .annotate(count=Count("id"))
            .order_by("visit_date__month")
        )
        return [{"month": month, "count": count} for month, count in rows]
