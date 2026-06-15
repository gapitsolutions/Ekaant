from django.utils import timezone
from rest_framework import serializers

from .models import FollowUpCallResult, FollowUpTicket, TERMINAL_CALL_RESULTS


class FollowUpListQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=True)
    stage = serializers.ChoiceField(
        choices=["pending", "completed", "successful", "success", "all"],
        required=False,
        default="pending",
    )
    page = serializers.IntegerField(required=False, min_value=1, default=1)
    pageSize = serializers.IntegerField(required=False, min_value=1, default=50)


class FollowUpCallCompleteSerializer(serializers.Serializer):
    call_result = serializers.ChoiceField(choices=FollowUpCallResult.choices)
    call_note = serializers.CharField()
    next_call_date = serializers.DateField(required=False, allow_null=True)

    def validate_call_note(self, value):
        if not value.strip():
            raise serializers.ValidationError("call_note is required.")
        return value.strip()

    def validate(self, attrs):
        result = attrs["call_result"]
        next_call_date = attrs.get("next_call_date")
        today = timezone.localdate()

        # Terminal outcomes (confirmed / wrong_number / do_not_call) end the
        # cycle — no callback date is asked for or stored. A wrong number or a
        # do-not-call request can't be retried on a future date.
        if result in TERMINAL_CALL_RESULTS:
            attrs["next_call_date"] = None
            return attrs

        # Retry outcomes (busy_later / not_reachable / other) require a date.
        if next_call_date is None:
            raise serializers.ValidationError(
                "next_call_date is required for this call result."
            )
        if next_call_date < today:
            raise serializers.ValidationError("next_call_date cannot be in the past.")
        return attrs


class CallingReportQuerySerializer(serializers.Serializer):
    start_date = serializers.DateField(required=True)
    end_date = serializers.DateField(required=True)
    patient_id = serializers.UUIDField(required=False)

    def validate(self, attrs):
        if attrs["start_date"] > attrs["end_date"]:
            raise serializers.ValidationError("start_date cannot be after end_date")
        return attrs


def followup_item_payload(ticket: FollowUpTicket):
    patient = ticket.patient
    latest_attempt = ticket.attempts.first()
    return {
        "id": str(ticket.pk),
        "patient_id": str(patient.pk),
        "patient_name": patient.full_name,
        "file_number": patient.file_number,
        "phone": patient.phone_number,
        "patient_category": patient.patient_category,
        "follow_up_date": ticket.follow_up_date,
        "status": ticket.status,
        "cycle_number": ticket.cycle_number,
        "pending_since": ticket.pending_since,
        "last_response": ticket.last_call_result,
        "last_call_date": ticket.last_called_at.date() if ticket.last_called_at else None,
        "last_call_note": ticket.last_call_note,
        "next_call_date": ticket.next_call_date,
        "completed_at": ticket.completed_at,
        "successful_at": ticket.successful_at,
        "latest_attempt": {
            "called_at": latest_attempt.called_at,
            "result": latest_attempt.result,
            "note": latest_attempt.note,
            "next_call_date": latest_attempt.next_call_date,
        }
        if latest_attempt
        else None,
    }
