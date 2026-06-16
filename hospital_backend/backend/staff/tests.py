from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Designation, Staff, StaffAttendance

User = get_user_model()


class StaffApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="staffadmin@example.com", password="x", role="admin"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _create_payload(self, **overrides):
        payload = {
            "staff_code": "S001",
            "full_name": "Dr. Alok Verma",
            "designation": "Physician",
            "employment_type": "permanent",
            "aadhaar_number": "543210987654",
            "pan_number": "ABCDE1234F",
            "bank_account_number": "123456789012",
            "bank_ifsc": "SBIN0001234",
            "monthly_salary": "85000.00",
        }
        payload.update(overrides)
        return payload

    def test_designations_seeded(self):
        resp = self.client.get("/api/v1/staff/designations/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {d["name"] for d in resp.data["data"]["items"]}
        self.assertTrue({"Physician", "Nurse", "Doctor"}.issubset(names))

    def test_create_staff(self):
        resp = self.client.post("/api/v1/staff/", self._create_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Staff.objects.count(), 1)
        self.assertEqual(resp.data["data"]["designation"], "Physician")

    def test_staff_code_collision_returns_409(self):
        self.client.post("/api/v1/staff/", self._create_payload(), format="json")
        resp = self.client.post(
            "/api/v1/staff/",
            self._create_payload(full_name="Someone Else"),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(Staff.objects.count(), 1)

    def test_new_designation_is_created_and_persists(self):
        before = Designation.objects.count()
        self.client.post(
            "/api/v1/staff/",
            self._create_payload(designation="Lab Technician"),
            format="json",
        )
        self.assertEqual(Designation.objects.count(), before + 1)
        self.assertTrue(
            Designation.objects.filter(name__iexact="Lab Technician").exists()
        )

    def test_list_masks_sensitive_fields(self):
        self.client.post("/api/v1/staff/", self._create_payload(), format="json")
        resp = self.client.get("/api/v1/staff/")
        item = resp.data["data"]["items"][0]
        # Aadhaar/PAN/account masked to last 4; salary omitted entirely.
        self.assertTrue(item["aadhaar_number"].endswith("7654"))
        self.assertIn("•", item["aadhaar_number"])
        self.assertNotIn("monthly_salary", item)

    def test_detail_shows_full_sensitive_fields(self):
        create = self.client.post(
            "/api/v1/staff/", self._create_payload(), format="json"
        )
        staff_id = create.data["data"]["id"]
        resp = self.client.get(f"/api/v1/staff/{staff_id}/")
        self.assertEqual(resp.data["data"]["aadhaar_number"], "543210987654")
        self.assertEqual(resp.data["data"]["monthly_salary"], "85000.00")

    def test_soft_delete(self):
        create = self.client.post(
            "/api/v1/staff/", self._create_payload(), format="json"
        )
        staff_id = create.data["data"]["id"]
        resp = self.client.delete(f"/api/v1/staff/{staff_id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(Staff.objects.get(pk=staff_id).is_active)

    def test_non_admin_forbidden(self):
        pharmacist = User.objects.create_user(
            email="pharm2@example.com", password="x", role="pharmacist"
        )
        client = APIClient()
        client.force_authenticate(user=pharmacist)
        resp = client.get("/api/v1/staff/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class StaffAttendanceTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="attadmin@example.com", password="x", role="admin"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        d = Designation.objects.create(name="Tester")
        self.s1 = Staff.objects.create(staff_code="A1", full_name="One", designation=d)
        self.s2 = Staff.objects.create(staff_code="A2", full_name="Two", designation=d)

    def test_roster_lists_active_staff_with_null_status(self):
        resp = self.client.get("/api/v1/staff/attendance/?date=2026-06-10")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        items = resp.data["data"]["items"]
        self.assertEqual(len(items), 2)
        self.assertTrue(all(i["status"] is None for i in items))

    def test_bulk_mark_then_roster_reflects(self):
        resp = self.client.post(
            "/api/v1/staff/attendance/",
            {
                "date": "2026-06-10",
                "entries": [
                    {"staff_id": str(self.s1.id), "status": "present"},
                    {"staff_id": str(self.s2.id), "status": "absent"},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["data"]["marked"], 2)

        roster = self.client.get("/api/v1/staff/attendance/?date=2026-06-10")
        by_id = {i["staff_id"]: i["status"] for i in roster.data["data"]["items"]}
        self.assertEqual(by_id[str(self.s1.id)], "present")
        self.assertEqual(by_id[str(self.s2.id)], "absent")

    def test_bulk_is_idempotent_upsert(self):
        for st in ("present", "half_day"):
            self.client.post(
                "/api/v1/staff/attendance/",
                {"date": "2026-06-11", "entries": [{"staff_id": str(self.s1.id), "status": st}]},
                format="json",
            )
        self.assertEqual(
            StaffAttendance.objects.filter(staff=self.s1, date="2026-06-11").count(), 1
        )

    def test_month_stats(self):
        self.client.patch(
            f"/api/v1/staff/{self.s1.id}/attendance/",
            {"date": "2026-06-02", "status": "present"},
            format="json",
        )
        self.client.patch(
            f"/api/v1/staff/{self.s1.id}/attendance/",
            {"date": "2026-06-03", "status": "half_day"},
            format="json",
        )
        resp = self.client.get(f"/api/v1/staff/{self.s1.id}/attendance/?month=2026-06")
        stats = resp.data["data"]["stats"]
        self.assertEqual(stats["present"], 1)
        self.assertEqual(stats["half_day"], 1)
        self.assertEqual(stats["effective_present"], 1.5)

    def test_attendance_admin_only(self):
        pharm = User.objects.create_user(
            email="pharm3@example.com", password="x", role="pharmacist"
        )
        client = APIClient()
        client.force_authenticate(user=pharm)
        resp = client.get("/api/v1/staff/attendance/?date=2026-06-10")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class StaffPayrollTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="payadmin@example.com", password="x", role="admin"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        designation, _ = Designation.objects.get_or_create(name="Manager")
        self.staff = Staff.objects.create(
            staff_code="P001",
            full_name="Pay Test",
            designation=designation,
            monthly_salary="30000.00",
            holiday_allowed=2,
        )

    def _mark(self, day, st):
        self.client.patch(
            f"/api/v1/staff/{self.staff.id}/attendance/",
            {"date": f"2026-06-{day:02d}", "status": st},
            format="json",
        )

    def test_payroll_deduction_formula(self):
        # June 2026 → 30 days, per_day = 1000.
        for day in (2, 3, 4):
            self._mark(day, "absent")
        self._mark(5, "half_day")  # 0.5 absent
        resp = self.client.get(f"/api/v1/staff/{self.staff.id}/payroll/?month=2026-06")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        d = resp.data["data"]
        self.assertEqual(d["days_in_month"], 30)
        self.assertEqual(str(d["per_day_rate"]), "1000.00")
        # effective_absent 3.5, allowance 2 → unpaid 1.5 → deduction 1500.
        self.assertEqual(str(d["paid_leave_used"]), "2")
        self.assertEqual(str(d["unpaid_absent"]), "1.5")
        self.assertEqual(str(d["deduction"]), "1500.00")
        self.assertEqual(str(d["net_pay"]), "28500.00")

    def test_generate_payslip_persists_and_regenerates(self):
        self._mark(2, "absent")
        r1 = self.client.post(
            f"/api/v1/staff/{self.staff.id}/payslips/",
            {"month": "2026-06"},
            format="json",
        )
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        # Regenerate → new row, history preserved.
        r2 = self.client.post(
            f"/api/v1/staff/{self.staff.id}/payslips/",
            {"month": "2026-06"},
            format="json",
        )
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED)
        hist = self.client.get(f"/api/v1/staff/{self.staff.id}/payslips/")
        self.assertEqual(len(hist.data["data"]["items"]), 2)

    def test_payroll_admin_only(self):
        pharm = User.objects.create_user(
            email="paypharm@example.com", password="x", role="pharmacist"
        )
        client = APIClient()
        client.force_authenticate(user=pharm)
        resp = client.get(f"/api/v1/staff/{self.staff.id}/payroll/?month=2026-06")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


# Minimal 1x1 PNG for photo-upload tests.
_TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


class StaffSummaryAndPhotoTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="staffsummary@example.com", password="x", role="admin"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        d, _ = Designation.objects.get_or_create(name="Manager")
        Staff.objects.create(staff_code="A1", full_name="Active One", designation=d)
        Staff.objects.create(
            staff_code="A2", full_name="Inactive One", designation=d, is_active=False
        )

    def test_summary_counts(self):
        resp = self.client.get("/api/v1/staff/summary/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data["data"]
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["active"], 1)
        self.assertEqual(data["inactive"], 1)
        self.assertEqual(data["by_designation"].get("Manager"), 1)  # active only

    def test_summary_admin_only(self):
        pharm = User.objects.create_user(
            email="sumpharm@example.com", password="x", role="pharmacist"
        )
        client = APIClient()
        client.force_authenticate(user=pharm)
        resp = client.get("/api/v1/staff/summary/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_with_photo(self):
        resp = self.client.post(
            "/api/v1/staff/",
            {
                "staff_code": "P1",
                "full_name": "Photo Person",
                "designation": "Manager",
                "photo_base64": _TINY_PNG_B64,
                "photo_mime_type": "image/png",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data["data"]["photo_url"])
        created = Staff.objects.get(staff_code="P1")
        self.assertTrue(bool(created.photo))

    def test_photo_requires_mime_pairing(self):
        resp = self.client.post(
            "/api/v1/staff/",
            {
                "staff_code": "P2",
                "full_name": "Bad Photo",
                "designation": "Manager",
                "photo_base64": _TINY_PNG_B64,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
