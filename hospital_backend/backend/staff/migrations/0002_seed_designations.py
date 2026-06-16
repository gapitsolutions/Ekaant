"""Seed the base designation set. New titles can be added later via the API
(get-or-create on staff save), but these ship out of the box so the picker is
never empty."""

from django.db import migrations

BASE_DESIGNATIONS = [
    "Physician",
    "Nurse",
    "Manager",
    "Psychiatrist",
    "Counsellor",
    "Doctor",
]


def seed(apps, schema_editor):
    Designation = apps.get_model("staff", "Designation")
    for name in BASE_DESIGNATIONS:
        if not Designation.objects.filter(name__iexact=name).exists():
            Designation.objects.create(name=name)


def unseed(apps, schema_editor):
    Designation = apps.get_model("staff", "Designation")
    Designation.objects.filter(name__in=BASE_DESIGNATIONS).delete()


class Migration(migrations.Migration):
    dependencies = [("staff", "0001_initial")]
    operations = [migrations.RunPython(seed, unseed)]
