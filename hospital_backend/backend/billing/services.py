"""Billing services: the single place that writes to the patient ledger and
keeps the cached ``Patient.outstanding_debt`` in sync with it.

Pharmacy (and any future biller) call these helpers rather than touching the
ledger directly, so the balance stays consistent and auditable.
"""

from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import Coalesce

from patients.models import Patient

from .models import BillingSettings, LedgerEntryType, PatientLedgerEntry


def get_default_consultation_fee() -> Decimal:
    return BillingSettings.load().default_consultation_fee


def current_outstanding(patient_id) -> Decimal:
    """Patient's current signed balance from the ledger (>0 ⇒ owes)."""
    return PatientLedgerEntry.balance_for(patient_id)


def sync_patient_outstanding_cache(patient_id) -> Decimal:
    """Recompute ``Patient.outstanding_debt`` from the ledger (never increment
    it by hand). Returns the true signed balance."""
    balance = PatientLedgerEntry.balance_for(patient_id)
    # The cache only surfaces money owed; credit (negative) clamps to 0 for
    # display purposes while the ledger retains the true signed balance.
    Patient.objects.filter(id=patient_id).update(
        outstanding_debt=balance if balance > 0 else Decimal("0")
    )
    return balance


def record_entry(
    *, patient_id, entry_type, amount: Decimal, invoice=None, description="", user=None
):
    """Append one signed ledger row. No-op for a zero amount."""
    if amount == 0:
        return None
    return PatientLedgerEntry.objects.create(
        patient_id=patient_id,
        entry_type=entry_type,
        amount=amount,
        dispense_invoice=invoice,
        description=description,
        created_by=user,
    )


def post_invoice_charge_and_payment(*, invoice, amount_paid: Decimal, user):
    """Record an invoice's charge (+net_payable) and the amount tendered
    (-amount_paid) as ledger rows, then refresh the patient's cached balance.

    The payment can exceed this invoice's own net_payable — that simply means
    the patient also paid down previously outstanding dues in the same
    settlement (recovery), which the ledger captures naturally."""
    record_entry(
        patient_id=invoice.patient_id,
        entry_type=LedgerEntryType.CHARGE,
        amount=invoice.net_payable,
        invoice=invoice,
        description=f"Invoice {invoice.invoice_number} billed",
        user=user,
    )
    if amount_paid and amount_paid > 0:
        record_entry(
            patient_id=invoice.patient_id,
            entry_type=LedgerEntryType.PAYMENT,
            amount=-amount_paid,
            invoice=invoice,
            description=f"Payment against {invoice.invoice_number}",
            user=user,
        )
    return sync_patient_outstanding_cache(invoice.patient_id)


def reverse_invoice_entries(*, invoice, user, reason=""):
    """Post a single compensating ``adjustment`` row that nets this invoice's
    entire prior ledger impact (charge + payment + earlier adjustments) back to
    zero. Append-only — history is never deleted. Idempotent across repeated
    cancels/amends because it re-reads the current net each time."""
    net_all = PatientLedgerEntry.objects.filter(
        dispense_invoice=invoice
    ).aggregate(total=Coalesce(Sum("amount"), Decimal("0")))["total"] or Decimal("0")
    if net_all != 0:
        record_entry(
            patient_id=invoice.patient_id,
            entry_type=LedgerEntryType.ADJUSTMENT,
            amount=-net_all,
            invoice=invoice,
            description=reason or f"Reversal of {invoice.invoice_number}",
            user=user,
        )
    return sync_patient_outstanding_cache(invoice.patient_id)
