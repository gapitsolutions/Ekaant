from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class UserRole(models.TextChoices):
    ADMIN = "admin", "Admin"
    RECEPTION = "reception", "Reception"
    COUNSELLOR = "counsellor", "Counsellor"
    DOCTOR = "doctor", "Doctor"
    PHARMACIST = "pharmacist", "Pharmacist"


class User(AbstractUser):
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150, unique=True, blank=True)
    full_name = models.CharField(max_length=255)
    role = models.CharField(
        max_length=32,
        choices=UserRole.choices,
        default=UserRole.RECEPTION,
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
        super().save(*args, **kwargs)

    def __str__(self):
        return self.full_name or self.email
