import base64
import binascii

from rest_framework import serializers

from core.exceptions import ConflictError

from .models import (
    AttendanceStatus,
    Designation,
    EmploymentType,
    Gender,
    Payslip,
    Staff,
)


MAX_PHOTO_BYTES = 2 * 1024 * 1024
ALLOWED_PHOTO_MIME_TYPES = {"image/jpeg", "image/png"}


def _decode_photo_payload(payload: str) -> bytes:
    """Decode + validate a base64 photo payload. Mirrors the patient-photo
    handling (`patients.serializers`) so the upload contract stays JSON."""
    compact = "".join(payload.split())
    if not compact:
        raise serializers.ValidationError("Invalid photo_base64 payload")
    max_encoded_chars = ((MAX_PHOTO_BYTES * 4) // 3) + 8
    if len(compact) > max_encoded_chars:
        raise serializers.ValidationError("Photo exceeds maximum allowed size (2 MB)")
    try:
        decoded = base64.b64decode(compact, validate=True)
    except (binascii.Error, ValueError):
        raise serializers.ValidationError("Invalid photo_base64 payload")
    if not decoded:
        raise serializers.ValidationError("Invalid photo_base64 payload")
    if len(decoded) > MAX_PHOTO_BYTES:
        raise serializers.ValidationError("Photo exceeds maximum allowed size (2 MB)")
    return decoded


def _mask_tail(value: str, visible: int = 4) -> str:
    """Mask all but the last ``visible`` chars (digits/letters). Blank → ''."""
    if not value:
        return ""
    tail = value[-visible:]
    return f"{'•' * max(0, len(value) - visible)}{tail}"


class DesignationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = Designation
        fields = ["id", "name", "is_active"]

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Designation name is required.")
        qs = Designation.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise ConflictError("A designation with this name already exists.")
        return value


def resolve_designation(name: str) -> Designation:
    """Get-or-create a designation by case-insensitive name. Lets the frontend
    introduce new titles that then persist in the picker."""
    name = (name or "").strip()
    if not name:
        raise serializers.ValidationError({"designation": "Designation is required."})
    existing = Designation.objects.filter(name__iexact=name).first()
    if existing:
        return existing
    return Designation.objects.create(name=name)


class StaffWriteSerializer(serializers.Serializer):
    """Create / partial-update payload. ``designation`` is a name (string) so
    the frontend can submit either an existing title or a brand-new one."""

    staff_code = serializers.CharField(max_length=32)
    full_name = serializers.CharField(max_length=255)
    designation = serializers.CharField(max_length=100)
    employment_type = serializers.ChoiceField(
        choices=EmploymentType.choices, default=EmploymentType.PERMANENT
    )
    is_active = serializers.BooleanField(required=False, default=True)
    joined_date = serializers.DateField(required=False, allow_null=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.ChoiceField(
        choices=Gender.choices, required=False, allow_blank=True, default=""
    )
    mobile_number = serializers.CharField(required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")
    gov_registration = serializers.CharField(required=False, allow_blank=True, default="")
    aadhaar_number = serializers.CharField(required=False, allow_blank=True, default="")
    pan_number = serializers.CharField(required=False, allow_blank=True, default="")
    bank_account_number = serializers.CharField(required=False, allow_blank=True, default="")
    bank_ifsc = serializers.CharField(required=False, allow_blank=True, default="")
    monthly_salary = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, default=0
    )
    holiday_allowed = serializers.IntegerField(min_value=0, required=False, default=0)
    sunday_holiday = serializers.BooleanField(required=False, default=True)
    # Optional profile photo as base64 (+ mime type) — mirrors the patient
    # photo upload contract so create/update stay JSON (no multipart).
    photo_base64 = serializers.CharField(
        required=False, allow_blank=True, write_only=True
    )
    photo_mime_type = serializers.CharField(
        required=False, allow_blank=True, write_only=True
    )

    def validate_staff_code(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Staff code is required.")
        qs = Staff.objects.filter(staff_code__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise ConflictError("This staff code is already in use.")
        return value

    def validate(self, attrs):
        photo_base64 = attrs.get("photo_base64", "")
        photo_mime_type = (attrs.get("photo_mime_type") or "").strip().lower()
        if bool(photo_base64) != bool(photo_mime_type):
            raise serializers.ValidationError(
                "photo_base64 and photo_mime_type must be provided together."
            )
        if photo_mime_type and photo_mime_type not in ALLOWED_PHOTO_MIME_TYPES:
            raise serializers.ValidationError(
                "Unsupported photo_mime_type. Allowed: image/jpeg, image/png."
            )
        if photo_base64:
            attrs["_decoded_photo"] = _decode_photo_payload(photo_base64)
            attrs["photo_mime_type"] = photo_mime_type
        return attrs


class StaffReadSerializer(serializers.ModelSerializer):
    """Detail payload — full sensitive fields (admin-only view)."""

    id = serializers.CharField(read_only=True)
    designation = serializers.CharField(source="designation.name", read_only=True)
    designation_id = serializers.CharField(source="designation.id", read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Staff
        fields = [
            "id",
            "staff_code",
            "full_name",
            "designation",
            "designation_id",
            "employment_type",
            "is_active",
            "joined_date",
            "date_of_birth",
            "gender",
            "mobile_number",
            "email",
            "address",
            "photo_url",
            "gov_registration",
            "aadhaar_number",
            "pan_number",
            "bank_account_number",
            "bank_ifsc",
            "monthly_salary",
            "holiday_allowed",
            "sunday_holiday",
            "created_at",
            "updated_at",
        ]

    def get_photo_url(self, obj):
        if not obj.photo:
            return None
        request = self.context.get("request")
        url = obj.photo.url
        return request.build_absolute_uri(url) if request else url


class StaffListItemSerializer(StaffReadSerializer):
    """List payload — sensitive identifiers MASKED (Aadhaar/PAN/account show
    only the last 4); salary omitted entirely from the list."""

    aadhaar_number = serializers.SerializerMethodField()
    pan_number = serializers.SerializerMethodField()
    bank_account_number = serializers.SerializerMethodField()

    class Meta(StaffReadSerializer.Meta):
        fields = [
            f for f in StaffReadSerializer.Meta.fields
            if f not in {"monthly_salary", "bank_ifsc", "address"}
        ]

    def get_aadhaar_number(self, obj):
        return _mask_tail(obj.aadhaar_number)

    def get_pan_number(self, obj):
        return _mask_tail(obj.pan_number)

    def get_bank_account_number(self, obj):
        return _mask_tail(obj.bank_account_number)


# ── Attendance ──

class BulkAttendanceEntrySerializer(serializers.Serializer):
    staff_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)


class BulkAttendanceSerializer(serializers.Serializer):
    """Mark many staff for one date (the daily roster screen)."""

    date = serializers.DateField()
    entries = BulkAttendanceEntrySerializer(many=True, min_length=1)


class SingleAttendanceSerializer(serializers.Serializer):
    """Mark/edit one staff member's attendance for one date."""

    date = serializers.DateField()
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)


# ── Payroll / Payslips ──

class PayslipSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    staff_id = serializers.CharField(source="staff.id", read_only=True)
    staff_name = serializers.CharField(source="staff.full_name", read_only=True)
    staff_code = serializers.CharField(source="staff.staff_code", read_only=True)
    designation = serializers.CharField(source="staff.designation.name", read_only=True)
    generated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Payslip
        fields = [
            "id",
            "staff_id",
            "staff_name",
            "staff_code",
            "designation",
            "year",
            "month",
            "monthly_salary",
            "days_in_month",
            "sundays_in_month",
            "sunday_holiday",
            "holiday_allowed",
            "present_days",
            "absent_days",
            "half_days",
            "paid_leave_used",
            "unpaid_absent",
            "per_day_rate",
            "deduction",
            "net_pay",
            "generated_at",
            "generated_by_name",
        ]

    def get_generated_by_name(self, obj):
        return obj.generated_by.full_name if obj.generated_by_id else ""


class PayslipGenerateSerializer(serializers.Serializer):
    month = serializers.RegexField(r"^\d{4}-\d{2}$")
