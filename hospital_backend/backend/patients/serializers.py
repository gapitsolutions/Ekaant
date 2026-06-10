import base64
import binascii

from django.core.files.base import ContentFile
from django.db.models import Q
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers

from core.exceptions import ConflictError
from visits.models import VisitSession

from .models import FILE_NUMBER_MAX_LENGTH, FILE_NUMBER_VALIDATOR, Patient


def _digits_only(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


MAX_PHOTO_BYTES = 2 * 1024 * 1024
ALLOWED_PHOTO_MIME_TYPES = {"image/jpeg", "image/png"}


def _decode_photo_payload(payload: str) -> bytes:
    """Decode and validate a base64-encoded photo payload.

    Shared by ``PatientRegistrationSerializer`` and
    ``PatientGeneralUpdateSerializer``.
    """
    compact_payload = "".join(payload.split())
    if not compact_payload:
        raise serializers.ValidationError("Invalid photo_base64 payload")

    # Base64 overhead is roughly 4/3. This avoids decoding unexpectedly huge payloads.
    max_encoded_chars = ((MAX_PHOTO_BYTES * 4) // 3) + 8
    if len(compact_payload) > max_encoded_chars:
        raise serializers.ValidationError("Photo exceeds maximum allowed size (2 MB)")

    try:
        decoded = base64.b64decode(compact_payload, validate=True)
    except (binascii.Error, ValueError):
        raise serializers.ValidationError("Invalid photo_base64 payload")

    if not decoded:
        raise serializers.ValidationError("Invalid photo_base64 payload")

    if len(decoded) > MAX_PHOTO_BYTES:
        raise serializers.ValidationError("Photo exceeds maximum allowed size (2 MB)")

    return decoded


def _photo_url_for_patient(patient, request=None):
    if not getattr(patient, "photo", None):
        return None

    path = reverse("patient-photo", kwargs={"patient_id": patient.pk})

    return request.build_absolute_uri(path) if request else path


class PatientRegistrationSerializer(serializers.Serializer):
    patient_category = serializers.ChoiceField(
        choices=Patient._meta.get_field("patient_category").choices
    )
    file_number = serializers.CharField(
        max_length=FILE_NUMBER_MAX_LENGTH,
        validators=[FILE_NUMBER_VALIDATOR],
    )
    full_name = serializers.CharField()
    phone_number = serializers.CharField()
    date_of_birth = serializers.DateField()
    sex = serializers.ChoiceField(choices=Patient._meta.get_field("sex").choices)
    fingerprint_template = serializers.CharField(required=False, allow_blank=True)
    aadhaar_number = serializers.CharField(required=False, allow_blank=True)
    relative_phone = serializers.CharField(required=False, allow_blank=True)
    address_line1 = serializers.CharField()
    city = serializers.CharField(required=False, allow_blank=True)
    district = serializers.CharField(required=False, allow_blank=True)
    state = serializers.CharField(required=False, allow_blank=True)
    pincode = serializers.CharField(required=False, allow_blank=True)
    photo_base64 = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
    )
    photo_mime_type = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        photo_base64 = attrs.get("photo_base64", "")
        photo_mime_type = (attrs.get("photo_mime_type") or "").strip().lower()
        if photo_mime_type:
            attrs["photo_mime_type"] = photo_mime_type

        if bool(photo_base64) != bool(photo_mime_type):
            raise serializers.ValidationError(
                "photo_base64 and photo_mime_type must be provided together"
            )

        if photo_mime_type and photo_mime_type not in ALLOWED_PHOTO_MIME_TYPES:
            raise serializers.ValidationError(
                "Unsupported photo_mime_type. Allowed: image/jpeg, image/png"
            )

        if photo_base64:
            attrs["_decoded_photo"] = _decode_photo_payload(photo_base64)

        return attrs

    def validate_date_of_birth(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Date of birth cannot be in the future.")
        return value

    def validate_phone_number(self, value):
        digits = _digits_only(value)
        if not digits:
            raise serializers.ValidationError("Phone number is required.")
        return digits

    def validate_relative_phone(self, value):
        return _digits_only(value) if value else ""

    def validate_aadhaar_number(self, value):
        if not value:
            return None

        digits = _digits_only(value)
        if len(digits) != 12:
            raise serializers.ValidationError("Aadhaar number must be 12 digits.")
        if Patient.objects.filter(aadhaar_number=digits).exists():
            raise ConflictError("This Aadhaar number is already registered.")
        return digits

    def validate_file_number(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("File number is required.")
        if Patient.objects.filter(file_number__iexact=value).exists():
            # ConflictError → 409. The view layer attaches `last_file_number`
            # to the error response so the front-end can suggest the next id.
            raise ConflictError(
                "This file number already exists.",
                extra={"last_file_number": Patient.latest_file_number()},
            )
        return value

    def validate_pincode(self, value):
        if not value:
            return ""

        digits = _digits_only(value)
        if len(digits) != 6:
            raise serializers.ValidationError("Pincode must be 6 digits.")
        return digits

    def create(self, validated_data):
        photo_bytes = validated_data.pop("_decoded_photo", None)
        photo_mime_type = validated_data.pop("photo_mime_type", None)
        validated_data.pop("photo_base64", None)

        # ``file_number`` is validated for uniqueness in ``validate_file_number``
        # but a race with a concurrent registration is still possible — the DB
        # unique constraint is the source of truth. Convert IntegrityError back
        # into the same ConflictError shape so clients see one error contract.
        from django.db import IntegrityError, transaction

        try:
            with transaction.atomic():
                patient = Patient.objects.create(
                    fingerprint_enrolled_at=(
                        timezone.now() if validated_data.get("fingerprint_template") else None
                    ),
                    emergency_contact_phone=validated_data.get("relative_phone", ""),
                    **validated_data,
                )
        except IntegrityError as exc:
            if "file_number" in str(exc):
                raise ConflictError(
                    "This file number already exists.",
                    extra={"last_file_number": Patient.latest_file_number()},
                ) from exc
            raise

        if photo_bytes and photo_mime_type:
            extension = "jpg" if photo_mime_type == "image/jpeg" else "png"
            timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
            filename = f"profile_{timestamp}.{extension}"
            patient.photo.save(filename, ContentFile(photo_bytes), save=False)
            patient.save(update_fields=["photo", "updated_at"])

        return patient


class PatientSummarySerializer(serializers.ModelSerializer):
    patient_id = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = (
            "patient_id",
            "file_number",
            "hdams_id",
            "full_name",
            "phone_number",
            "date_of_birth",
            "sex",
            "status",
            "photo_url",
        )

    def get_patient_id(self, obj):
        return str(obj.pk)

    def get_photo_url(self, obj):
        return _photo_url_for_patient(obj, self.context.get("request"))


class PatientLookupSerializer(serializers.ModelSerializer):
    patient_id = serializers.SerializerMethodField()
    phone = serializers.CharField(source="phone_number")
    gender = serializers.CharField(source="sex")
    address = serializers.CharField(source="address_line1")
    photo_url = serializers.SerializerMethodField()
    aadhaar_number_last4 = serializers.SerializerMethodField()
    outstanding_debt = serializers.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        model = Patient
        fields = (
            "patient_id",
            "file_number",
            "hdams_id",
            "patient_category",
            "full_name",
            "father_name",
            "phone_number",
            "phone",
            "date_of_birth",
            "sex",
            "gender",
            "status",
            "outstanding_debt",
            "address_line1",
            "address",
            "city",
            "pincode",
            "relative_phone",
            "district",
            "state",
            "addiction_type",
            "registration_date",
            "next_followup_date",
            "photo_url",
            "aadhaar_number_last4",
            "created_at",
            "updated_at",
        )

    def get_patient_id(self, obj):
        return str(obj.pk)

    def get_aadhaar_number_last4(self, obj):
        if not obj.aadhaar_number:
            return None
        return obj.aadhaar_number[-4:]

    def get_photo_url(self, obj):
        return _photo_url_for_patient(obj, self.context.get("request"))


class PatientGeneralDataSerializer(serializers.ModelSerializer):
    patient_id = serializers.SerializerMethodField()
    phone = serializers.CharField(source="phone_number")
    gender = serializers.CharField(source="sex")
    address = serializers.CharField(source="address_line1")
    photo_url = serializers.SerializerMethodField()
    last_visit_date = serializers.SerializerMethodField()
    days_since_last_visit = serializers.SerializerMethodField()
    has_fingerprint = serializers.SerializerMethodField()
    general_data_complete = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = (
            "patient_id",
            "file_number",
            "hdams_id",
            "patient_category",
            "full_name",
            "phone_number",
            "phone",
            "status",
            "photo_url",
            "date_of_birth",
            "sex",
            "gender",
            "aadhaar_number",
            "relative_phone",
            "address",
            "registration_date",
            "mother_name",
            "father_name",
            "grandfather_name",
            "spouse_name",
            "blood_group",
            "nationality",
            "religion",
            "monthly_income",
            "occupation",
            "employment_status",
            "education",
            "marital_status",
            "block_mc",
            "city",
            "district",
            "state",
            "pincode",
            "living_arrangement",
            "substance_used_currently",
            "substance_ever_used",
            "injection_use_ever",
            "injection_use_currently",
            "route_of_admission",
            "syringe_sharing",
            "sti_std",
            "jaundice",
            "sex_with_sex_worker",
            "hiv_screening",
            "hiv_result",
            "comorbid_medical_illness",
            "comorbid_psychiatric_illness",
            "previous_drug_treatment",
            "ever_hospitalized",
            "addiction_type",
            "addiction_duration",
            "first_visit_date",
            "emergency_contact_name",
            "emergency_contact_phone",
            "emergency_contact_relation",
            "family_history",
            "medical_history",
            "allergies",
            "current_medications",
            "previous_treatments",
            "created_at",
            "updated_at",
            "next_followup_date",
            "has_fingerprint",
            "last_visit_date",
            "days_since_last_visit",
            "general_data_complete",
        )

    def get_patient_id(self, obj):
        return str(obj.pk)

    def get_last_visit_date(self, obj):
        latest_visit = (
            VisitSession.objects.filter(patient=obj)
            .order_by("-visit_date", "-checkin_time")
            .first()
        )
        if not latest_visit:
            return None
        return latest_visit.visit_date

    def get_days_since_last_visit(self, obj):
        latest_visit = (
            VisitSession.objects.filter(patient=obj)
            .order_by("-visit_date", "-checkin_time")
            .first()
        )
        if not latest_visit:
            return None
        return (timezone.localdate() - latest_visit.visit_date).days

    def get_photo_url(self, obj):
        return _photo_url_for_patient(obj, self.context.get("request"))

    def get_has_fingerprint(self, obj):
        return bool(obj.fingerprint_template)

    def get_general_data_complete(self, obj):
        return obj.general_data_complete


class PatientGeneralUpdateSerializer(serializers.ModelSerializer):
    # Photo fields — same contract as PatientRegistrationSerializer.
    # They are write-only and never part of the ModelSerializer's Meta.fields
    # because the underlying model field is an ImageField, not a CharField.
    photo_base64 = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
        write_only=True,
    )
    photo_mime_type = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )

    class Meta:
        model = Patient
        fields = (
            "hdams_id",
            "full_name",
            "aadhaar_number",
            "date_of_birth",
            "phone_number",
            "sex",
            "blood_group",
            "nationality",
            "religion",
            "education",
            "employment_status",
            "occupation",
            "monthly_income",
            "marital_status",
            "father_name",
            "mother_name",
            "grandfather_name",
            "spouse_name",
            "relative_phone",
            "living_arrangement",
            "address_line1",
            "block_mc",
            "city",
            "district",
            "state",
            "pincode",
            "substance_used_currently",
            "substance_ever_used",
            "injection_use_ever",
            "injection_use_currently",
            "route_of_admission",
            "syringe_sharing",
            "sti_std",
            "jaundice",
            "sex_with_sex_worker",
            "hiv_screening",
            "hiv_result",
            "comorbid_medical_illness",
            "comorbid_psychiatric_illness",
            "previous_drug_treatment",
            "ever_hospitalized",
            "addiction_type",
            "addiction_duration",
            "family_history",
            "medical_history",
            "allergies",
            "current_medications",
            "previous_treatments",
            "emergency_contact_name",
            "emergency_contact_phone",
            "emergency_contact_relation",
            "status",
            "registration_date",
            "first_visit_date",
            "fingerprint_template",
            "fingerprint_template_key_version",
            # photo_base64 / photo_mime_type are declared as explicit fields
            # above (write_only) so DRF picks them up even though they aren't
            # model columns.
            "photo_base64",
            "photo_mime_type",
        )

    def validate(self, attrs):
        photo_base64 = attrs.get("photo_base64", "")
        photo_mime_type = (attrs.get("photo_mime_type") or "").strip().lower()
        if photo_mime_type:
            attrs["photo_mime_type"] = photo_mime_type

        if bool(photo_base64) != bool(photo_mime_type):
            raise serializers.ValidationError(
                "photo_base64 and photo_mime_type must be provided together"
            )

        if photo_mime_type and photo_mime_type not in ALLOWED_PHOTO_MIME_TYPES:
            raise serializers.ValidationError(
                "Unsupported photo_mime_type. Allowed: image/jpeg, image/png"
            )

        if photo_base64:
            attrs["_decoded_photo"] = _decode_photo_payload(photo_base64)

        return attrs

    def validate_date_of_birth(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Date of birth cannot be in the future.")
        return value

    def validate_phone_number(self, value):
        digits = _digits_only(value)
        if not digits:
            raise serializers.ValidationError("Phone number is required.")
        return digits

    def validate_relative_phone(self, value):
        return _digits_only(value) if value else ""

    def validate_emergency_contact_phone(self, value):
        return _digits_only(value) if value else ""

    def validate_aadhaar_number(self, value):
        if not value:
            return None

        digits = _digits_only(value)
        if len(digits) != 12:
            raise serializers.ValidationError("Aadhaar number must be 12 digits.")

        duplicate_exists = (
            Patient.objects.filter(aadhaar_number=digits)
            .exclude(pk=self.instance.pk)
            .exists()
        )
        if duplicate_exists:
            raise ConflictError("This Aadhaar number is already registered.")
        return digits

    def update(self, instance, validated_data):
        # --- photo handling ---
        photo_bytes = validated_data.pop("_decoded_photo", None)
        photo_mime_type = validated_data.pop("photo_mime_type", None)
        validated_data.pop("photo_base64", None)

        # --- fingerprint handling ---
        has_fingerprint_update = "fingerprint_template" in validated_data
        fingerprint_template = validated_data.get("fingerprint_template") if has_fingerprint_update else None

        if has_fingerprint_update:
            validated_data["fingerprint_enrolled_at"] = (
                timezone.now() if fingerprint_template else None
            )

        instance = super().update(instance, validated_data)

        # Save new photo (replaces existing file on disk).
        if photo_bytes and photo_mime_type:
            old_photo_name = instance.photo.name if instance.photo else None
            storage = instance.photo.storage

            extension = "jpg" if photo_mime_type == "image/jpeg" else "png"
            timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
            filename = f"profile_{timestamp}.{extension}"
            instance.photo.save(filename, ContentFile(photo_bytes), save=False)
            instance.save(update_fields=["photo", "updated_at"])

            # Remove the old file so orphaned images don't accumulate.
            if old_photo_name and old_photo_name != instance.photo.name:
                try:
                    storage.delete(old_photo_name)
                except Exception:
                    pass  # best-effort cleanup

        return instance


class PatientFollowUpDateUpdateSerializer(serializers.Serializer):
    next_followup_date = serializers.DateField(required=False, allow_null=True)

    def validate_next_followup_date(self, value):
        if value is None:
            return None
        if value < timezone.localdate():
            raise serializers.ValidationError("next_followup_date cannot be in the past.")
        return value


PATIENT_SEARCH_FIELD_CHOICES = frozenset(
    {"file_number", "full_name", "phone_number", "aadhaar_number", "hdams_id"}
)


def patient_search_queryset(query: str, fields: list[str] | None = None):
    """OR-combined contains search across patient identity fields.

    When ``fields`` is None the legacy default is applied: file_number,
    full_name, phone_number, aadhaar_number. This default is shared with the
    check-in lookup endpoint and the receptionist summary list, so changing
    it would alter those flows — extend ``fields`` from the caller instead.

    Unknown / disallowed field names are silently dropped; if nothing valid
    remains the default field set is used so the caller never gets an empty
    queryset purely because of a malformed param.
    """
    digits = _digits_only(query)
    if not query:
        return Patient.objects.none()

    if fields is None:
        selected = {"file_number", "full_name", "phone_number", "aadhaar_number"}
    else:
        selected = {f for f in fields if f in PATIENT_SEARCH_FIELD_CHOICES}
        if not selected:
            selected = {"file_number", "full_name", "phone_number", "aadhaar_number"}

    predicate = Q()
    if "file_number" in selected:
        predicate |= Q(file_number__icontains=query)
    if "full_name" in selected:
        predicate |= Q(full_name__icontains=query)
    if "phone_number" in selected:
        predicate |= Q(phone_number__icontains=digits or query)
    if "aadhaar_number" in selected:
        predicate |= Q(aadhaar_number__icontains=digits or query)
    if "hdams_id" in selected:
        predicate |= Q(hdams_id__icontains=query)

    return Patient.objects.filter(predicate)
