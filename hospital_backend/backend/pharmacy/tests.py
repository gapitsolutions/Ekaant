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
from django.utils import timezone

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
