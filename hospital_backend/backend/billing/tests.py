"""Tests for the billing ledger primitives and the BillingSettings singleton."""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from billing import services as billing_services
from billing.models import BillingSettings, LedgerEntryType, PatientLedgerEntry
from patients.models import Patient

User = get_user_model()


def make_patient(**over):
    base = dict(
        patient_category="deaddiction",
        full_name="Test Patient",
        date_of_birth=date(1990, 1, 1),
        sex="male",
        phone_number="9999999999",
        address_line1="Somewhere",
    )
    base.update(over)
    return Patient.objects.create(**base)


class BillingSettingsTests(TestCase):
    def test_singleton_load_creates_and_reuses_single_row(self):
        s1 = BillingSettings.load()
        s1.default_consultation_fee = Decimal("200.00")
        s1.save()
        s2 = BillingSettings.load()
        self.assertEqual(s2.pk, 1)
        self.assertEqual(s2.default_consultation_fee, Decimal("200.00"))
        self.assertEqual(BillingSettings.objects.count(), 1)


class PatientLedgerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="rx@example.com", password="x", role="pharmacist"
        )
        self.patient = make_patient()

    def test_balance_is_sum_of_signed_entries(self):
        billing_services.record_entry(
            patient_id=self.patient.id,
            entry_type=LedgerEntryType.CHARGE,
            amount=Decimal("1000.00"),
            user=self.user,
        )
        billing_services.record_entry(
            patient_id=self.patient.id,
            entry_type=LedgerEntryType.PAYMENT,
            amount=Decimal("-400.00"),
            user=self.user,
        )
        self.assertEqual(
            PatientLedgerEntry.balance_for(self.patient.id), Decimal("600.00")
        )

    def test_sync_cache_clamps_credit_to_zero_but_ledger_keeps_sign(self):
        billing_services.record_entry(
            patient_id=self.patient.id,
            entry_type=LedgerEntryType.PAYMENT,
            amount=Decimal("-50.00"),
            user=self.user,
        )
        balance = billing_services.sync_patient_outstanding_cache(self.patient.id)
        self.patient.refresh_from_db()
        self.assertEqual(balance, Decimal("-50.00"))
        self.assertEqual(self.patient.outstanding_debt, Decimal("0"))

    def test_record_entry_ignores_zero(self):
        self.assertIsNone(
            billing_services.record_entry(
                patient_id=self.patient.id,
                entry_type=LedgerEntryType.PAYMENT,
                amount=Decimal("0"),
                user=self.user,
            )
        )
        self.assertEqual(PatientLedgerEntry.objects.count(), 0)
