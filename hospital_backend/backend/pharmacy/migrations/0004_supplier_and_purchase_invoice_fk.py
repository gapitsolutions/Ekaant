"""Wave 3, Task 6: introduce the Supplier entity and convert
PurchaseInvoice.supplier from free-text CharField to a FK.

Data migration strategy
-----------------------
1. Create the ``Supplier`` table with its unique constraint + GIN index.
2. Add a nullable ``supplier_new`` FK column on PurchaseInvoice so the
   text and FK columns coexist during the swap.
3. RunPython:
   - upsert one Supplier row per distinct ``PurchaseInvoice.supplier``
     text value, case-insensitively (the model-level unique constraint
     is case-insensitive over ``Lower(company_name)``);
   - also upsert one Supplier row per name in the previously hardcoded
     frontend supplier list, so the dropdown starts populated even if
     none of those vendors have a purchase invoice yet;
   - backfill ``supplier_new_id`` on every existing PurchaseInvoice from
     its text value.
4. Drop the old text ``supplier`` column.
5. Rename ``supplier_new`` → ``supplier`` (Django updates the underlying
   ``supplier_new_id`` column to ``supplier_id``).
6. Tighten the FK to NOT NULL.

Notes:
* Seeded suppliers (whether from existing invoices or from the
  hardcoded list) carry NULL mobile_number / address / etc. The serializer
  requires mobile_number for new entries, but the column is intentionally
  nullable so this seed step doesn't have to invent fake mobile numbers.
* The FK uses ``on_delete=PROTECT`` so accidentally deleting a supplier
  with invoices is rejected by the DB. Soft-delete is via
  ``Supplier.is_active = False`` instead.
"""

import django.contrib.postgres.fields
import django.contrib.postgres.indexes
import django.db.models.deletion
import django.db.models.functions.text
import uuid

from django.conf import settings
from django.db import migrations, models


HARDCODED_SEED_SUPPLIERS = [
    "Abbott Healthcare Ltd",
    "Cipla Ltd",
    "Sun Pharmaceutical Industries Ltd",
    "Zydus Lifesciences Ltd",
    "Lupin Ltd",
    "Pfizer Ltd",
    "GlaxoSmithKline Pharmaceuticals",
    "Alkem Laboratories Ltd",
    "Sanofi India Ltd",
    "Quantumcure Lifesciences Wholesale",
]


def migrate_supplier_text_to_fk(apps, schema_editor):
    Supplier = apps.get_model("pharmacy", "Supplier")
    PurchaseInvoice = apps.get_model("pharmacy", "PurchaseInvoice")

    # 1. Collect every supplier name that needs a row:
    #    - distinct, non-empty supplier text on existing invoices,
    #    - plus the hardcoded seed list for dropdown continuity.
    existing_names = (
        PurchaseInvoice.objects.exclude(supplier__isnull=True)
        .exclude(supplier__exact="")
        .values_list("supplier", flat=True)
        .distinct()
    )
    all_names = []
    seen_keys: set[str] = set()
    for name in list(existing_names) + list(HARDCODED_SEED_SUPPLIERS):
        cleaned = (name or "").strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen_keys:
            continue
        seen_keys.add(key)
        all_names.append(cleaned)

    # 2. Cache existing Supplier rows by lowercased name so we don't violate
    #    the case-insensitive unique constraint.
    by_key: dict[str, object] = {
        s.company_name.lower(): s
        for s in Supplier.objects.all().only("id", "company_name")
    }

    # 3. Upsert.
    for name in all_names:
        key = name.lower()
        if key in by_key:
            continue
        by_key[key] = Supplier.objects.create(company_name=name)

    # 4. Backfill the FK on every invoice. Empty / NULL supplier values stay
    #    NULL temporarily; if any are still NULL at the end the AlterField
    #    making the FK non-nullable will fail loudly, which is the right
    #    behaviour for unreconcilable legacy data.
    for invoice in PurchaseInvoice.objects.all().only("id", "supplier", "supplier_new_id"):
        cleaned = (invoice.supplier or "").strip()
        if not cleaned:
            continue
        supplier = by_key.get(cleaned.lower())
        if supplier is None:
            # Shouldn't happen — we just upserted every distinct value.
            continue
        invoice.supplier_new_id = supplier.id
        invoice.save(update_fields=["supplier_new"])


