from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from patients.models import Patient

from .models import FollowUpStatus, FollowUpTicket


class FollowUpWorkflowTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="followup.reception@example.com",
            password="test-password",
            role="reception",
            full_name="Follow Up Reception",
        )
        self.client.force_authenticate(user=self.user)
        self.patient = Patient.objects.create(
            registration_number="AGH260500",
            patient_category="deaddiction",
            full_name="Followup Patient",
            date_of_birth=timezone.localdate() - timedelta(days=10000),
            sex="male",
            phone_number="9000000001",
            address_line1="Address",
            next_followup_date=timezone.localdate() - timedelta(days=3),
        )

    def _list_followups(self, **params):
        return self.client.get("/api/v1/receptionist/follow-ups/", params)

    def test_due_plus_two_generates_pending_ticket(self):
        response = self._list_followups(stage="pending")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.data["data"]
        self.assertEqual(payload["counts"]["pending"], 1)
        self.assertEqual(len(payload["items"]), 1)
        self.assertEqual(payload["items"][0]["status"], FollowUpStatus.PENDING)

    def test_can_update_patient_next_followup_date(self):
        next_date = timezone.localdate() + timedelta(days=10)
        response = self.client.patch(
            f"/api/v1/patients/{self.patient.pk}/next-followup-date/",
            {"next_followup_date": next_date.isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.next_followup_date, next_date)

    def test_complete_call_requires_next_call_date_when_unsuccessful(self):
        list_response = self._list_followups(stage="pending")
        ticket_id = list_response.data["data"]["items"][0]["id"]

        bad_response = self.client.post(
            f"/api/v1/receptionist/follow-ups/{ticket_id}/complete-call/",
            {
                "call_result": "not_reachable",
                "call_note": "Phone switched off",
            },
            format="json",
        )
        self.assertEqual(bad_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("next_call_date is required", bad_response.data["error"]["message"])

    def test_complete_call_and_requeue_on_next_call_date(self):
        list_response = self._list_followups(stage="pending")
        ticket_id = list_response.data["data"]["items"][0]["id"]

        complete_response = self.client.post(
            f"/api/v1/receptionist/follow-ups/{ticket_id}/complete-call/",
            {
                "call_result": "busy_later",
                "call_note": "Could not speak properly",
                "next_call_date": timezone.localdate().isoformat(),
            },
            format="json",
        )
        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)
        self.assertEqual(complete_response.data["data"]["status"], FollowUpStatus.COMPLETED)

        refreshed = self._list_followups(stage="pending")
        self.assertEqual(refreshed.status_code, status.HTTP_200_OK)
        pending_items = refreshed.data["data"]["items"]
        self.assertEqual(len(pending_items), 1)
        self.assertEqual(pending_items[0]["status"], FollowUpStatus.PENDING)

    def test_checkin_before_any_call_deletes_pending_ticket(self):
        self._list_followups(stage="pending")
        self.assertEqual(FollowUpTicket.objects.count(), 1)

        checkin_response = self.client.post(
            "/api/v1/sessions/checkin/",
            {"patient_id": str(self.patient.pk)},
            format="json",
        )
        self.assertEqual(checkin_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FollowUpTicket.objects.count(), 0)

    def test_checkin_after_completed_call_marks_successful(self):
        list_response = self._list_followups(stage="pending")
        ticket_id = list_response.data["data"]["items"][0]["id"]

        complete_response = self.client.post(
            f"/api/v1/receptionist/follow-ups/{ticket_id}/complete-call/",
            {
                "call_result": "confirmed",
                "call_note": "Patient confirmed visit.",
            },
            format="json",
        )
        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)
        self.assertEqual(complete_response.data["data"]["status"], FollowUpStatus.COMPLETED)

        checkin_response = self.client.post(
            "/api/v1/sessions/checkin/",
            {"patient_id": str(self.patient.pk)},
            format="json",
        )
        self.assertEqual(checkin_response.status_code, status.HTTP_201_CREATED)

        ticket = FollowUpTicket.objects.get(pk=ticket_id)
        self.assertEqual(ticket.status, FollowUpStatus.SUCCESSFUL)
        self.assertIsNotNone(ticket.successful_at)
