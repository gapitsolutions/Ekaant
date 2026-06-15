from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Max, Q
from django.utils import timezone

from patients.models import Patient
from visits.models import VisitSession

from .models import (
    FollowUpCallAttempt,
    FollowUpCallResult,
    FollowUpStatus,
    FollowUpTicket,
    TERMINAL_CALL_RESULTS,
)


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
    ).exclude(
        # Never auto-generate follow-up calls for patients who asked not to be
        # contacted or whose number is known to be wrong.
        Q(do_not_call=True) | Q(phone_number_invalid=True),
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

        # Defense-in-depth: a patient flagged do_not_call / phone_number_invalid
        # between scheduling and the requeue date must not be re-queued. Drop
        # the callback (leave the ticket COMPLETED, clear next_call_date).
        # Terminal results already clear next_call_date, so this only catches
        # the rare flag-set-after-scheduling case.
        if ticket.patient.do_not_call or ticket.patient.phone_number_invalid:
            ticket.next_call_date = None
            ticket.save(update_fields=["next_call_date", "updated_at"])
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
    # Terminal results (confirmed / wrong_number / do_not_call) end the cycle
    # with no callback; only retry results carry a next_call_date forward.
    ticket.next_call_date = (
        None if result in TERMINAL_CALL_RESULTS else next_call_date
    )
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

    # Side effects on the patient's communication / data-quality flags. These
    # exclude the patient from future follow-up ticket generation.
    patient_updates: list[str] = []
    patient = ticket.patient
    if result == FollowUpCallResult.WRONG_NUMBER and not patient.phone_number_invalid:
        patient.phone_number_invalid = True
        patient_updates.append("phone_number_invalid")
    if result == FollowUpCallResult.DO_NOT_CALL and not patient.do_not_call:
        patient.do_not_call = True
        patient_updates.append("do_not_call")
    if patient_updates:
        patient_updates.append("updated_at")
        patient.save(update_fields=patient_updates)

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


# ---------------------------------------------------------------------------
# Calling report aggregation
# ---------------------------------------------------------------------------

def build_calling_report_payload(*, start_date, end_date, patient_id=None):
    """Aggregate ``FollowUpCallAttempt`` rows in [start_date, end_date].

    The query filters on ``called_at`` (the datetime the call was logged).
    When ``patient_id`` is supplied the report is scoped to a single patient.
    All aggregation is performed in a single queryset annotation — no N+1.
    """
    base_qs = FollowUpCallAttempt.objects.filter(
        called_at__date__gte=start_date,
        called_at__date__lte=end_date,
    )
    if patient_id:
        base_qs = base_qs.filter(ticket__patient_id=patient_id)

    total_calls = base_qs.count()

    # Outcome distribution — one aggregate query with conditional counts.
    outcome_agg = base_qs.aggregate(
        confirmed=Count("pk", filter=Q(result=FollowUpCallResult.CONFIRMED)),
        busy_later=Count("pk", filter=Q(result=FollowUpCallResult.BUSY_LATER)),
        wrong_number=Count("pk", filter=Q(result=FollowUpCallResult.WRONG_NUMBER)),
        not_reachable=Count("pk", filter=Q(result=FollowUpCallResult.NOT_REACHABLE)),
        do_not_call=Count("pk", filter=Q(result=FollowUpCallResult.DO_NOT_CALL)),
        other=Count("pk", filter=Q(result=FollowUpCallResult.OTHER)),
    )

    # Staff-level breakdown.
    staff_rows = (
        base_qs.values("called_by__full_name")
        .annotate(
            total=Count("pk"),
            confirmed=Count("pk", filter=Q(result=FollowUpCallResult.CONFIRMED)),
            busy_later=Count("pk", filter=Q(result=FollowUpCallResult.BUSY_LATER)),
            wrong_number=Count("pk", filter=Q(result=FollowUpCallResult.WRONG_NUMBER)),
            not_reachable=Count("pk", filter=Q(result=FollowUpCallResult.NOT_REACHABLE)),
            do_not_call=Count("pk", filter=Q(result=FollowUpCallResult.DO_NOT_CALL)),
            other=Count("pk", filter=Q(result=FollowUpCallResult.OTHER)),
        )
        .order_by("-total")
    )
    staff_breakdown = [
        {
            "staff_name": row["called_by__full_name"] or "Unknown",
            "total": row["total"],
            "confirmed": row["confirmed"],
            "busy_later": row["busy_later"],
            "wrong_number": row["wrong_number"],
            "not_reachable": row["not_reachable"],
            "do_not_call": row["do_not_call"],
            "other": row["other"],
        }
        for row in staff_rows
    ]

    # Individual call items — select_related avoids N+1 on ticket→patient
    # and called_by joins.
    items_qs = (
        base_qs.select_related("ticket__patient", "called_by")
        .order_by("-called_at")
    )
    items = [
        {
            "id": str(attempt.pk),
            "file_number": attempt.ticket.patient.file_number,
            "patient_name": attempt.ticket.patient.full_name,
            "phone": attempt.ticket.patient.phone_number,
            "called_at": attempt.called_at,
            "result": attempt.result,
            "note": attempt.note,
            "staff_name": attempt.called_by.full_name,
        }
        for attempt in items_qs
    ]

    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_calls": total_calls,
        "outcome_distribution": outcome_agg,
        "staff_breakdown": staff_breakdown,
        "items": items,
    }
