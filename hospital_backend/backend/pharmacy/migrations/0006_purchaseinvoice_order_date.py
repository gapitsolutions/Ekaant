from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("pharmacy", "0005_rename_pharmacy_pu_supplie_fk_idx_pharmacy_pu_supplie_a3bbcf_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseinvoice",
            name="order_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="purchaseinvoice",
            index=models.Index(fields=["order_date"], name="pharmacy_pu_order_d_676466_idx"),
        ),
    ]
