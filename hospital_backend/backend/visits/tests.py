import os
import shutil
import tempfile
from datetime import timedelta
from uuid import uuid4

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from patients.models import Patient

from .models import VisitSession, VisitStage, VisitStatus


TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="visit-media-test-")
TEST_HISTORY_MEDIA_ROOT = tempfile.mkdtemp(prefix="visit-history-media-test-")
TINY_PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z5xQAAAAASUVORK5CYII="
)


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class CheckinAutoCompleteTests(APITestCase):
    MEDIA_ROOT_DIR = TEST_MEDIA_ROOT

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.MEDIA_ROOT_DIR, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.user = User.objects.create_user(
            email="reception@example.com",
            password="test-password",
            role="reception",
            full_name="Reception User",
        )
        self.client.force_authenticate(user=self.user)

        self.patient = Patient.objects.create(
            file_number="AGH260300",
            patient_category="deaddiction",
            full_name="Queue Patient",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9876543210",
            address_line1="Address",
        )

    def test_checkin_auto_completes_session_and_shows_in_today_queue(self):
        response = self.client.post(
            "/api/v1/sessions/checkin/",
            {"patient_id": str(self.patient.id)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["status"], VisitStatus.COMPLETED)
        self.assertEqual(response.data["data"]["current_stage"], VisitStage.COMPLETED)
        self.assertIsNotNone(response.data["data"]["completed_at"])

        session = VisitSession.objects.get(patient=self.patient, visit_date=timezone.localdate())
        self.assertEqual(session.status, VisitStatus.COMPLETED)
        self.assertEqual(session.current_stage, VisitStage.COMPLETED)
        self.assertIsNotNone(session.completed_time)

        queue_response = self.client.get("/api/v1/receptionist/queue/")
        self.assertEqual(queue_response.status_code, status.HTTP_200_OK)
        self.assertTrue(queue_response.data["success"])
        self.assertEqual(queue_response.data["data"]["total"], 1)
        item = queue_response.data["data"]["items"][0]
        self.assertEqual(item["patient_id"], str(self.patient.id))
        self.assertEqual(item["status"], VisitStatus.COMPLETED)
        self.assertEqual(item["current_stage"], VisitStage.COMPLETED)

    def test_second_checkin_same_day_is_rejected(self):
        first = self.client.post(
            "/api/v1/sessions/checkin/",
            {"patient_id": str(self.patient.id)},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(
            "/api/v1/sessions/checkin/",
            {"patient_id": str(self.patient.id)},
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("already checked in for today", second.data["error"]["message"])

    def test_checkin_photo_method_stores_verification_photo_under_patient_media(self):
        response = self.client.post(
            "/api/v1/sessions/checkin/",
            {
                "patient_id": str(self.patient.id),
                "verification_method": "photo",
                "verification_photo_base64": TINY_PNG_BASE64,
                "verification_photo_mime_type": "image/png",
                "verification_photo_captured_at": timezone.now().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["verification_method"], "photo")
        self.assertIsNotNone(response.data["data"].get("verification_photo_captured_at"))

        session = VisitSession.objects.get(patient=self.patient, visit_date=timezone.localdate())
        self.assertEqual(session.verification_method, "photo")
        self.assertIsNotNone(session.verification_photo_captured_at)
        self.assertTrue(session.verification_photo)
        self.assertIn(f"patients/{self.patient.id}/visits/", session.verification_photo.name)
        self.assertTrue(os.path.exists(session.verification_photo.path))

    def test_checkin_photo_method_requires_photo_payload(self):
        response = self.client.post(
            "/api/v1/sessions/checkin/",
            {
                "patient_id": str(self.patient.id),
                "verification_method": "photo",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "verification photo is required",
            response.data["error"]["message"],
        )

    def test_checkin_fingerprint_method_rejects_photo_payload_fields(self):
        response = self.client.post(
            "/api/v1/sessions/checkin/",
            {
                "patient_id": str(self.patient.id),
                "verification_method": "fingerprint",
                "verification_photo_base64": "aGVsbG8=",
                "verification_photo_mime_type": "image/jpeg",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "verification_photo_* fields are only allowed",
            response.data["error"]["message"],
        )


@override_settings(MEDIA_ROOT=TEST_HISTORY_MEDIA_ROOT)
class ReceptionCheckinHistoryEndpointTests(APITestCase):
    MEDIA_ROOT_DIR = TEST_HISTORY_MEDIA_ROOT

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.MEDIA_ROOT_DIR, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.user = User.objects.create_user(
            email="history.reception@example.com",
            password="test-password",
            role="reception",
            full_name="History Reception User",
        )
        self.client.force_authenticate(user=self.user)

        self.patient_one = Patient.objects.create(
            file_number="AGH260401",
            patient_category="deaddiction",
            full_name="History One",
            date_of_birth=timezone.localdate() - timedelta(days=9000),
            sex="male",
            phone_number="9111111111",
            address_line1="Address 1",
            addiction_type="alcohol",
            addiction_duration="4 years",
        )
        self.patient_two = Patient.objects.create(
            file_number="AGH260402",
            patient_category="psychiatric",
            full_name="History Two",
            date_of_birth=timezone.localdate() - timedelta(days=8000),
            sex="female",
            phone_number="9222222222",
            address_line1="Address 2",
            addiction_type="other",
            addiction_duration="2 years",
        )

    def _create_session(
        self,
        *,
        patient,
        verification_method="fingerprint",
        visit_date=None,
        checkin_time=None,
    ):
        return VisitSession.objects.create(
            visit_uid=f"VST-HISTORY-{uuid4().hex[:10]}",
            patient=patient,
            checked_in_by=self.user,
            visit_date=visit_date or timezone.localdate(),
            visit_type="follow_up",
            checkin_time=checkin_time or timezone.now(),
            completed_time=timezone.now(),
            status=VisitStatus.COMPLETED,
            current_stage=VisitStage.COMPLETED,
            verification_method=verification_method,
        )

    def _create_photo_checkin(self, patient):
        response = self.client.post(
            "/api/v1/sessions/checkin/",
            {
                "patient_id": str(patient.id),
                "verification_method": "photo",
                "verification_photo_base64": TINY_PNG_BASE64,
                "verification_photo_mime_type": "image/png",
                "verification_photo_captured_at": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        session_id = response.data["data"]["session_id"]
        return VisitSession.objects.get(pk=session_id)

    def test_checkin_history_list_supports_default_pagination_search_and_method_filter(self):
        old_time = timezone.now() - timedelta(hours=2)
        self._create_session(
            patient=self.patient_one,
            verification_method="fingerprint",
            checkin_time=old_time,
        )
        self._create_session(
            patient=self.patient_two,
            verification_method="photo",
            checkin_time=timezone.now() - timedelta(hours=1),
        )

        response = self.client.get("/api/v1/receptionist/checkin-history/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.data["data"]
        self.assertEqual(payload["pagination"]["page"], 1)
        self.assertEqual(payload["pagination"]["pageSize"], 50)
        self.assertEqual(payload["pagination"]["total"], 2)
        self.assertEqual(len(payload["items"]), 2)

        search_response = self.client.get(
            "/api/v1/receptionist/checkin-history/",
            {"q": "AGH260401"},
        )
        self.assertEqual(search_response.status_code, status.HTTP_200_OK)
        search_items = search_response.data["data"]["items"]
        self.assertEqual(len(search_items), 1)
        self.assertEqual(
            search_items[0]["patient"]["file_number"],
            "AGH260401",
        )

        filter_response = self.client.get(
            "/api/v1/receptionist/checkin-history/",
            {"verification_method": "photo", "pageSize": 1},
        )
        self.assertEqual(filter_response.status_code, status.HTTP_200_OK)
        filtered_payload = filter_response.data["data"]
        self.assertEqual(filtered_payload["pagination"]["total"], 1)
        self.assertEqual(filtered_payload["pagination"]["pageSize"], 1)
        self.assertEqual(filtered_payload["items"][0]["verification_method"], "photo")

    def test_checkin_history_photo_endpoint_streams_verification_photo(self):
        session = self._create_photo_checkin(self.patient_one)

        response = self.client.get(
            f"/api/v1/receptionist/checkin-history/{session.pk}/verification-photo/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertTrue(response["Content-Type"].startswith("image/"))

    def test_checkin_history_delete_removes_visit_and_photo_but_keeps_patient(self):
        session = self._create_photo_checkin(self.patient_one)
        photo_path = session.verification_photo.path
        self.assertTrue(os.path.exists(photo_path))

        response = self.client.delete(f"/api/v1/receptionist/checkin-history/{session.pk}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["data"]["deleted"])
        self.assertFalse(VisitSession.objects.filter(pk=session.pk).exists())
        self.assertTrue(Patient.objects.filter(pk=self.patient_one.pk).exists())
        self.assertFalse(os.path.exists(photo_path))


class ReceptionReportEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="reports.reception@example.com",
            password="test-password",
            role="reception",
            full_name="Reception Reports User",
        )
        self.client.force_authenticate(user=self.user)

        self.patient_one = Patient.objects.create(
            file_number="AGH260301",
            patient_category="deaddiction",
            full_name="Daily One",
            date_of_birth=timezone.localdate() - timedelta(days=10000),
            sex="male",
            phone_number="9000000001",
            address_line1="Address 1",
        )
        self.patient_two = Patient.objects.create(
            file_number="AGH260302",
            patient_category="psychiatric",
            full_name="Daily Two",
            date_of_birth=timezone.localdate() - timedelta(days=9000),
            sex="female",
            phone_number="9000000002",
            address_line1="Address 2",
        )

    def _create_session(self, *, patient, visit_date, status=VisitStatus.COMPLETED):
        return VisitSession.objects.create(
            visit_uid=f"VST-TEST-{uuid4().hex[:12]}",
            patient=patient,
            checked_in_by=self.user,
            visit_date=visit_date,
            visit_type="follow_up",
            status=status,
            current_stage=VisitStage.COMPLETED if status == VisitStatus.COMPLETED else VisitStage.DOCTOR,
        )

    def test_daily_report_endpoint_filters_by_date(self):
        target_date = timezone.localdate()
        previous_date = target_date - timedelta(days=1)

        self._create_session(patient=self.patient_one, visit_date=target_date)
        self._create_session(patient=self.patient_two, visit_date=previous_date)

        response = self.client.get(
            "/api/v1/receptionist/reports/daily/",
            {"date": target_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.data["data"]
        self.assertEqual(str(payload["date"]), target_date.isoformat())
        self.assertEqual(payload["total_checkins"], 1)
        self.assertEqual(len(payload["items"]), 1)
        self.assertEqual(payload["items"][0]["patient"]["file_number"], "AGH260301")

    def test_monthly_report_endpoint_filters_by_year_and_month(self):
        today = timezone.localdate()
        in_month_date = today.replace(day=1)
        if today.month == 1:
            out_month_year = today.year - 1
            out_month = 12
        else:
            out_month_year = today.year
            out_month = today.month - 1

        self._create_session(patient=self.patient_one, visit_date=in_month_date)
        self._create_session(
            patient=self.patient_two,
            visit_date=in_month_date,
            status=VisitStatus.IN_PROGRESS,
        )
        self._create_session(
            patient=self.patient_two,
            visit_date=in_month_date.replace(year=out_month_year, month=out_month, day=1),
        )

        response = self.client.get(
            "/api/v1/receptionist/reports/monthly/",
            {"year": today.year, "month": today.month},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.data["data"]
        self.assertEqual(payload["year"], today.year)
        self.assertEqual(payload["month"], today.month)
        self.assertEqual(payload["total_checkins"], 2)
        self.assertEqual(payload["active_checkins"], 1)
        self.assertEqual(payload["completed_checkins"], 1)
        self.assertTrue(any(item["count"] >= 1 for item in payload["breakdown"]))

    def test_custom_range_report_endpoint_returns_summary_and_items(self):
        today = timezone.localdate()
        day_one = today - timedelta(days=3)
        day_two = today - timedelta(days=1)

        self._create_session(patient=self.patient_one, visit_date=day_one)
        self._create_session(
            patient=self.patient_two,
            visit_date=day_two,
            status=VisitStatus.IN_PROGRESS,
        )

        response = self.client.get(
            "/api/v1/receptionist/reports/custom-range/",
            {
                "start_date": (today - timedelta(days=5)).isoformat(),
                "end_date": today.isoformat(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.data["data"]
        self.assertEqual(payload["total_checkins"], 2)
        self.assertEqual(payload["unique_patients"], 2)
        self.assertEqual(payload["active_checkins"], 1)
        self.assertEqual(payload["completed_checkins"], 1)
        self.assertEqual(len(payload["items"]), 2)
        self.assertIn("patient", payload["items"][0])


class VisitUidGenerationTests(APITestCase):
    """Regression tests for the deletion-driven visit_uid collision (HTTP 500).

    Old bug: ``generate_visit_uid`` derived the sequence number from a live
    ``count()``. Deleting a session dropped the count below an existing UID, so
    the next check-in regenerated a UID that still belonged to a surviving row
    and the unique constraint raised IntegrityError → 500.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            email="uid-reception@example.com",
            password="test-password",
            role="reception",
            full_name="UID Reception",
        )
        self.client.force_authenticate(user=self.user)

    def _make_patient(self, file_number, name):
        return Patient.objects.create(
            file_number=file_number,
            patient_category="deaddiction",
            full_name=name,
            date_of_birth=timezone.localdate() - timedelta(days=9000),
            sex="male",
            phone_number=f"90000{file_number[-5:]}",
            address_line1="Address",
        )

    def _checkin(self, patient):
        return self.client.post(
            "/api/v1/sessions/checkin/",
            {"patient_id": str(patient.id)},
            format="json",
        )

    def test_generate_visit_uid_uses_max_not_count(self):
        year = timezone.localdate().year
        # Simulate a surviving high-numbered row with lower numbers deleted:
        # only VST-<year>-0006 exists, so count()==1 but the max number is 6.
        VisitSession.objects.create(
            visit_uid=f"VST-{year}-0006",
            patient=self._make_patient("UID000010", "Existing Six"),
            checked_in_by=self.user,
            visit_date=timezone.localdate(),
        )
        self.assertEqual(VisitSession.generate_visit_uid(), f"VST-{year}-0007")

    def test_checkin_after_delete_does_not_collide(self):
        patient_a = self._make_patient("UID000001", "Patient A")
        patient_b = self._make_patient("UID000002", "Patient B")
        patient_c = self._make_patient("UID000003", "Patient C")

        resp_a = self._checkin(patient_a)
        resp_b = self._checkin(patient_b)
        self.assertEqual(resp_a.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_b.status_code, status.HTTP_201_CREATED)

        # Delete the LOWER-numbered session so count() drifts below the max UID,
        # reproducing the exact condition that used to 500 the next check-in.
        VisitSession.objects.get(patient=patient_a).delete()

        resp_c = self._checkin(patient_c)
        self.assertEqual(resp_c.status_code, status.HTTP_201_CREATED)

        # New session must have a unique UID distinct from every survivor.
        all_uids = list(VisitSession.objects.values_list("visit_uid", flat=True))
        self.assertEqual(len(all_uids), len(set(all_uids)))
        self.assertEqual(VisitSession.objects.filter(patient=patient_c).count(), 1)
