from django.db import migrations, models

import patients.models


class Migration(migrations.Migration):
    dependencies = [
        ("patients", "0001_initial"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="patient",
            name="photo_url",
        ),
        migrations.AddField(
            model_name="patient",
            name="photo",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to=patients.models.patient_photo_upload_path,
            ),
        ),
    ]
