from django.conf import settings
from django.db import models
from django.utils import timezone


class FollowUpStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    COMPLETED = "completed", "Completed"
    SUCCESSFUL = "successful", "Successful"


class FollowUpCallResult(models.TextChoices):
    CONFIRMED = "confirmed", "Confirmed"
    BUSY_LATER = "busy_later", "Busy / Call Back Later"
    WRONG_NUMBER = "wrong_number", "Wrong Number"
    NOT_REACHABLE = "not_reachable", "Not Reachable / Switched Off"
    OTHER = "other", "Other"


class FollowUpTicket(models.Model):
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="followup_tickets",
    )
    cycle_number = models.PositiveIntegerField()
    follow_up_date = models.DateField()
    status = models.CharField(
        max_length=16,
        choices=FollowUpStatus.choices,
        default=FollowUpStatus.PENDING,
    )
    pending_since = models.DateField(default=timezone.localdate)
    last_call_result = models.CharField(
        max_length=32,
        choices=FollowUpCallResult.choices,
        blank=True,
        null=True,
    )
    last_call_note = models.TextField(blank=True, null=True)
    last_called_at = models.DateTimeField(blank=True, null=True)
    next_call_date = models.DateField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    successful_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "cycle_number"],
                name="unique_followup_cycle_per_patient",
            ),
        ]
        indexes = [
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["follow_up_date", "status"]),
            models.Index(fields=["next_call_date", "status"]),
        ]

    def __str__(self):
        return f"{self.patient.file_number}#{self.cycle_number}"


class FollowUpCallAttempt(models.Model):
    ticket = models.ForeignKey(
        FollowUpTicket,
        on_delete=models.CASCADE,
        related_name="attempts",
    )
    called_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="followup_call_attempts",
    )
    result = models.CharField(max_length=32, choices=FollowUpCallResult.choices)
    note = models.TextField()
    next_call_date = models.DateField(blank=True, null=True)
    called_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-called_at", "-created_at"]
        indexes = [
            models.Index(fields=["ticket", "called_at"]),
        ]

    def __str__(self):
        return f"{self.ticket_id}:{self.result}@{self.called_at.isoformat()}"
