from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .forms import UserChangeForm, UserCreationForm
from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    model = User
    add_form = UserCreationForm
    form = UserChangeForm

    ordering = ("email",)
    list_display = ("email", "full_name", "role", "is_active", "is_staff")
    list_filter = ("role", "is_active", "is_staff", "is_superuser")
    search_fields = ("email", "full_name")

    # Edit-page layout: keep Django's built-in groups, append our hospital fields.
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Hospital", {"fields": ("full_name", "role")}),
    )

    # Create-page layout: REPLACE Django's default (which only collected
    # username/password) so admins are forced to provide a real email +
    # full_name + role at creation time. Frontend authentication requires
    # email; without it the user could log in to /admin but never to the API.
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "full_name",
                    "role",
                    "password1",
                    "password2",
                ),
            },
        ),
    )
