from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from hospitals.models import Hospital

from .models import CustomUser, UserRole


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    model = CustomUser
    ordering = ("email",)
    list_display = ("email", "full_name", "role", "hospital", "is_active", "is_staff")
    search_fields = ("email", "full_name")
    list_filter = ("role", "is_active", "is_staff")
    filter_horizontal = ("managed_hospitals",)

    fieldsets = (
        (None, {"fields": ("email", "username", "password")}),
        ("Personal info", {"fields": ("full_name", "first_name", "last_name")}),
        (
            "Role & Hospital",
            {"fields": ("role", "hospital", "managed_hospitals")},
        ),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "password1",
                    "password2",
                    "full_name",
                    "role",
                    "hospital",
                    "managed_hospitals",
                ),
            },
        ),
    )

    class Media:
        js = ("accounts/js/role_fields.js",)

    # ── fieldset scoping ────────────────────────────────────────────

    def get_fieldsets(self, request, obj=None):
        fieldsets = super().get_fieldsets(request, obj)
        user = request.user

        if user.is_superadmin():
            return fieldsets

        # For GroupAdmin / HospitalAdmin:
        #  - Strip managed_hospitals (they use hospital FK instead)
        #  - Strip Permissions fieldset entirely (prevents privilege escalation)
        #  - Strip Important dates fieldset (not relevant)
        hidden_fieldsets = {"Permissions", "Important dates"}
        cleaned = []
        for name, options in fieldsets:
            if name in hidden_fieldsets:
                continue
            fields = list(options.get("fields", ()))
            if "managed_hospitals" in fields:
                fields.remove("managed_hospitals")
            cleaned.append((name, {**options, "fields": tuple(fields)}))
        return cleaned

    # ── queryset scoping ────────────────────────────────────────────

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user

        if user.is_superadmin():
            return qs

        if user.is_group_admin():
            return qs.filter(
                hospital__in=user.managed_hospitals.all(),
                role__in=[
                    UserRole.HOSPITAL_ADMIN,
                    UserRole.RECEPTIONIST,
                    UserRole.PHARMACY,
                ],
            )

        if user.is_hospital_admin():
            return qs.filter(
                hospital=user.hospital,
                role__in=[UserRole.RECEPTIONIST, UserRole.PHARMACY],
            )

        return qs.none()

    # ── form customisation ──────────────────────────────────────────

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        user = request.user

        if user.is_superadmin():
            return form

        # Strip permission-related fields for non-SuperAdmin users
        # (keeps form in sync with get_fieldsets which hides the section)
        for field_name in ("is_staff", "is_superuser", "groups", "user_permissions"):
            if field_name in form.base_fields:
                del form.base_fields[field_name]

        if user.is_group_admin():
            # GroupAdmin can create HospitalAdmin, Receptionist, and Pharmacy
            if "role" in form.base_fields:
                form.base_fields["role"].choices = [
                    (UserRole.HOSPITAL_ADMIN.value, UserRole.HOSPITAL_ADMIN.label),
                    (UserRole.RECEPTIONIST.value, UserRole.RECEPTIONIST.label),
                    (UserRole.PHARMACY.value, UserRole.PHARMACY.label),
                ]
            # Limit hospital queryset to managed hospitals
            if "hospital" in form.base_fields:
                form.base_fields["hospital"].queryset = user.managed_hospitals.all()
            # Hide managed_hospitals field
            if "managed_hospitals" in form.base_fields:
                del form.base_fields["managed_hospitals"]

        elif user.is_hospital_admin():
            # Limit role choices to RECEPTIONIST and PHARMACY
            if "role" in form.base_fields:
                form.base_fields["role"].choices = [
                    (UserRole.RECEPTIONIST.value, UserRole.RECEPTIONIST.label),
                    (UserRole.PHARMACY.value, UserRole.PHARMACY.label),
                ]
            # Limit hospital queryset to own hospital only
            if "hospital" in form.base_fields:
                form.base_fields["hospital"].queryset = Hospital.objects.filter(
                    id=user.hospital_id
                )
            # Hide managed_hospitals field
            if "managed_hospitals" in form.base_fields:
                del form.base_fields["managed_hospitals"]

        return form

    # ── save model ──────────────────────────────────────────────────

    def save_model(self, request, obj, form, change):
        # Auto-assign hospital for users created by HospitalAdmin
        if request.user.is_hospital_admin() and not change:
            obj.hospital = request.user.hospital

        # Auto-set is_staff based on role
        if obj.role in (UserRole.SUPERADMIN, UserRole.GROUP_ADMIN, UserRole.HOSPITAL_ADMIN):
            obj.is_staff = True
        elif obj.role in (UserRole.RECEPTIONIST, UserRole.PHARMACY):
            obj.is_staff = False

        super().save_model(request, obj, form, change)

    # ── permission overrides ────────────────────────────────────────

    def has_module_permission(self, request):
        if not request.user.is_authenticated:
            return False
        user = request.user
        return (
            user.is_superadmin()
            or user.is_group_admin()
            or user.is_hospital_admin()
        )

    def has_view_permission(self, request, obj=None):
        if not request.user.is_authenticated:
            return False
        user = request.user

        if user.is_superadmin():
            return True

        if user.is_group_admin():
            if obj is None:
                return True
            if obj.hospital is None:
                return False
            return obj.hospital in user.managed_hospitals.all()

        if user.is_hospital_admin():
            if obj is None:
                return True
            return obj.hospital == user.hospital

        return False

    def has_delete_permission(self, request, obj=None):
        # Nobody can delete a superadmin
        if obj is not None and obj.is_superadmin():
            return False

        user = request.user
        if user.is_superadmin() or user.is_group_admin():
            return True

        return False

    def has_change_permission(self, request, obj=None):
        if obj is None:
            return True

        user = request.user

        if user.is_superadmin():
            return True

        if user.is_group_admin():
            if obj.hospital is None:
                return False
            return obj.hospital in user.managed_hospitals.all()

        if user.is_hospital_admin():
            return obj.hospital == user.hospital

        return False

    def has_add_permission(self, request):
        user = request.user

        if user.is_superadmin() or user.is_group_admin() or user.is_hospital_admin():
            return True

        return False
