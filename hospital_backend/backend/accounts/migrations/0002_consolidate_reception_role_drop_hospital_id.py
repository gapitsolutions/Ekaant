"""Wave 1 migrations:

- Task 1: Consolidate duplicate reception roles. Existing users with
  ``role='receptionist'`` are migrated to ``role='reception'`` and the
  ``receptionist`` choice is removed from the enum.
- Task 2: Remove the unused ``hospital_id`` field from the User model.
"""

from django.db import migrations, models


def consolidate_reception_role(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="receptionist").update(role="reception")


def split_reception_role(apps, schema_editor):
    # Reverse migration is intentionally a no-op: once consolidated we cannot
    # distinguish which rows were originally ``receptionist``. The schema
    # rollback below restores the choice, but data is left untouched.
    return None


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            consolidate_reception_role,
            reverse_code=split_reception_role,
        ),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Admin"),
                    ("reception", "Reception"),
                    ("counsellor", "Counsellor"),
                    ("doctor", "Doctor"),
                    ("pharmacist", "Pharmacist"),
                ],
                default="reception",
                max_length=32,
            ),
        ),
        migrations.RemoveField(
            model_name="user",
            name="hospital_id",
        ),
    ]
