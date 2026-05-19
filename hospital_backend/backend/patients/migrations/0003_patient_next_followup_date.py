from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("patients", "0002_replace_photo_url_with_photo_field"),
    ]

    operations = [
        migrations.AddField(
            model_name="patient",
            name="next_followup_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="patient",
            index=models.Index(fields=["next_followup_date"], name="patients_pat_next_fo_9f6674_idx"),
        ),
    ]
