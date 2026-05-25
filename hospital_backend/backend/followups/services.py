from datetime import timedelta

from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone

from patients.models import Patient
from visits.models import VisitSession

from .models import FollowUpCallAttempt, FollowUpCallResult, FollowUpStatus, FollowUpTicket


def _has_patient_checked_in_after_date(*, patient: Patient, date_value) -> bool:
    return VisitSession.objects.filter(
        patient=patient,
        visit_date__gte=date_value,
    ).exists()


def _next_cycle_number(patient: Patient) -> int:
    last_cycle = (
        FollowUpTicket.objects.filter(patient=patient).aggregate(max_cycle=Max("cycle_number"))[
            "max_cycle"
        ]
        or 0
    )
    return last_cycle + 1


@transaction.atomic
def sync_followup_tickets(*, today=None) -> dict[str, int]:
    today = today or timezone.localdate()
    created = 0
    requeued = 0
    marked_successful = 0

    due_cutoff = today - timedelta(days=2)
    due_patients = Patient.objects.filter(
        next_followup_date__isnull=False,
        next_followup_date__lte=due_cutoff,
    )

    for patient in due_patients:
        due_date = patient.next_followup_date
        if _has_patient_checked_in_after_date(patient=patient, date_value=due_date):
            continue

        existing_ticket = (
            FollowUpTicket.objects.filter(patient=patient, follow_up_date=due_date)
            .exclude(status=FollowUpStatus.SUCCESSFUL)
            .first()
        )
        if existing_ticket:
            continue

        FollowUpTicket.objects.create(
            patient=patient,
            cycle_number=_next_cycle_number(patient),
            follow_up_date=due_date,
            status=FollowUpStatus.PENDING,
            pending_since=today,
        )
        created += 1

    requeue_candidates = FollowUpTicket.objects.select_related("patient").filter(
        status=FollowUpStatus.COMPLETED,
        next_call_date__isnull=False,
        next_call_date__lte=today,
    )
    for ticket in requeue_candidates:
        if _has_patient_checked_in_after_date(patient=ticket.patient, date_value=ticket.follow_up_date):
            ticket.status = FollowUpStatus.SUCCESSFUL
            ticket.successful_at = timezone.now()
            ticket.next_call_date = None
            ticket.save(update_fields=["status", "successful_at", "next_call_date", "updated_at"])
            marked_successful += 1
            continue

        ticket.status = FollowUpStatus.PENDING
        ticket.pending_since = today
        ticket.next_call_date = None
        ticket.save(update_fields=["status", "pending_since", "next_call_date", "updated_at"])
        requeued += 1

    return {
        "created": created,
        "requeued": requeued,
        "marked_successful": marked_successful,
    }


@transaction.atomic
def reconcile_followup_on_checkin(*, patient: Patient, checkin_time) -> dict[str, str]:
    checkin_date = timezone.localdate(checkin_time)
    active_ticket = (
        FollowUpTicket.objects.filter(patient=patient)
        .exclude(status=FollowUpStatus.SUCCESSFUL)
        .filter(follow_up_date__lte=checkin_date)
        .order_by("-follow_up_date", "-cycle_number")
        .first()
    )
    if not active_ticket:
        return {"action": "none"}

    had_any_call = (
        active_ticket.status == FollowUpStatus.COMPLETED
        or active_ticket.attempts.exists()
        or bool(active_ticket.last_called_at)
    )
    if active_ticket.status == FollowUpStatus.PENDING and not had_any_call:
        active_ticket.delete()
        return {"action": "deleted_pending_without_call"}

    active_ticket.status = FollowUpStatus.SUCCESSFUL
    active_ticket.successful_at = checkin_time
    active_ticket.next_call_date = None
    active_ticket.save(update_fields=["status", "successful_at", "next_call_date", "updated_at"])
    return {"action": "marked_successful", "ticket_id": str(active_ticket.pk)}


@transaction.atomic
def complete_followup_call(
    *,
    ticket: FollowUpTicket,
    called_by,
    result: str,
    note: str,
    next_call_date=None,
):
    called_at = timezone.now()

    FollowUpCallAttempt.objects.create(
        ticket=ticket,
        called_by=called_by,
        result=result,
        note=note,
        next_call_date=next_call_date,
        called_at=called_at,
    )

    ticket.status = FollowUpStatus.COMPLETED
    ticket.last_call_result = result
    ticket.last_call_note = note
    ticket.last_called_at = called_at
    ticket.completed_at = called_at
    ticket.next_call_date = next_call_date if result != FollowUpCallResult.CONFIRMED else None
    ticket.save(
        update_fields=[
            "status",
            "last_call_result",
            "last_call_note",
            "last_called_at",
            "completed_at",
            "next_call_date",
            "updated_at",
        ]
    )
    return ticket


def followup_queryset(*, query: str = "", stage: str = ""):
    queryset = FollowUpTicket.objects.select_related("patient").all().order_by("-pending_since", "-created_at")

    if stage and stage != "all":
        status_map = {
            "pending": FollowUpStatus.PENDING,
            "completed": FollowUpStatus.COMPLETED,
            "successful": FollowUpStatus.SUCCESSFUL,
            "success": FollowUpStatus.SUCCESSFUL,
        }
        mapped = status_map.get(stage)
        if mapped:
            queryset = queryset.filter(status=mapped)

    if query:
        queryset = queryset.filter(
            Q(patient__file_number__icontains=query)
            | Q(patient__full_name__icontains=query)
            | Q(patient__phone_number__icontains=query)
        )

    return queryset
