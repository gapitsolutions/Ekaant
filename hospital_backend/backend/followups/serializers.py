from django.utils import timezone
from rest_framework import serializers

from .models import FollowUpCallResult, FollowUpTicket


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

        if result == FollowUpCallResult.CONFIRMED:
            attrs["next_call_date"] = None
            return attrs

        if next_call_date is None:
            raise serializers.ValidationError(
                "next_call_date is required when call_result is not confirmed."
            )
        if next_call_date < today:
            raise serializers.ValidationError("next_call_date cannot be in the past.")
        return attrs


def followup_item_payload(ticket: FollowUpTicket):
    patient = ticket.patient
    latest_attempt = ticket.attempts.first()
    return {
        "id": str(ticket.pk),
        "patient_id": str(patient.pk),
        "patient_name": patient.full_name,
        "file_number": patient.registration_number,
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
