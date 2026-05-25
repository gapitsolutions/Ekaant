from django.conf import settings
from django.contrib.auth import get_user_model
from django.middleware.csrf import get_token
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from core.authentication import CookieJWTAuthentication, enforce_csrf
from core.exceptions import AuthFailedClearCookies
from core.responses import clear_auth_cookies, set_auth_cookies, success_response

from .serializers import LoginSerializer, UserSerializer

User = get_user_model()


def _access_expires_in_seconds() -> int:
    return int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())


def _auth_payload(user):
    return {
        "expires_in": _access_expires_in_seconds(),
        "user": UserSerializer(user).data,
    }


def _authenticate_from_cookie(request):
    auth = CookieJWTAuthentication()
    try:
        result = auth.authenticate(request)
    except Exception:
        return None

    if not result:
        return None

    user, _token = result
    return user


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        enforce_csrf(request)
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"].lower()
        password = serializer.validated_data["password"]

        user = User.objects.filter(email__iexact=email).first()
        if not user or not user.check_password(password):
            raise AuthenticationFailed("Invalid email or password")

        if not user.is_active:
            raise AuthenticationFailed("Account is inactive")

        refresh = RefreshToken.for_user(user)
        response = success_response(_auth_payload(user), request=request)
        return set_auth_cookies(
            response,
            access_token=str(refresh.access_token),
            refresh_token=str(refresh),
        )


class CsrfView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        token = get_token(request)
        return success_response({"csrf_token": token}, request=request)


class SessionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_authenticate_header(self, request):
        # Without this, DRF downgrades 401 → 403 because no auth classes are
        # registered (no WWW-Authenticate header to suggest). Returning a
        # value keeps AuthenticationFailed at its declared 401.
        return 'Bearer realm="api"'

    def get(self, request):
        user = _authenticate_from_cookie(request)
        if not user:
            raise AuthFailedClearCookies("Not authenticated")
        return success_response(_auth_payload(user), request=request)


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_authenticate_header(self, request):
        # See SessionView.get_authenticate_header.
        return 'Bearer realm="api"'

    def post(self, request):
        enforce_csrf(request)
        raw_refresh = request.COOKIES.get(settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"])
        if not raw_refresh:
            raise AuthFailedClearCookies("Refresh token missing")

        try:
            refresh = RefreshToken(raw_refresh)
            user = User.objects.get(pk=refresh["user_id"])
            access_token = str(refresh.access_token)
        except (TokenError, User.DoesNotExist, KeyError):
            raise AuthFailedClearCookies("Invalid refresh token")

        response = success_response(
            {"refreshed": True, "expires_in": _access_expires_in_seconds()},
            request=request,
        )
        return set_auth_cookies(
            response,
            access_token=access_token,
            refresh_token=str(refresh),
        )


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        enforce_csrf(request)
        response = success_response({"logged_out": True}, request=request)
        return clear_auth_cookies(response)
