"""Wave 2, Task 4: rename Patient.registration_number → Patient.file_number.

The Patient primary key remains UUID. Only the human-facing business
identifier is renamed (and given an explicit format validator). All
existing values (currently ``AGH<yy><mm><dd><nnn>`` format) already
match the new ``^[A-Za-z0-9-]+$`` regex, so no data transformation is
required — the column is renamed in place. ``Patient.id`` is still the
UUID PK; every related model references it by UUID, not by the business
identifier, so no FK churn is needed.

The model also gains a ``latest_file_number`` classmethod, which is a
pure-Python helper not represented in migration state.
"""

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0004_rename_patients_pat_next_fo_9f6674_idx_patients_pa_next_fo_ee0511_idx"),
    ]

    operations = [
        migrations.RenameField(
            model_name="patient",
            old_name="registration_number",
            new_name="file_number",
        ),
        migrations.AlterField(
            model_name="patient",
            name="file_number",
            field=models.CharField(
                max_length=32,
                unique=True,
                validators=[
                    django.core.validators.RegexValidator(
                        regex=r"^[A-Za-z0-9-]+$",
                        message="File number may only contain letters, digits and hyphens.",
                    )
                ],
            ),
        ),
        migrations.AlterModelOptions(
            name="patient",
            options={"ordering": ["file_number"]},
        ),
    ]
