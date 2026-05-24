"""Wave 1, Task 5: improve Django admin display names for pharmacy models.

Only Meta options change here — there is no schema impact. The new
``verbose_name`` / ``verbose_name_plural`` strings replace the auto-pluralised
defaults (``"all stock movements"``, ``"all invoice items"``) that read poorly
in the admin sidebar.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0001_initial"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="medicine",
            options={
                "ordering": ["name"],
                "verbose_name": "Medicine",
                "verbose_name_plural": "Medicines",
            },
        ),
        migrations.AlterModelOptions(
            name="medicinebatch",
            options={
                "ordering": ["expiry_date"],
                "verbose_name": "Medicine Batch",
                "verbose_name_plural": "Medicine Batches",
            },
        ),
        migrations.AlterModelOptions(
            name="purchaseinvoice",
            options={
                "ordering": ["-created_at"],
                "verbose_name": "Purchase Invoice",
                "verbose_name_plural": "Purchase Invoices",
            },
        ),
        migrations.AlterModelOptions(
            name="purchaseinvoiceitem",
            options={
                "verbose_name": "Purchase Invoice Line Item",
                "verbose_name_plural": "Purchase Invoice Line Items",
            },
        ),
        migrations.AlterModelOptions(
            name="dispenseinvoice",
            options={
                "ordering": ["-dispense_time"],
                "verbose_name": "Dispense Invoice",
                "verbose_name_plural": "Dispense Invoices",
            },
        ),
        migrations.AlterModelOptions(
            name="dispenseinvoiceitem",
            options={
                "verbose_name": "Dispense Invoice Line Item",
                "verbose_name_plural": "Dispense Invoice Line Items",
            },
        ),
        migrations.AlterModelOptions(
            name="stockauditremoval",
            options={
                "ordering": ["-removed_at"],
                "verbose_name": "Stock Audit Removal",
                "verbose_name_plural": "Stock Audit Removals",
            },
        ),
        migrations.AlterModelOptions(
            name="stockmovement",
            options={
                "ordering": ["-performed_at"],
                "verbose_name": "Stock Movement (Ledger Entry)",
                "verbose_name_plural": "Stock Movements (Ledger)",
            },
        ),
    ]
