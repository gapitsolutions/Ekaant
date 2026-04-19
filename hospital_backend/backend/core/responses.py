from django.conf import settings
from django.middleware.csrf import get_token
from rest_framework.response import Response


def attach_csrf_cookie(response: Response, request) -> Response:
    token = get_token(getattr(request, "_request", request))
    response.set_cookie(
        settings.CSRF_COOKIE_NAME,
        token,
        secure=settings.CSRF_COOKIE_SECURE,
        samesite=settings.CSRF_COOKIE_SAMESITE,
        httponly=False,
    )
    return response


def success_response(data, *, status_code: int = 200, request=None) -> Response:
    response = Response({"success": True, "data": data}, status=status_code)
    if request is not None:
        attach_csrf_cookie(response, request)
    return response


def set_auth_cookies(response: Response, *, access_token: str, refresh_token: str) -> Response:
    access_lifetime = int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())
    refresh_lifetime = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())

    response.set_cookie(
        settings.SIMPLE_JWT["AUTH_COOKIE_ACCESS"],
        access_token,
        max_age=access_lifetime,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )
    response.set_cookie(
        settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
        refresh_token,
        max_age=refresh_lifetime,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )
    return response


def clear_auth_cookies(response: Response) -> Response:
    response.delete_cookie(
        settings.SIMPLE_JWT["AUTH_COOKIE_ACCESS"],
        samesite=settings.COOKIE_SAMESITE,
    )
    response.delete_cookie(
        settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
        samesite=settings.COOKIE_SAMESITE,
    )
    return response
