"""Backfill the Medicine.suppliers M2M from existing purchase invoices.

``services.process_purchase_invoice`` only started calling
``medicine.suppliers.add(supplier)`` after the supplier-console work, so
medicines first stocked by earlier invoices were never linked to the supplier
that supplied them. This data migration reconstructs those links from the
authoritative record — every ``PurchaseInvoiceItem`` ties a medicine to an
invoice, and the invoice carries the supplier.

For every (medicine, invoice-supplier) pair found in the line items, the
corresponding row is added to the M2M through table if missing. Idempotent:
existing links are skipped (and ``ignore_conflicts`` guards the unique pair),
so re-running is a no-op and it never duplicates a link.
"""

from django.db import migrations


def backfill_medicine_suppliers(apps, schema_editor):
    Medicine = apps.get_model("pharmacy", "Medicine")
    PurchaseInvoiceItem = apps.get_model("pharmacy", "PurchaseInvoiceItem")
    Through = Medicine.suppliers.through

    # Desired (medicine, supplier) pairs from every invoice line item that has
    # both a medicine and a supplier on its parent invoice.
    desired = {
        (med_id, sup_id)
        for med_id, sup_id in PurchaseInvoiceItem.objects.filter(
            medicine__isnull=False, purchase_invoice__supplier__isnull=False
        ).values_list("medicine_id", "purchase_invoice__supplier_id")
        if med_id and sup_id
    }
    if not desired:
        return

    existing = set(Through.objects.values_list("medicine_id", "supplier_id"))
    to_create = [
        Through(medicine_id=med_id, supplier_id=sup_id)
        for (med_id, sup_id) in desired
        if (med_id, sup_id) not in existing
    ]
    if to_create:
        Through.objects.bulk_create(to_create, ignore_conflicts=True)


def noop_reverse(apps, schema_editor):
    # Backfilled links are indistinguishable from organically-created ones,
    # so there is no safe automatic reversal — leave them in place.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0014_supplierledgerentry_payment_date"),
    ]

    operations = [
        migrations.RunPython(backfill_medicine_suppliers, noop_reverse),
    ]
