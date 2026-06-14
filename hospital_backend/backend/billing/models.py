"""Billing domain: hospital-wide billing configuration + an append-only
patient financial ledger.

Design notes
------------
* ``BillingSettings`` is a **singleton** (always pk=1) holding hospital-wide
  billing config — currently just the default consultation fee. Stored in the
  DB (not hardcoded) so admins can change it without a deploy. Invoices
  **snapshot** the fee at creation time, so changing this default never
  rewrites historical invoices.

* ``PatientLedgerEntry`` is an **append-only, transaction-based ledger** — the
  single source of truth for a patient's outstanding balance. We deliberately
  do NOT maintain a hand-edited running balance (the old, never-updated
  ``Patient.outstanding_debt`` field is now treated as a *cache* recomputed
  from this ledger). Every financial event is one signed row:

      +amount  → increases what the patient owes   (``charge``)
      -amount  → decreases what the patient owes    (``payment`` / recovery)
       signed  → corrections / reversals            (``adjustment``)

  A patient's current outstanding = ``SUM(amount)`` over their entries. This
  gives full auditability (invoice charged, amount paid, due created, due
  recovered) and clean reversal on cancel/amend (post a compensating row
  rather than mutating history).
"""

import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Sum
from django.db.models.functions import Coalesce


class BillingSettings(models.Model):
    """Hospital-wide billing configuration (singleton, pk=1)."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    default_consultation_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0")
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="billing_settings_updates",
        blank=True,
        null=True,
    )

    class Meta:
        verbose_name = "Billing Settings"
        verbose_name_plural = "Billing Settings"

    def __str__(self):
        return f"Billing Settings (consultation fee ₹{self.default_consultation_fee})"

    def save(self, *args, **kwargs):
        # Enforce the singleton: there is only ever one row, pk=1.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "BillingSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class LedgerEntryType(models.TextChoices):
    CHARGE = "charge", "Charge (invoice billed)"
    PAYMENT = "payment", "Payment / Recovery"
    ADJUSTMENT = "adjustment", "Adjustment / Reversal"


class PatientLedgerEntry(models.Model):
    """One signed financial movement on a patient's account (append-only)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="ledger_entries",
    )
    entry_type = models.CharField(max_length=16, choices=LedgerEntryType.choices)
    # Signed: +increases outstanding (charge), -decreases (payment/recovery).
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    # Optional link to the dispense invoice that produced this entry. SET_NULL
    # so the ledger (financial history) survives even if an invoice row is
    # ever removed; the amount stays on the patient's balance regardless.
    dispense_invoice = models.ForeignKey(
        "pharmacy.DispenseInvoice",
        on_delete=models.SET_NULL,
        related_name="ledger_entries",
        blank=True,
        null=True,
    )
    description = models.CharField(max_length=255, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="ledger_entries_created",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Patient Ledger Entry"
        verbose_name_plural = "Patient Ledger Entries"
        indexes = [
            models.Index(fields=["patient", "-created_at"]),
            models.Index(fields=["dispense_invoice"]),
            models.Index(fields=["entry_type"]),
        ]

    def __str__(self):
        return f"{self.patient_id} {self.entry_type} {self.amount}"

    @staticmethod
    def balance_for(patient_id) -> Decimal:
        """Current outstanding for a patient = sum of all ledger entries.

        Positive ⇒ patient owes money; 0 ⇒ settled; negative ⇒ credit
        (only possible if overpayment is ever permitted)."""
        agg = PatientLedgerEntry.objects.filter(patient_id=patient_id).aggregate(
            total=Coalesce(Sum("amount"), Decimal("0"))
        )
        return agg["total"] or Decimal("0")
