from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class UserRole(models.TextChoices):
    SUPERADMIN = "superadmin", "Super Admin"
    GROUP_ADMIN = "group_admin", "Group Admin"
    HOSPITAL_ADMIN = "hospital_admin", "Hospital Admin"
    RECEPTIONIST = "receptionist", "Receptionist"
    PHARMACY = "pharmacy", "Pharmacy"


class CustomUser(AbstractUser):
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150, unique=True, blank=True)
    full_name = models.CharField(max_length=255)
    role = models.CharField(
        max_length=32,
        choices=UserRole.choices,
        default=UserRole.RECEPTIONIST,
    )
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff",
    )
    managed_hospitals = models.ManyToManyField(
        "hospitals.Hospital",
        blank=True,
        related_name="group_admins",
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    objects = UserManager()

    class Meta:
        ordering = ["email"]

    def save(self, *args, **kwargs):
        self.email = self.email.lower()
        if not self.username:
            self.username = self.email
        if not self.full_name:
            self.full_name = self.email
        # Auto-set is_staff based on role
        if self.role in (UserRole.SUPERADMIN, UserRole.GROUP_ADMIN, UserRole.HOSPITAL_ADMIN):
            self.is_staff = True
        elif self.role in (UserRole.RECEPTIONIST, UserRole.PHARMACY):
            self.is_staff = False
        super().save(*args, **kwargs)

    def __str__(self):
        return self.full_name or self.email

    # ── helper methods ──────────────────────────────────────────────

    def is_superadmin(self):
        return self.role == UserRole.SUPERADMIN or self.is_superuser

    def is_group_admin(self):
        return self.role == UserRole.GROUP_ADMIN

    def is_hospital_admin(self):
        return self.role == UserRole.HOSPITAL_ADMIN

    def has_portal_access(self):
        return self.role not in (UserRole.RECEPTIONIST, UserRole.PHARMACY)
