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

        patient = Patient.objects.get(file_number="AGH260124")
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
            file_number="AGH260200",
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
        self.assertIn("file_number", first)
        self.assertIn("hdams_id", first)
        self.assertEqual(first["hdams_id"], "HDAMS-0001")
        self.assertIn("full_name", first)
        self.assertIn("phone_number", first)
        self.assertIn("date_of_birth", first)
        self.assertIn("sex", first)
        self.assertIn("status", first)

    def test_patient_visits_endpoint_returns_visit_stage_fields(self):
        patient = Patient.objects.create(
            file_number="AGH260201",
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
            file_number="AGH260202",
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
            file_number="AGH260203",
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
            file_number="AGH260204",
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
            file_number="AGH260205",
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
            file_number="AGH260206",
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

    def test_patient_delete_endpoint_allows_reception_role(self):
        reception = User.objects.create_user(
            email="reception@example.com",
            password="test-password",
            role="reception",
            full_name="Reception User",
        )
        patient = Patient.objects.create(
            file_number="AGH260207",
            patient_category="psychiatric",
            full_name="Protected Patient",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9555544444",
            address_line1="Address",
        )

        self.client.force_authenticate(user=reception)
        response = self.client.delete(f"/api/v1/patients/{patient.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertTrue(response.data["data"]["deleted"])
        self.assertFalse(Patient.objects.filter(pk=patient.id).exists())


class ReceptionPatientListFilterTests(APITestCase):
    """Multi-value filter semantics for ``GET /api/v1/receptionist/patients/``.

    Contract: state/district/addiction_type accept the query key repeated
    once per selected value. Within a field the predicates are OR'd; across
    fields they are AND'd. Single-value form remains supported for backwards
    compatibility with old callers.
    """

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="filters.reception@example.com",
            password="test-password",
            role="reception",
            full_name="Filters Reception",
        )

        # Three patients deliberately spread across two states / three
        # districts / three addiction types so every filter combination has
        # at least one hit and at least one miss.
        cls.alpha = Patient.objects.create(
            file_number="F-A1",
            patient_category="psychiatric",
            full_name="Alpha One",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9000000001",
            address_line1="addr 1",
            state="Bihar",
            district="Patna",
            addiction_type="alcohol",
        )
        cls.bravo = Patient.objects.create(
            file_number="F-B1",
            patient_category="deaddiction",
            full_name="Bravo Two",
            date_of_birth=timezone.localdate(),
            sex="female",
            phone_number="9000000002",
            address_line1="addr 2",
            state="Assam",
            district="Guwahati",
            addiction_type="drugs",
        )
        cls.charlie = Patient.objects.create(
            file_number="F-C1",
            patient_category="psychiatric",
            full_name="Charlie Three",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9000000003",
            address_line1="addr 3",
            state="Bihar",
            district="Gaya",
            addiction_type="tobacco",
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def _file_numbers(self, response):
        return sorted(item["file_number"] for item in response.data["data"]["items"])

    def test_no_filters_returns_all_patients(self):
        response = self.client.get("/api/v1/receptionist/patients/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._file_numbers(response), ["F-A1", "F-B1", "F-C1"])

    def test_single_state_value_backwards_compat(self):
        # The old ``?state=Bihar`` form must keep working.
        response = self.client.get("/api/v1/receptionist/patients/?state=Bihar")
        self.assertEqual(self._file_numbers(response), ["F-A1", "F-C1"])

    def test_multi_state_unions_within_field(self):
        response = self.client.get(
            "/api/v1/receptionist/patients/?state=Bihar&state=Assam"
        )
        self.assertEqual(self._file_numbers(response), ["F-A1", "F-B1", "F-C1"])

    def test_state_filter_is_case_insensitive(self):
        response = self.client.get("/api/v1/receptionist/patients/?state=bihar")
        self.assertEqual(self._file_numbers(response), ["F-A1", "F-C1"])

    def test_state_and_district_intersect_across_fields(self):
        # Bihar ∩ Patna → only Alpha (Charlie is Bihar+Gaya).
        response = self.client.get(
            "/api/v1/receptionist/patients/?state=Bihar&district=Patna"
        )
        self.assertEqual(self._file_numbers(response), ["F-A1"])

    def test_multi_district_unions_within_field(self):
        response = self.client.get(
            "/api/v1/receptionist/patients/?district=Patna&district=Guwahati"
        )
        self.assertEqual(self._file_numbers(response), ["F-A1", "F-B1"])

    def test_multi_addiction_type_unions_within_field(self):
        response = self.client.get(
            "/api/v1/receptionist/patients/?addiction_type=alcohol&addiction_type=tobacco"
        )
        self.assertEqual(self._file_numbers(response), ["F-A1", "F-C1"])

    def test_all_three_multi_filters_combined(self):
        response = self.client.get(
            "/api/v1/receptionist/patients/"
            "?state=Bihar&state=Assam"
            "&district=Patna&district=Guwahati"
            "&addiction_type=alcohol&addiction_type=drugs"
        )
        self.assertEqual(self._file_numbers(response), ["F-A1", "F-B1"])

    def test_empty_value_is_ignored(self):
        response = self.client.get("/api/v1/receptionist/patients/?state=")
        self.assertEqual(self._file_numbers(response), ["F-A1", "F-B1", "F-C1"])

    def test_summary_endpoint_honors_same_filter_contract(self):
        response = self.client.get(
            "/api/v1/receptionist/patients/summary/?state=Bihar&state=Assam"
            "&addiction_type=alcohol"
        )
        self.assertEqual(self._file_numbers(response), ["F-A1"])


class ReceptionPatientListSearchFieldsTests(APITestCase):
    """Field-scoped search semantics for ``GET /api/v1/receptionist/patients/``.

    Contract: ``?search_fields=`` is repeated-key, allow-list validated. When
    absent, ``?q=`` searches all legacy fields (file_number, full_name,
    phone_number, aadhaar_number) so the check-in lookup and summary list
    keep their existing behaviour. When present, ``?q=`` is OR-combined only
    across the named fields and may additionally include ``hdams_id``.
    """

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="search-fields.reception@example.com",
            password="test-password",
            role="reception",
            full_name="Search Fields Reception",
        )
        # The literal "777" appears in a different field on each row so a
        # query for "777" with a single-field scope unambiguously points to
        # exactly one patient.
        cls.alpha = Patient.objects.create(
            file_number="F-777-A",
            patient_category="psychiatric",
            full_name="Alpha Person",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9000000001",
            aadhaar_number="111111111111",
            hdams_id="HDAMS-001",
            address_line1="addr",
        )
        cls.bravo = Patient.objects.create(
            file_number="F-B1",
            patient_category="deaddiction",
            full_name="Bravo 777 Person",
            date_of_birth=timezone.localdate(),
            sex="female",
            phone_number="9000000002",
            aadhaar_number="222222222222",
            hdams_id="HDAMS-002",
            address_line1="addr",
        )
        cls.charlie = Patient.objects.create(
            file_number="F-C1",
            patient_category="psychiatric",
            full_name="Charlie Person",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9000000777",
            aadhaar_number="333333333333",
            hdams_id="HDAMS-003",
            address_line1="addr",
        )
        cls.delta = Patient.objects.create(
            file_number="F-D1",
            patient_category="psychiatric",
            full_name="Delta Person",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9000000004",
            aadhaar_number="444444444777",
            hdams_id="HDAMS-004",
            address_line1="addr",
        )
        cls.echo = Patient.objects.create(
            file_number="F-E1",
            patient_category="psychiatric",
            full_name="Echo Person",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9000000005",
            aadhaar_number="555555555555",
            hdams_id="HDAMS-777",
            address_line1="addr",
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def _file_numbers(self, response):
        return sorted(item["file_number"] for item in response.data["data"]["items"])

    def test_legacy_q_without_search_fields_searches_default_fields(self):
        # No search_fields → file_number, full_name, phone, aadhaar match
        # but NOT hdams_id. Echo (HDAMS-777) must be excluded.
        response = self.client.get("/api/v1/receptionist/patients/?q=777")
        self.assertEqual(
            self._file_numbers(response), ["F-777-A", "F-B1", "F-C1", "F-D1"]
        )

    def test_search_fields_file_number_only(self):
        response = self.client.get(
            "/api/v1/receptionist/patients/?q=777&search_fields=file_number"
        )
        self.assertEqual(self._file_numbers(response), ["F-777-A"])

    def test_search_fields_full_name_only(self):
        response = self.client.get(
            "/api/v1/receptionist/patients/?q=777&search_fields=full_name"
        )
        self.assertEqual(self._file_numbers(response), ["F-B1"])

    def test_search_fields_phone_number_only(self):
        response = self.client.get(
            "/api/v1/receptionist/patients/?q=777&search_fields=phone_number"
        )
        self.assertEqual(self._file_numbers(response), ["F-C1"])

    def test_search_fields_aadhaar_number_only(self):
        response = self.client.get(
            "/api/v1/receptionist/patients/?q=777&search_fields=aadhaar_number"
        )
        self.assertEqual(self._file_numbers(response), ["F-D1"])

    def test_search_fields_hdams_id_only(self):
        # hdams_id is opt-in via search_fields — not covered by legacy default.
        response = self.client.get(
            "/api/v1/receptionist/patients/?q=777&search_fields=hdams_id"
        )
        self.assertEqual(self._file_numbers(response), ["F-E1"])

    def test_search_fields_multiple_or_combines_within_scope(self):
        response = self.client.get(
            "/api/v1/receptionist/patients/"
            "?q=777&search_fields=file_number&search_fields=hdams_id"
        )
        self.assertEqual(self._file_numbers(response), ["F-777-A", "F-E1"])

    def test_unknown_search_field_falls_back_to_default(self):
        # An unknown field name leaves the validated set empty → default
        # behaviour kicks in so the user never gets a silently empty result.
        response = self.client.get(
            "/api/v1/receptionist/patients/?q=777&search_fields=bogus_field"
        )
        self.assertEqual(
            self._file_numbers(response), ["F-777-A", "F-B1", "F-C1", "F-D1"]
        )

    def test_search_fields_ignored_when_q_is_empty(self):
        # Without a query, search_fields is a no-op — every patient is listed.
        response = self.client.get(
            "/api/v1/receptionist/patients/?search_fields=file_number"
        )
        self.assertEqual(
            self._file_numbers(response),
            ["F-777-A", "F-B1", "F-C1", "F-D1", "F-E1"],
        )


class PatientFilterOptionsEndpointTests(APITestCase):
    """Contract tests for the ``/filter-options/`` endpoint.

    This endpoint is the single source of truth for the State and District
    multi-select option lists on the reception patient page. Its result
    must:

    * Be shaped ``{success, data: {districts_by_state}}``.
    * Group every (state, district) pair seen on a Patient row, with both
      sorted and de-duplicated.
    * Exclude rows where state OR district is blank/null.
    * Be **stable regardless of caller-supplied filter params** — that
      stability is exactly what prevents the option list from self-narrowing
      when the user picks a value.
    """

    URL = "/api/v1/receptionist/patients/filter-options/"

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="filter-options.reception@example.com",
            password="test-password",
            role="reception",
            full_name="Filter Options Reception",
        )

        # Coverage: two states with multiple districts (Bihar), one state
        # with a single district (Assam), a duplicate to prove distinct,
        # one row with empty district (should be excluded), one with empty
        # state (should be excluded).
        common = dict(
            patient_category="psychiatric",
            date_of_birth=timezone.localdate(),
            sex="male",
            phone_number="9000000000",
            address_line1="addr",
            addiction_type="other",
        )
        Patient.objects.create(file_number="FO-1", full_name="P1", state="Bihar", district="Patna", **common)
        Patient.objects.create(file_number="FO-2", full_name="P2", state="Bihar", district="Patna", **common)  # duplicate
        Patient.objects.create(file_number="FO-3", full_name="P3", state="Bihar", district="Gaya", **common)
        Patient.objects.create(file_number="FO-4", full_name="P4", state="Bihar", district="Pataliputra", **common)
        Patient.objects.create(file_number="FO-5", full_name="P5", state="Assam", district="Guwahati", **common)
        Patient.objects.create(file_number="FO-6", full_name="P6", state="Assam", district="", **common)        # excluded
        Patient.objects.create(file_number="FO-7", full_name="P7", state="", district="Anything", **common)    # excluded

    def setUp(self):
        # The view caches the queryset result via ``django.core.cache``. Tests
        # mutate the underlying data (via setUpTestData) so we must start each
        # test with a clean cache, otherwise the second test in the class would
        # see whatever the first one populated.
        from django.core.cache import cache

        cache.clear()
        self.client.force_authenticate(user=self.user)

    def test_returns_expected_shape_and_grouping(self):
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertTrue(body["success"])
        data = body["data"]
        self.assertIn("districts_by_state", data)
        # Postgres orders strings byte-wise, which puts "Pataliputra" before
        # "Patna" (shared "Pat" prefix, then 'a' < 'n'). Reflect that here.
        self.assertEqual(
            data["districts_by_state"],
            {
                "Assam": ["Guwahati"],
                "Bihar": ["Gaya", "Pataliputra", "Patna"],
            },
        )

    def test_excludes_blank_state_or_district(self):
        # Re-check after-the-fact: no key/value blanks in the response.
        response = self.client.get(self.URL)
        mapping = response.json()["data"]["districts_by_state"]
        self.assertNotIn("", mapping)
        for districts in mapping.values():
            self.assertNotIn("", districts)

    def test_filter_params_have_no_effect_on_result(self):
        # The whole point of the endpoint: stable regardless of what the
        # caller is currently filtering on. If the user has Patna selected,
        # they still need to see Gaya and Pataliputra as options.
        baseline = self.client.get(self.URL).json()["data"]
        # Bust the cache_page() wrapper across calls by varying an irrelevant
        # query param too — Django's per-view cache keys on URL+vary headers.
        filtered = self.client.get(
            self.URL + "?state=Bihar&district=Patna&addiction_type=alcohol"
        ).json()["data"]
        self.assertEqual(baseline, filtered)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
