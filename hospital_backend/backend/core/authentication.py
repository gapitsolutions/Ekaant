from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication


def enforce_csrf(request) -> None:
    underlying_request = getattr(request, "_request", request)
    middleware = CsrfViewMiddleware(lambda req: None)
    middleware.process_request(underlying_request)
    rejection = middleware.process_view(underlying_request, lambda req: None, (), {})
    if rejection is not None:
        raise exceptions.PermissionDenied("CSRF validation failed.")


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        raw_token = request.COOKIES.get(settings.SIMPLE_JWT["AUTH_COOKIE_ACCESS"])
        if not raw_token:
            return None

        validated_token = self.get_validated_token(raw_token)
        if request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
            enforce_csrf(request)

        return (self.get_user(validated_token), validated_token)
