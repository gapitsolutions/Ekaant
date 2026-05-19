from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    model = User
    ordering = ("email",)
    list_display = ("email", "full_name", "role", "is_active", "is_staff")
    search_fields = ("email", "full_name", "hospital_id")

    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Hospital", {"fields": ("full_name", "role", "hospital_id")}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        (
            "Hospital",
            {
                "fields": ("full_name", "role", "hospital_id"),
            },
        ),
    )
