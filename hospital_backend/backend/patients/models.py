import uuid

from django.core.validators import RegexValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


# Human-entered patient identifier. Free-form but URL-safe: letters,
# digits, hyphens only. Length capped to keep generated URLs sensible.
FILE_NUMBER_VALIDATOR = RegexValidator(
    regex=r"^[A-Za-z0-9-]+$",
    message="File number may only contain letters, digits and hyphens.",
)
FILE_NUMBER_MAX_LENGTH = 32


class PatientCategory(models.TextChoices):
    PSYCHIATRIC = "psychiatric", "Psychiatric"
    DEADDICTION = "deaddiction", "De-Addiction"


class Sex(models.TextChoices):
    MALE = "male", "Male"
    FEMALE = "female", "Female"
    OTHER = "other", "Other"


class PatientStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    DEAD = "dead", "Dead"
    DISCHARGED = "discharged", "Discharged"
    FOLLOW_UP = "follow_up", "Follow Up"


class AddictionType(models.TextChoices):
    ALCOHOL = "alcohol", "Alcohol"
    DRUGS = "drugs", "Drugs"
    TOBACCO = "tobacco", "Tobacco"
    GAMBLING = "gambling", "Gambling"
    OTHER = "other", "Other"


def patient_photo_upload_path(instance, filename):
    return f"patients/{instance.pk}/{filename}"


class Patient(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file_number = models.CharField(
        max_length=FILE_NUMBER_MAX_LENGTH,
        unique=True,
        validators=[FILE_NUMBER_VALIDATOR],
    )
    hdams_id = models.CharField(max_length=64, blank=True, null=True, unique=True)
    patient_category = models.CharField(max_length=32, choices=PatientCategory.choices)
    full_name = models.CharField(max_length=255)
    date_of_birth = models.DateField()
    sex = models.CharField(max_length=16, choices=Sex.choices)
    aadhaar_number = models.CharField(max_length=12, blank=True, null=True)
    phone_number = models.CharField(max_length=20)
    relative_phone = models.CharField(max_length=20, blank=True, null=True)
    address_line1 = models.TextField()
    photo = models.ImageField(upload_to=patient_photo_upload_path, blank=True, null=True)
    fingerprint_template = models.TextField(blank=True)
    fingerprint_enrolled_at = models.DateTimeField(blank=True, null=True)
    fingerprint_template_key_version = models.CharField(max_length=16, default="v1")
    status = models.CharField(
        max_length=32,
        choices=PatientStatus.choices,
        default=PatientStatus.ACTIVE,
    )
    outstanding_debt = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    registration_date = models.DateField(default=timezone.localdate)
    mother_name = models.CharField(max_length=255, blank=True)
    father_name = models.CharField(max_length=255, blank=True)
    grandfather_name = models.CharField(max_length=255, blank=True)
    spouse_name = models.CharField(max_length=255, blank=True)
    blood_group = models.CharField(max_length=8, blank=True)
    nationality = models.CharField(max_length=64, blank=True)
    religion = models.CharField(max_length=64, blank=True)
    monthly_income = models.CharField(max_length=64, blank=True)
    occupation = models.CharField(max_length=255, blank=True)
    employment_status = models.CharField(max_length=64, blank=True)
    education = models.CharField(max_length=64, blank=True)
    marital_status = models.CharField(max_length=64, blank=True)
    block_mc = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=255, blank=True)
    district = models.CharField(max_length=255, blank=True)
    state = models.CharField(max_length=255, blank=True)
    pincode = models.CharField(max_length=16, blank=True)
    living_arrangement = models.CharField(max_length=64, blank=True)
    substance_used_currently = models.JSONField(default=list, blank=True)
    substance_ever_used = models.JSONField(default=list, blank=True)
    injection_use_ever = models.BooleanField(default=False)
    injection_use_currently = models.BooleanField(default=False)
    route_of_admission = models.CharField(max_length=255, blank=True)
    syringe_sharing = models.BooleanField(default=False)
    sti_std = models.CharField(max_length=255, blank=True)
    jaundice = models.BooleanField(default=False)
    sex_with_sex_worker = models.BooleanField(default=False)
    hiv_screening = models.BooleanField(default=False)
    hiv_result = models.CharField(max_length=255, blank=True)
    comorbid_medical_illness = models.TextField(blank=True)
    comorbid_psychiatric_illness = models.TextField(blank=True)
    previous_drug_treatment = models.CharField(max_length=255, blank=True)
    ever_hospitalized = models.BooleanField(default=False)
    addiction_type = models.CharField(
        max_length=32,
        choices=AddictionType.choices,
        default=AddictionType.OTHER,
    )
    addiction_duration = models.CharField(max_length=255, blank=True)
    first_visit_date = models.DateField(default=timezone.localdate)
    emergency_contact_name = models.CharField(max_length=255, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)
    emergency_contact_relation = models.CharField(max_length=255, blank=True)
    family_history = models.TextField(blank=True)
    medical_history = models.TextField(blank=True)
    allergies = models.TextField(blank=True)
    current_medications = models.TextField(blank=True)
    previous_treatments = models.TextField(blank=True)
    next_followup_date = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["file_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["aadhaar_number"],
                condition=Q(aadhaar_number__isnull=False),
                name="unique_patient_aadhaar_when_present",
            ),
        ]
        indexes = [
            models.Index(fields=["file_number"]),
            models.Index(fields=["phone_number"]),
            models.Index(fields=["full_name"]),
            models.Index(fields=["next_followup_date"]),
        ]

    def __str__(self):
        return f"{self.file_number} - {self.full_name}"

    @property
    def general_data_complete(self) -> bool:
        required_fields = [
            self.date_of_birth,
            self.sex,
            self.address_line1,
            self.relative_phone or self.emergency_contact_phone,
        ]
        return all(bool(value) for value in required_fields)

    @classmethod
    def latest_file_number(cls) -> str | None:
        """Return the most recently created patient's file_number.

        Used by the registration 409 response so the front-end can suggest
        the next available number after a collision. Returns ``None`` when
        the table is empty.
        """
        latest = cls.objects.order_by("-created_at").only("file_number").first()
        return latest.file_number if latest else None
