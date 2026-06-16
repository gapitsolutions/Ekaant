"""Backfill supplier accounts-payable ledger for pre-existing invoices.

The supplier payables ledger (``SupplierLedgerEntry``) was introduced after
purchase invoices already existed, so historical invoices were never posted as
``invoice`` ledger entries. This made the supplier console's Ledger tab show
nothing under the "invoice" filter even though Invoice History (read straight
from ``PurchaseInvoice``) listed them.

This data migration posts one ``invoice`` ledger entry for every
``PurchaseInvoice`` that doesn't already have one, mirroring
``services.post_invoice_payable`` (amount = invoice total, note = invoice
number, links the invoice). Entries are created oldest-first and their
``created_at`` is aligned to the invoice's own ``created_at`` so the running
balance reconstructs in the correct chronological order. Finally each affected
supplier's cached ``outstanding_payable`` is recomputed from SUM(amount).

Idempotent: invoices that already have an ``invoice`` ledger entry are skipped,
so re-running is a no-op.
"""

from decimal import Decimal

from django.db import migrations
from django.db.models import Sum


def backfill_invoice_ledger(apps, schema_editor):
    PurchaseInvoice = apps.get_model("pharmacy", "PurchaseInvoice")
    SupplierLedgerEntry = apps.get_model("pharmacy", "SupplierLedgerEntry")
    Supplier = apps.get_model("pharmacy", "Supplier")

    already_posted = set(
        SupplierLedgerEntry.objects.filter(
            entry_type="invoice", purchase_invoice__isnull=False
        ).values_list("purchase_invoice_id", flat=True)
    )

    invoices = (
        PurchaseInvoice.objects.exclude(id__in=already_posted)
        .order_by("created_at", "id")
    )

    affected_suppliers = set()
    for invoice in invoices:
        if invoice.supplier_id is None:
            continue
        entry = SupplierLedgerEntry.objects.create(
            supplier_id=invoice.supplier_id,
            entry_type="invoice",
            amount=invoice.total_amount or Decimal("0"),
            purchase_invoice=invoice,
            note=f"Purchase invoice {invoice.invoice_number}",
        )
        # ``created_at`` is auto_now_add, so it ignored our value on insert.
        # Align it to the invoice's timestamp via a queryset update (which
        # bypasses auto_now_add) to keep the ledger's running balance ordered.
        SupplierLedgerEntry.objects.filter(pk=entry.pk).update(
            created_at=invoice.created_at
        )
        affected_suppliers.add(invoice.supplier_id)

    # Recompute the cached payable for every supplier that gained entries.
    for supplier_id in affected_suppliers:
        total = (
            SupplierLedgerEntry.objects.filter(supplier_id=supplier_id).aggregate(
                balance=Sum("amount")
            )["balance"]
            or Decimal("0")
        )
        Supplier.objects.filter(id=supplier_id).update(outstanding_payable=total)


def noop_reverse(apps, schema_editor):
    # No safe automatic reversal — the backfilled entries are indistinguishable
    # from organically-posted ones once created. Leave them in place.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0012_supplier_outstanding_payable_supplierledgerentry"),
    ]

    operations = [
        migrations.RunPython(backfill_invoice_ledger, noop_reverse),
    ]