def reverse_supplier_fk_to_text(apps, schema_editor):
    # Best-effort reverse: copy supplier.company_name back onto the text
    # column (only meaningful if the schema operations are reversed in the
    # same migration run, which Django handles).
    PurchaseInvoice = apps.get_model("pharmacy", "PurchaseInvoice")
    for invoice in PurchaseInvoice.objects.select_related("supplier_new").all():
        if invoice.supplier_new_id is None:
            continue
        invoice.supplier = invoice.supplier_new.company_name
        invoice.save(update_fields=["supplier"])


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0003_drop_display_invoice_number"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Create the Supplier table.
        migrations.CreateModel(
            name="Supplier",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("company_name", models.CharField(max_length=255)),
                ("contact_person", models.CharField(blank=True, default="", max_length=255)),
                ("mobile_number", models.CharField(blank=True, max_length=20, null=True)),
                ("email", models.EmailField(blank=True, max_length=254, null=True)),
                ("full_address", models.TextField(blank=True, default="")),
                ("gst_number", models.CharField(blank=True, max_length=20, null=True)),
                ("drug_license_number", models.CharField(blank=True, max_length=50, null=True)),
                (
                    "categories",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.CharField(
                            choices=[
                                ("BUP", "BUP (Controlled Substance)"),
                                ("Rx", "Rx (Prescription Only)"),
                                ("NRx", "NRx (Non-Prescription / General)"),
                            ],
                            max_length=10,
                        ),
                        blank=True,
                        default=list,
                        size=None,
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="suppliers_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="suppliers_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["company_name"],
                "verbose_name": "Supplier",
                "verbose_name_plural": "Suppliers",
            },
        ),
        migrations.AddConstraint(
            model_name="supplier",
            constraint=models.UniqueConstraint(
                django.db.models.functions.text.Lower("company_name"),
                name="pharmacy_supplier_company_name_ci_unique",
            ),
        ),
        migrations.AddIndex(
            model_name="supplier",
            index=models.Index(fields=["is_active"], name="pharmacy_su_is_acti_idx"),
        ),
        migrations.AddIndex(
            model_name="supplier",
            index=models.Index(fields=["company_name"], name="pharmacy_su_company_idx"),
        ),
        migrations.AddIndex(
            model_name="supplier",
            index=django.contrib.postgres.indexes.GinIndex(
                fields=["categories"], name="pharmacy_supplier_categories"
            ),
        ),

        # 2. Add nullable FK column alongside the existing text column.
        migrations.AddField(
            model_name="purchaseinvoice",
            name="supplier_new",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="purchase_invoices",
                to="pharmacy.supplier",
            ),
        ),

        # 3. Backfill.
        migrations.RunPython(
            migrate_supplier_text_to_fk,
            reverse_code=reverse_supplier_fk_to_text,
        ),

        # 4. Drop the index on the old text column, then drop the column.
        migrations.RemoveIndex(
            model_name="purchaseinvoice",
            name="pharmacy_pu_supplie_4db8d5_idx",
        ),
        migrations.RemoveField(
            model_name="purchaseinvoice",
            name="supplier",
        ),

        # 5. Rename FK column to the canonical "supplier" name.
        migrations.RenameField(
            model_name="purchaseinvoice",
            old_name="supplier_new",
            new_name="supplier",
        ),

        # 6. Tighten to NOT NULL now that every row has a value.
        migrations.AlterField(
            model_name="purchaseinvoice",
            name="supplier",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="purchase_invoices",
                to="pharmacy.supplier",
            ),
        ),
        # Re-add the index on the new FK column so we don't lose the
        # supplier-grouped queries the original model expressed.
        migrations.AddIndex(
            model_name="purchaseinvoice",
            index=models.Index(fields=["supplier"], name="pharmacy_pu_supplie_fk_idx"),
        ),
    ]
