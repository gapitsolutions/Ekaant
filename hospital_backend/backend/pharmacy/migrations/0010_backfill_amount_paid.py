"""Backfill ``amount_paid`` for invoices that predate partial-payment support.

Before this feature the system assumed paid == billed, so every historical
SUCCESS invoice was fully settled. Set ``amount_paid = net_payable`` for those
rows so reporting (collected vs billed) and per-invoice outstanding stay
correct for existing data. Cancelled invoices have net_payable = 0, so their
default amount_paid = 0 is already consistent — no ledger rows are created for
history (those patients owe nothing; balance stays 0).
"""

from django.db import migrations
from django.db.models import F


def backfill_amount_paid(apps, schema_editor):
    DispenseInvoice = apps.get_model("pharmacy", "DispenseInvoice")
    DispenseInvoice.objects.filter(status="success").update(
        amount_paid=F("net_payable")
    )


def noop_reverse(apps, schema_editor):
    # Irreversible data backfill; leave values in place on rollback.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0009_dispenseinvoice_amount_paid_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_amount_paid, noop_reverse),
    ]
