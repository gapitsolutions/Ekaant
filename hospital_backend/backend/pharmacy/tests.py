"""Tests proving a single purchase invoice can carry multiple batches of the
same medicine, each tracked independently.

Uniqueness rule under test: ``(medicine, batch_number)`` — the same key the
``MedicineBatch`` unique constraint and the ``PurchaseInvoiceCreateSerializer``
duplicate check enforce. Expiry date is NOT part of the key.
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from pharmacy import services
from pharmacy.models import (
    Medicine,
    MedicineBatch,
    MedicineCategory,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    StockMovement,
    Supplier,
)
from pharmacy.serializers import (
    DispenseCreateSerializer,
    PurchaseInvoiceCreateSerializer,
)

from billing import services as billing_services
from billing.models import BillingSettings, PatientLedgerEntry
from patients.models import Patient
from visits.models import VisitSession, VisitStage, VisitStatus

User = get_user_model()


class PurchaseInvoiceMultiBatchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="pharma@example.com", password="x", role="pharmacist"
        )
        self.supplier = Supplier.objects.create(company_name="Acme Pharma")
        self.medicine = Medicine.objects.create(
            name="Paracetamol 500mg",
            salt="Paracetamol",
            category=MedicineCategory.NRX,
            manufacturer="Generic Co",
            mrp=Decimal("20.00"),
            selling_price=Decimal("18.00"),
        )
        self.today = timezone.localdate()
        self.exp1 = self.today + timedelta(days=600)
        self.exp2 = self.today + timedelta(days=900)

    def _item(self, batch_number, expiry, qty, price="10.00"):
        return {
            "medicine_id": self.medicine.id,
            "category": "",
            "subcategory": "",
            "batch_number": batch_number,
            "expiry_date": expiry,
            "quantity": qty,
            "purchase_price": Decimal(price),
            "gst_percentage": Decimal("12.00"),
        }

    def test_same_medicine_two_batches_create_two_independent_records(self):
        """Scenario 1 & 3: same medicine, different batch (and expiry) → both
        stored as separate batches + line items, no overwrite."""
        invoice = services.process_purchase_invoice(
            data={
                "invoice_number": "INV-MB-1",
                "supplier_id": self.supplier.id,
                "order_date": self.today,
                "invoice_date": self.today,
                "delivery_date": None,
                "notes": "",
                "items": [
                    self._item("P001", self.exp1, 100),
                    self._item("P002", self.exp2, 150),
                ],
            },
            user=self.user,
        )

        self.assertEqual(invoice.items_count, 2)
        self.assertEqual(
            PurchaseInvoiceItem.objects.filter(purchase_invoice=invoice).count(), 2
        )

        batches = MedicineBatch.objects.filter(medicine=self.medicine).order_by(
            "batch_number"
        )
        self.assertEqual(batches.count(), 2)
        self.assertEqual(batches[0].batch_number, "P001")
        self.assertEqual(batches[0].quantity, 100)
        self.assertEqual(batches[0].expiry_date, self.exp1)
        self.assertEqual(batches[1].batch_number, "P002")
        self.assertEqual(batches[1].quantity, 150)
        self.assertEqual(batches[1].expiry_date, self.exp2)

        # Scenario 6: one stock-in ledger row per batch.
        self.assertEqual(
            StockMovement.objects.filter(medicine=self.medicine).count(), 2
        )

    def test_same_batch_repeated_across_invoices_accumulates_one_batch(self):
        """Scenario 2: same medicine + same batch number on a LATER invoice
        merges into the existing batch (qty accumulates) rather than creating a
        duplicate batch — the documented find-or-create behaviour."""
        services.process_purchase_invoice(
            data={
                "invoice_number": "INV-MB-2a",
                "supplier_id": self.supplier.id,
                "order_date": self.today,
                "invoice_date": self.today,
                "delivery_date": None,
                "notes": "",
                "items": [self._item("P001", self.exp1, 100)],
            },
            user=self.user,
        )
        services.process_purchase_invoice(
            data={
                "invoice_number": "INV-MB-2b",
                "supplier_id": self.supplier.id,
                "order_date": self.today,
                "invoice_date": self.today,
                "delivery_date": None,
                "notes": "",
                "items": [self._item("P001", self.exp1, 50)],
            },
            user=self.user,
        )

        batches = MedicineBatch.objects.filter(medicine=self.medicine)
        self.assertEqual(batches.count(), 1)
        self.assertEqual(batches.first().quantity, 150)
        # Two purchases against the one batch are still two ledger rows.
        self.assertEqual(
            StockMovement.objects.filter(medicine=self.medicine).count(), 2
        )

    def test_serializer_allows_same_medicine_different_batches(self):
        """Scenario 1 at the validation layer: two batches of one medicine in a
        single invoice payload are valid."""
        serializer = PurchaseInvoiceCreateSerializer(
            data={
                "invoice_number": "INV-MB-3",
                "supplier_id": str(self.supplier.id),
                "order_date": self.today.isoformat(),
                "invoice_date": self.today.isoformat(),
                "items": [
                    {
                        "medicine_id": str(self.medicine.id),
                        "batch_number": "P001",
                        "expiry_date": self.exp1.isoformat(),
                        "quantity": 100,
                        "purchase_price": "10.00",
                        "gst_percentage": "12.00",
                    },
                    {
                        "medicine_id": str(self.medicine.id),
                        "batch_number": "P002",
                        "expiry_date": self.exp2.isoformat(),
                        "quantity": 150,
                        "purchase_price": "10.00",
                        "gst_percentage": "12.00",
                    },
                ],
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_serializer_rejects_same_medicine_same_batch_twice(self):
        """Scenario 2 at the validation layer: the exact same (medicine, batch)
        listed twice in one payload is rejected."""
        serializer = PurchaseInvoiceCreateSerializer(
            data={
                "invoice_number": "INV-MB-4",
                "supplier_id": str(self.supplier.id),
                "order_date": self.today.isoformat(),
                "invoice_date": self.today.isoformat(),
                "items": [
                    {
                        "medicine_id": str(self.medicine.id),
                        "batch_number": "P001",
                        "expiry_date": self.exp1.isoformat(),
                        "quantity": 100,
                        "purchase_price": "10.00",
                        "gst_percentage": "12.00",
                    },
                    {
                        "medicine_id": str(self.medicine.id),
                        "batch_number": "P001",
                        "expiry_date": self.exp1.isoformat(),
                        "quantity": 50,
                        "purchase_price": "10.00",
                        "gst_percentage": "12.00",
                    },
                ],
            }
        )
        self.assertFalse(serializer.is_valid())


class DispensePayloadCompatibilityTests(TestCase):
    """The dispensing UI no longer collects dose pattern / number of days; it
    sends the neutral defaults (dose="-", days=1) the backend still requires.
    These tests lock in that the modified payload validates and that the line
    amount is purely qty × unit_price (dose/days never affect pricing)."""

    def _payload(self, *, dose="-", days=1):
        return {
            "session_id": "11111111-1111-1111-1111-111111111111",
            "line_items": [
                {
                    "medicine_id": "22222222-2222-2222-2222-222222222222",
                    "batch_number": "P001",
                    "dose": dose,
                    "days": days,
                    "qty": 15,
                    "unit_price": "2.00",
                }
            ],
            "payment": {
                "payment_method": "Cash",
                "discount": "0",
            },
        }

    def test_default_dose_and_days_payload_is_valid(self):
        serializer = DispenseCreateSerializer(data=self._payload())
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_blank_dose_is_rejected(self):
        """Documents WHY the frontend sends "-" rather than "": a blank dose
        fails the still-required CharField."""
        serializer = DispenseCreateSerializer(data=self._payload(dose=""))
        self.assertFalse(serializer.is_valid())
        self.assertIn("line_items", serializer.errors)

    def test_zero_days_is_rejected(self):
        """Documents WHY the frontend sends days=1: days has min_value=1."""
        serializer = DispenseCreateSerializer(data=self._payload(days=0))
        self.assertFalse(serializer.is_valid())


class MedicineBulkImportTests(TestCase):
    """Bulk CSV import: reuses MedicineWriteSerializer per row, skips
    duplicates on (name, category, bup_category), and supports partial
    success (valid rows commit even when siblings fail)."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="rx@example.com", password="x", role="pharmacist"
        )

    def _row(self, **over):
        base = {
            "row_number": 1,
            "name": "Amoxicillin 250",
            "salt": "Amoxicillin",
            "category": "Rx",
            "bup_category": None,
            "manufacturer": "Cipla",
            "reorder_level": 50,
            "tablets_per_strip": 10,
            "mrp": "30.00",
            "selling_price": "25.00",
        }
        base.update(over)
        return base

    def test_creates_multiple_valid_rows(self):
        result = services.bulk_create_medicines(
            rows=[
                self._row(row_number=1, name="Med A"),
                self._row(row_number=2, name="Med B"),
            ],
            user=self.user,
        )
        self.assertEqual(result["summary"]["created"], 2)
        self.assertEqual(result["summary"]["skipped"], 0)
        self.assertEqual(result["summary"]["failed"], 0)
        self.assertEqual(Medicine.objects.filter(is_active=True).count(), 2)

    def test_bulk_import_persists_row_level_supplier_ids(self):
        """Row-level supplier assignment in the import review grid persists via
        the same ``supplier_ids`` M2M as single-medicine creation."""
        s1 = Supplier.objects.create(company_name="Supplier One")
        s2 = Supplier.objects.create(company_name="Supplier Two")
        result = services.bulk_create_medicines(
            rows=[
                self._row(
                    row_number=1,
                    name="With Suppliers",
                    supplier_ids=[str(s1.id), str(s2.id)],
                ),
                self._row(row_number=2, name="No Suppliers"),
            ],
            user=self.user,
        )
        self.assertEqual(result["summary"]["created"], 2)
        med1 = Medicine.objects.get(name="With Suppliers")
        med2 = Medicine.objects.get(name="No Suppliers")
        self.assertEqual(
            set(med1.suppliers.values_list("id", flat=True)), {s1.id, s2.id}
        )
        self.assertEqual(med2.suppliers.count(), 0)

    def test_bulk_import_unknown_supplier_id_fails_only_that_row(self):
        """An invalid supplier UUID is a row-level validation error (partial
        success preserved), matching single-create behaviour."""
        result = services.bulk_create_medicines(
            rows=[
                self._row(row_number=1, name="Good Row"),
                self._row(
                    row_number=2,
                    name="Bad Supplier",
                    supplier_ids=["00000000-0000-0000-0000-000000000000"],
                ),
            ],
            user=self.user,
        )
        self.assertEqual(result["summary"]["created"], 1)
        self.assertEqual(result["summary"]["failed"], 1)
        self.assertTrue(Medicine.objects.filter(name="Good Row").exists())
        self.assertFalse(Medicine.objects.filter(name="Bad Supplier").exists())

    def test_skips_existing_active_duplicate(self):
        Medicine.objects.create(
            name="Med A",
            salt="x",
            category=MedicineCategory.RX,
            manufacturer="m",
            mrp=Decimal("10.00"),
            selling_price=Decimal("9.00"),
        )
        result = services.bulk_create_medicines(
            rows=[self._row(name="Med A")], user=self.user
        )
        self.assertEqual(result["summary"]["created"], 0)
        self.assertEqual(result["summary"]["skipped"], 1)
        self.assertEqual(Medicine.objects.filter(name="Med A").count(), 1)

    def test_in_file_duplicate_first_created_second_skipped(self):
        result = services.bulk_create_medicines(
            rows=[
                self._row(row_number=1, name="Dup"),
                self._row(row_number=2, name="Dup"),
            ],
            user=self.user,
        )
        self.assertEqual(result["summary"]["created"], 1)
        self.assertEqual(result["summary"]["skipped"], 1)

    def test_partial_success_valid_rows_commit_invalid_reported(self):
        result = services.bulk_create_medicines(
            rows=[
                self._row(row_number=1, name="Good"),
                # selling_price > mrp → fails MedicineWriteSerializer.validate
                self._row(row_number=2, name="Bad", selling_price="999.00"),
                # BUP without a strength → fails validate
                self._row(
                    row_number=3,
                    name="BupNoStrength",
                    category="BUP",
                    bup_category=None,
                ),
            ],
            user=self.user,
        )
        self.assertEqual(result["summary"]["created"], 1)
        self.assertEqual(result["summary"]["failed"], 2)
        self.assertTrue(
            Medicine.objects.filter(name="Good", is_active=True).exists()
        )
        self.assertFalse(Medicine.objects.filter(name="Bad").exists())
        failed_rows = {e["row_number"] for e in result["errors"]}
        self.assertEqual(failed_rows, {2, 3})


