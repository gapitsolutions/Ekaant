from django import forms
from django.contrib.auth.forms import UserChangeForm as DjangoUserChangeForm
from django.contrib.auth.forms import UserCreationForm as DjangoUserCreationForm

from .models import User


class UserCreationForm(DjangoUserCreationForm):
    """Admin 'Add user' form that requires email + full_name + role upfront.

    The default ``DjangoUserCreationForm`` only collects ``username`` + password;
    because this project uses email as the USERNAME_FIELD and login identifier,
    we must collect a real email at creation time so the user can authenticate
    against the public API immediately after admin provisioning.
    """

    email = forms.EmailField(
        required=True,
        help_text="Used as the login identifier. Stored lowercased.",
    )
    full_name = forms.CharField(
        required=True,
        max_length=255,
        help_text="Displayed in the UI and in audit trails.",
    )

    class Meta(DjangoUserCreationForm.Meta):
        model = User
        fields = ("email", "full_name", "role")

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if not email:
            raise forms.ValidationError("Email is required.")
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("A user with this email already exists.")
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        user.full_name = self.cleaned_data["full_name"]
        user.role = self.cleaned_data.get("role") or user.role
        # ``User.save()`` lowercases email + back-fills username; let it run.
        if commit:
            user.save()
        return user


class UserChangeForm(DjangoUserChangeForm):
    class Meta(DjangoUserChangeForm.Meta):
        model = User
