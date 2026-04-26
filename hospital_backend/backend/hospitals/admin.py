from django.contrib import admin

from .models import Hospital


@admin.register(Hospital)
class HospitalModelAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "email", "is_active")
    search_fields = ("name", "email")
    list_filter = ("is_active",)

    # ── queryset scoping ────────────────────────────────────────────

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user

        if user.is_superadmin():
            return qs

        if user.is_group_admin():
            return user.managed_hospitals.all()

        if user.is_hospital_admin():
            return qs.filter(id=user.hospital_id)

        return qs.none()

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
            return obj in user.managed_hospitals.all()

        if user.is_hospital_admin():
            if obj is None:
                return True
            return obj.id == user.hospital_id

        return False

    def has_change_permission(self, request, obj=None):
        if not request.user.is_authenticated:
            return False
        return request.user.is_superadmin()

    def has_add_permission(self, request):
        if not request.user.is_authenticated:
            return False
        return request.user.is_superadmin()

    def has_delete_permission(self, request, obj=None):
        if not request.user.is_authenticated:
            return False
        return request.user.is_superadmin()
