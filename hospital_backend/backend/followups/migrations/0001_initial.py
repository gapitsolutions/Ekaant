import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("patients", "0003_patient_next_followup_date"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="FollowUpTicket",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("cycle_number", models.PositiveIntegerField()),
                ("follow_up_date", models.DateField()),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Pending"), ("completed", "Completed"), ("successful", "Successful")],
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("pending_since", models.DateField(default=django.utils.timezone.localdate)),
                (
                    "last_call_result",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("confirmed", "Confirmed"),
                            ("busy_later", "Busy / Call Back Later"),
                            ("wrong_number", "Wrong Number"),
                            ("not_reachable", "Not Reachable / Switched Off"),
                            ("other", "Other"),
                        ],
                        max_length=32,
                        null=True,
                    ),
                ),
                ("last_call_note", models.TextField(blank=True, null=True)),
                ("last_called_at", models.DateTimeField(blank=True, null=True)),
                ("next_call_date", models.DateField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("successful_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="followup_tickets",
                        to="patients.patient",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["patient", "status"], name="followups_fo_patient_0f98d1_idx"),
                    models.Index(fields=["follow_up_date", "status"], name="followups_fo_follow__b14557_idx"),
                    models.Index(fields=["next_call_date", "status"], name="followups_fo_next_ca_49ca95_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=("patient", "cycle_number"), name="unique_followup_cycle_per_patient")
                ],
            },
        ),
        migrations.CreateModel(
            name="FollowUpCallAttempt",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "result",
                    models.CharField(
                        choices=[
                            ("confirmed", "Confirmed"),
                            ("busy_later", "Busy / Call Back Later"),
                            ("wrong_number", "Wrong Number"),
                            ("not_reachable", "Not Reachable / Switched Off"),
                            ("other", "Other"),
                        ],
                        max_length=32,
                    ),
                ),
                ("note", models.TextField()),
                ("next_call_date", models.DateField(blank=True, null=True)),
                ("called_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "called_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="followup_call_attempts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "ticket",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attempts",
                        to="followups.followupticket",
                    ),
                ),
            ],
            options={
                "ordering": ["-called_at", "-created_at"],
                "indexes": [models.Index(fields=["ticket", "called_at"], name="followups_fo_ticket__54e9ec_idx")],
            },
        ),
    ]
