from rest_framework.views import APIView

from core.permissions import IsAdminRole, IsReceptionAdminOrPharmacist
from core.responses import success_response

from .models import BillingSettings
from .serializers import BillingSettingsSerializer


class BillingSettingsView(APIView):
    """Hospital-wide billing configuration (singleton).

    GET is broadly readable (the dispense screen needs the default
    consultation fee to pre-fill); PATCH is admin-only since it changes
    hospital financial defaults.
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsReceptionAdminOrPharmacist()]
        return [IsAdminRole()]

    def get(self, request):
        settings_obj = BillingSettings.load()
        return success_response(BillingSettingsSerializer(settings_obj).data)

    def patch(self, request):
        settings_obj = BillingSettings.load()
        serializer = BillingSettingsSerializer(
            settings_obj, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return success_response(serializer.data)
