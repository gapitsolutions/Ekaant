from django.db import migrations, models

import visits.models


class Migration(migrations.Migration):

    dependencies = [
        ("visits", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="visitsession",
            name="verification_method",
            field=models.CharField(
                choices=[("fingerprint", "Fingerprint"), ("photo", "Photo")],
                default="fingerprint",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="visitsession",
            name="verification_photo",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to=visits.models.visit_verification_photo_upload_path,
            ),
        ),
        migrations.AddField(
            model_name="visitsession",
            name="verification_photo_captured_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
