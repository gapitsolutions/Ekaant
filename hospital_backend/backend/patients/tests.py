import base64
import os
import shutil
import tempfile
from datetime import timedelta
from urllib.parse import urlsplit

from django.core.files.base import ContentFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from patients.models import Patient
from visits.models import VisitSession


TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="patient-media-test-")


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class PatientRegistrationPhotoTests(APITestCase):
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
        self.url = "/api/v1/patients/register/"

    def _payload(self, **overrides):
        payload = {
            "patient_category": "psychiatric",
            "file_number": "AGH260123",
            "full_name": "Patient Name",
            "phone_number": "9876543210",
            "date_of_birth": "1998-04-30",
            "sex": "male",
            "fingerprint_template": "<PID_XML>",
            "aadhaar_number": "123412341234",
            "relative_phone": "9876500000",
            "address_line1": "Street address",
        }
        payload.update(overrides)
        return payload

    def test_register_without_photo_succeeds(self):
        response = self.client.post(self.url, self._payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertIsNone(response.data["data"].get("photo_url"))

    def test_register_with_valid_jpeg_base64_succeeds(self):
        jpeg_bytes = (
            b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
        )
        response = self.client.post(
            self.url,
            self._payload(
                file_number="AGH260124",
                aadhaar_number="123412341235",
                photo_base64=base64.b64encode(jpeg_bytes).decode("ascii"),
                photo_mime_type="image/jpeg",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        photo_url = response.data["data"]["photo_url"]
        self.assertIn("/api/v1/patients/", photo_url)
        self.assertIn("/photo/", photo_url)

        patient = Patient.objects.get(registration_number="AGH260124")
        self.assertTrue(patient.photo)
        self.assertTrue(patient.photo.name.startswith("patients/"))

        photo_response = self.client.get(urlsplit(photo_url).path)
        self.assertEqual(photo_response.status_code, status.HTTP_200_OK)

    def test_register_with_valid_png_base64_succeeds(self):
        tiny_png_base64 = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z5xQAAAAASUVORK5CYII="
        )
        response = self.client.post(
            self.url,
            self._payload(
                file_number="AGH260125",
                aadhaar_number="123412341236",
                photo_base64=tiny_png_base64,
                photo_mime_type="image/png",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        photo_url = response.data["data"]["photo_url"]
        self.assertIn("/api/v1/patients/", photo_url)
        self.assertIn("/photo/", photo_url)

    def test_patient_photo_endpoint_requires_auth(self):
        response = self.client.post(
            self.url,
            self._payload(
                file_number="AGH260130",
                aadhaar_number="123412341241",
                photo_base64="aGVsbG8=",
                photo_mime_type="image/jpeg",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        photo_url = response.data["data"]["photo_url"]

        self.client.force_authenticate(user=None)
        unauthorized = self.client.get(urlsplit(photo_url).path)
        self.assertEqual(unauthorized.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_photo_mime_type_returns_400(self):
        response = self.client.post(
            self.url,
            self._payload(
                file_number="AGH260126",
                aadhaar_number="123412341237",
                photo_base64="aGVsbG8=",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "photo_base64 and photo_mime_type must be provided together",
            response.data["error"]["message"],
        )

    def test_unsupported_photo_mime_type_returns_400(self):
        response = self.client.post(
            self.url,
            self._payload(
                file_number="AGH260127",
                aadhaar_number="123412341238",
                photo_base64="aGVsbG8=",
                photo_mime_type="image/gif",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "Unsupported photo_mime_type. Allowed: image/jpeg, image/png",
            response.data["error"]["message"],
        )

    def test_invalid_base64_returns_400(self):
        response = self.client.post(
            self.url,
            self._payload(
                file_number="AGH260128",
                aadhaar_number="123412341239",
                photo_base64="%%%not-base64%%%",
                photo_mime_type="image/jpeg",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid photo_base64 payload", response.data["error"]["message"])

    def test_oversized_image_returns_400(self):
        oversized = base64.b64encode(b"x" * (2 * 1024 * 1024 + 1)).decode("ascii")
        response = self.client.post(
            self.url,
            self._payload(
                file_number="AGH260129",
                aadhaar_number="123412341240",
                photo_base64=oversized,
                photo_mime_type="image/jpeg",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "Photo exceeds maximum allowed size (2 MB)",
            response.data["error"]["message"],
        )

    def test_receptionist_patient_summary_endpoint_returns_compact_data(self):
        Patient.objects.create(
            registration_number="AGH260200",
            hdams_id="HDAMS-0001",
            patient_category="psychiatric",
            full_name="Summary Patient",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9876543210",
            address_line1="Address",
        )

        response = self.client.get("/api/v1/receptionist/patients/summary/?page=1&pageSize=20")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertGreaterEqual(len(response.data["data"]["items"]), 1)
        first = response.data["data"]["items"][0]
        self.assertIn("patient_id", first)
        self.assertIn("registration_number", first)
        self.assertIn("hdams_id", first)
        self.assertEqual(first["hdams_id"], "HDAMS-0001")
        self.assertIn("full_name", first)
        self.assertIn("phone_number", first)
        self.assertIn("date_of_birth", first)
        self.assertIn("sex", first)
        self.assertIn("status", first)

    def test_patient_visits_endpoint_returns_visit_stage_fields(self):
        patient = Patient.objects.create(
            registration_number="AGH260201",
            patient_category="deaddiction",
            full_name="Visit Patient",
            date_of_birth=timezone.localdate(),
            sex="female",
            phone_number="9876500001",
            address_line1="Address",
        )
        visit = VisitSession.objects.create(
            visit_uid=VisitSession.generate_visit_uid(),
            patient=patient,
            checked_in_by=self.user,
            visit_type="follow_up",
            status="in_progress",
            current_stage="pharmacy",
        )

        response = self.client.get(f"/api/v1/patients/{patient.id}/visits/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(len(response.data["data"]["items"]), 1)
        item = response.data["data"]["items"][0]
        self.assertEqual(item["id"], str(visit.id))
        self.assertIn("checkin_time", item)
        self.assertIn("completed_time", item)
        self.assertEqual(item["status"], "in_progress")
        self.assertEqual(item["current_stage"], "pharmacy")

    def test_patient_general_patch_persists_profile_changes(self):
        patient = Patient.objects.create(
            registration_number="AGH260202",
            patient_category="psychiatric",
            full_name="Original Name",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9999988888",
            address_line1="Old Address",
        )

        payload = {
            "full_name": "Updated Name",
            "phone_number": "9876543210",
            "address_line1": "New Address",
            "status": "inactive",
            "city": "Agra",
            "district": "Agra",
            "state": "Uttar Pradesh",
            "pincode": "282001",
        }
        response = self.client.patch(
            f"/api/v1/patients/{patient.id}/general/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["full_name"], "Updated Name")
        self.assertEqual(response.data["data"]["status"], "inactive")

        patient.refresh_from_db()
        self.assertEqual(patient.full_name, "Updated Name")
        self.assertEqual(patient.phone_number, "9876543210")
        self.assertEqual(patient.address_line1, "New Address")
        self.assertEqual(patient.status, "inactive")
        self.assertEqual(patient.city, "Agra")

    def test_patient_general_patch_status_only_update(self):
        patient = Patient.objects.create(
            registration_number="AGH260203",
            patient_category="deaddiction",
            full_name="Status Patient",
            date_of_birth=timezone.localdate(),
            sex="female",
            phone_number="9000000000",
            address_line1="Address",
            status="active",
        )

        response = self.client.patch(
            f"/api/v1/patients/{patient.id}/general/",
            {"status": "follow_up"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["status"], "follow_up")

        patient.refresh_from_db()
        self.assertEqual(patient.status, "follow_up")

    def test_patient_general_patch_can_recapture_fingerprint(self):
        patient = Patient.objects.create(
            registration_number="AGH260204",
            patient_category="psychiatric",
            full_name="Fingerprint Patient",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9888877777",
            address_line1="Address",
            fingerprint_template="OLD_TEMPLATE",
            fingerprint_enrolled_at=timezone.now() - timedelta(days=30),
            fingerprint_template_key_version="v1",
        )

        response = self.client.patch(
            f"/api/v1/patients/{patient.id}/general/",
            {
                "fingerprint_template": "NEW_TEMPLATE",
                "fingerprint_template_key_version": "v2",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertTrue(response.data["data"]["has_fingerprint"])

        patient.refresh_from_db()
        self.assertEqual(patient.fingerprint_template, "NEW_TEMPLATE")
        self.assertEqual(patient.fingerprint_template_key_version, "v2")
        self.assertIsNotNone(patient.fingerprint_enrolled_at)
        self.assertGreater(
            patient.fingerprint_enrolled_at,
            timezone.now() - timedelta(minutes=1),
        )

    def test_patient_general_patch_can_clear_fingerprint(self):
        patient = Patient.objects.create(
            registration_number="AGH260205",
            patient_category="deaddiction",
            full_name="Clear Fingerprint",
            date_of_birth=timezone.localdate(),
            sex="female",
            phone_number="9777766666",
            address_line1="Address",
            fingerprint_template="EXISTING_TEMPLATE",
            fingerprint_enrolled_at=timezone.now(),
            fingerprint_template_key_version="v2",
        )

        response = self.client.patch(
            f"/api/v1/patients/{patient.id}/general/",
            {
                "fingerprint_template": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertFalse(response.data["data"]["has_fingerprint"])

        patient.refresh_from_db()
        self.assertEqual(patient.fingerprint_template, "")
        self.assertIsNone(patient.fingerprint_enrolled_at)

    def test_patient_delete_endpoint_cascades_visits_and_media(self):
        patient = Patient.objects.create(
            registration_number="AGH260206",
            patient_category="deaddiction",
            full_name="Delete Me",
            date_of_birth=timezone.localdate(),
            sex="female",
            phone_number="9666655555",
            address_line1="Address",
        )
        patient.photo.save("profile.jpg", ContentFile(b"fake-image"), save=True)

        VisitSession.objects.create(
            visit_uid=VisitSession.generate_visit_uid(),
            patient=patient,
            checked_in_by=self.user,
            visit_type="follow_up",
            status="completed",
            current_stage="completed",
            completed_time=timezone.now(),
        )

        patient_id = str(patient.id)
        patient_media_dir = os.path.join(TEST_MEDIA_ROOT, "patients", patient_id)
        self.assertTrue(os.path.exists(patient_media_dir))
        self.assertTrue(Patient.objects.filter(pk=patient.id).exists())
        self.assertTrue(VisitSession.objects.filter(patient_id=patient.id).exists())

        response = self.client.delete(f"/api/v1/patients/{patient.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertTrue(response.data["data"]["deleted"])
        self.assertEqual(response.data["data"]["patient_id"], patient_id)
        self.assertFalse(Patient.objects.filter(pk=patient.id).exists())
        self.assertFalse(VisitSession.objects.filter(patient_id=patient.id).exists())
        self.assertFalse(os.path.exists(patient_media_dir))

    def test_patient_delete_endpoint_allows_receptionist_role(self):
        receptionist = User.objects.create_user(
            email="receptionist@example.com",
            password="test-password",
            role="receptionist",
            full_name="Receptionist User",
        )
        patient = Patient.objects.create(
            registration_number="AGH260207",
            patient_category="psychiatric",
            full_name="Protected Patient",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9555544444",
            address_line1="Address",
        )

        self.client.force_authenticate(user=receptionist)
        response = self.client.delete(f"/api/v1/patients/{patient.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertTrue(response.data["data"]["deleted"])
        self.assertFalse(Patient.objects.filter(pk=patient.id).exists())
