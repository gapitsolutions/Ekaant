from rest_framework import serializers

from .models import BillingSettings


class BillingSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BillingSettings
        fields = ["default_consultation_fee", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_default_consultation_fee(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Consultation fee cannot be negative."
            )
        return value