class MedicineCreateDuplicateTests(TestCase):
    """Single-create endpoint must surface a clean 409 (not an unhandled 500)
    when the conditional unique constraint (name, category, bup_category) is
    violated among active medicines — matching API_BLUEPRINT §7.4."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="rx@example.com", password="x", role="pharmacist"
        )
        self.client.force_authenticate(self.user)
        self.url = reverse("pharmacy-medicine-list-create")

    def _payload(self, **over):
        base = {
            "name": "Amoxicillin 250",
            "salt": "Amoxicillin",
            "category": "Rx",
            "bup_category": None,
            "manufacturer": "Cipla",
            "reorder_level": 50,
            "tablets_per_strip": 10,
            "mrp": "30.00",
            "selling_price": "25.00",
        }
        base.update(over)
        return base

    def test_create_succeeds_then_duplicate_returns_409(self):
        first = self.client.post(self.url, self._payload(), format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        dup = self.client.post(self.url, self._payload(), format="json")
        self.assertEqual(dup.status_code, status.HTTP_409_CONFLICT)
        # Only the original row persisted; the duplicate was rejected.
        self.assertEqual(
            Medicine.objects.filter(name="Amoxicillin 250").count(), 1
        )

    def test_same_name_different_category_is_allowed(self):
        """The unique key includes category, so the same name under a
        different category is NOT a duplicate."""
        self.assertEqual(
            self.client.post(
                self.url, self._payload(name="Combo"), format="json"
            ).status_code,
            status.HTTP_201_CREATED,
        )
        self.assertEqual(
            self.client.post(
                self.url,
                self._payload(name="Combo", category="NRx"),
                format="json",
            ).status_code,
            status.HTTP_201_CREATED,
        )


class DispenseFinancialTests(TestCase):
    """Consultation fee + partial payment + patient ledger (outstanding &
    recovery) across the dispense workflow."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="rx@example.com", password="x", role="pharmacist"
        )
        self.patient = Patient.objects.create(
            patient_category="deaddiction",
            full_name="Ledger Patient",
            date_of_birth=timezone.localdate().replace(year=1990, month=1, day=1),
            sex="male",
            phone_number="9999999999",
            address_line1="Somewhere",
        )
        self.medicine = Medicine.objects.create(
            name="Paracetamol 500mg",
            salt="Paracetamol",
            category=MedicineCategory.NRX,
            manufacturer="Cipla",
            mrp=Decimal("60.00"),
            selling_price=Decimal("50.00"),
        )
        self.batch = MedicineBatch.objects.create(
            medicine=self.medicine,
            batch_number="P001",
            expiry_date=timezone.localdate() + timedelta(days=400),
            quantity=200,
            initial_quantity=200,
            purchase_price=Decimal("30.00"),
        )
        BillingSettings.load()  # default fee 0 unless a test sets it

    def _session(self):
        return VisitSession.objects.create(
            visit_uid=VisitSession.generate_visit_uid(),
            patient=self.patient,
            checked_in_by=self.user,
            current_stage=VisitStage.PHARMACY,
            status=VisitStatus.IN_PROGRESS,
        )

    def _dispense(self, *, qty, unit_price, cash=0, online=0, method="Cash",
                  consultation_fee=None, discount="0"):
        data = {
            "session_id": self._session().id,
            "line_items": [
                {
                    "medicine_id": self.medicine.id,
                    "batch_number": "P001",
                    "dose": "-",
                    "days": 1,
                    "qty": qty,
                    "unit_price": Decimal(unit_price),
                }
            ],
            "payment": {
                "payment_method": method,
                "cash_amount": Decimal(cash),
                "online_amount": Decimal(online),
                "discount": Decimal(discount),
                "notes": "",
            },
        }
        if consultation_fee is not None:
            data["consultation_fee"] = Decimal(consultation_fee)
        return services.process_dispense(data=data, user=self.user)

    def _balance(self):
        return PatientLedgerEntry.balance_for(self.patient.id)

    def test_full_payment_with_consultation_fee_zero_outstanding(self):
        billing_settings = BillingSettings.load()
        billing_settings.default_consultation_fee = Decimal("200.00")
        billing_settings.save()

        inv = self._dispense(qty=10, unit_price="50.00", cash="700.00")
        self.assertEqual(inv.subtotal, Decimal("500.00"))
        self.assertEqual(inv.consultation_fee, Decimal("200.00"))
        self.assertEqual(inv.net_payable, Decimal("700.00"))
        self.assertEqual(inv.amount_paid, Decimal("700.00"))
        self.assertEqual(inv.invoice_outstanding, Decimal("0.00"))
        self.assertEqual(self._balance(), Decimal("0.00"))

    def test_partial_payment_creates_outstanding(self):
        inv = self._dispense(
            qty=10, unit_price="50.00", cash="400.00", consultation_fee="200.00"
        )
        self.assertEqual(inv.net_payable, Decimal("700.00"))
        self.assertEqual(inv.amount_paid, Decimal("400.00"))
        self.assertEqual(inv.invoice_outstanding, Decimal("300.00"))
        self.assertEqual(self._balance(), Decimal("300.00"))
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.outstanding_debt, Decimal("300.00"))

    def test_recovery_of_previous_due_in_next_invoice(self):
        # First visit leaves ₹300 outstanding.
        self._dispense(
            qty=10, unit_price="50.00", cash="400.00", consultation_fee="200.00"
        )
        self.assertEqual(self._balance(), Decimal("300.00"))

        # Second visit: new invoice ₹300, patient pays ₹600 (current + prior).
        inv2 = self._dispense(
            qty=6, unit_price="50.00", cash="600.00", consultation_fee="0"
        )
        self.assertEqual(inv2.net_payable, Decimal("300.00"))
        self.assertEqual(inv2.amount_paid, Decimal("600.00"))
        # 300 prior + 300 new − 600 paid = 0
        self.assertEqual(self._balance(), Decimal("0.00"))

    def test_overpayment_beyond_total_payable_rejected(self):
        from rest_framework import serializers as drf_serializers

        with self.assertRaises(drf_serializers.ValidationError):
            self._dispense(
                qty=6, unit_price="50.00", cash="500.00", consultation_fee="0"
            )  # net 300, no prior due, paying 500 > 300

    def test_split_partial_payment(self):
        inv = self._dispense(
            qty=20,
            unit_price="50.00",
            method="Split",
            cash="200.00",
            online="300.00",
            consultation_fee="0",
        )
        self.assertEqual(inv.net_payable, Decimal("1000.00"))
        self.assertEqual(inv.amount_paid, Decimal("500.00"))
        self.assertEqual(inv.cash_amount, Decimal("200.00"))
        self.assertEqual(inv.online_amount, Decimal("300.00"))
        self.assertEqual(self._balance(), Decimal("500.00"))

    def test_cancel_reverses_ledger(self):
        inv = self._dispense(
            qty=10, unit_price="50.00", cash="400.00", consultation_fee="200.00"
        )
        self.assertEqual(self._balance(), Decimal("300.00"))

        services.cancel_dispense_for_session(
            session_id=inv.visit_session_id, reason="patient left", user=self.user
        )
        inv.refresh_from_db()
        self.assertEqual(inv.net_payable, Decimal("0.00"))
        self.assertEqual(inv.amount_paid, Decimal("0.00"))
        # Ledger nets back to zero (charge + payment + reversal adjustment).
        self.assertEqual(self._balance(), Decimal("0.00"))
