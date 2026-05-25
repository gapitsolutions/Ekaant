"""Project-wide DRF exception envelope.

Every error response that flows through DRF returns the canonical shape:

    {
        "success": false,
        "error": {
            "message": "<human-readable summary>",
            "fields"?: { "<field path>": ["<msg>", ...], ... },
            "code"?:  "<exc.default_code>",
            ...extras
        }
    }

* ``message`` is always present; older clients that only read it keep working.
* ``fields`` is included whenever the underlying DRF error carries
  per-field structure (e.g. serializer ValidationError). Nested errors
  inside many=True serializers are flattened to dot/index paths
  (``items.0.quantity``) so the front-end can address them directly.
* ``code`` exposes the exception's ``default_code`` (e.g. ``"conflict"``,
  ``"not_authenticated"``) so clients can branch on machine-readable
  identifiers instead of string-matching messages.
* Subclasses can attach an ``extra`` dict that is merged verbatim into
  ``error`` — used today by :class:`ConflictError` to ship
  ``last_file_number`` alongside a 409 collision response.
"""

from collections.abc import Iterable

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions as drf_exceptions
from rest_framework import status
from rest_framework.exceptions import APIException, AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class ConflictError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Conflict"
    default_code = "conflict"

    def __init__(self, detail=None, code=None, extra=None):
        """``extra`` is a dict merged into the ``error`` envelope by the
        handler. Use it to surface structured hints the front-end can act on
        (e.g. ``last_file_number`` after a file number collision)."""
        super().__init__(detail=detail, code=code)
        self.extra: dict | None = extra


class AuthFailedClearCookies(AuthenticationFailed):
    """401 that signals the handler to also clear auth cookies on the response.

    Used by the cookie-based auth views (session probe, refresh) so a stale
    or tampered JWT does not keep being re-sent on every request.
    """

    clear_auth_cookies = True


# Field name DRF uses for serializer-level (non-field) ValidationError items.
NON_FIELD_KEY = "non_field_errors"


def _coerce_message(data) -> str:
    """Best-effort human-readable summary for the top-level ``message``."""
    if isinstance(data, str):
        return data

    if isinstance(data, dict):
        if "detail" in data:
            return _coerce_message(data["detail"])
        if "message" in data:
            return _coerce_message(data["message"])

        first_value = next(iter(data.values()), None)
        if first_value is not None:
            return _coerce_message(first_value)

    if isinstance(data, Iterable):
        first_item = next(iter(data), None)
        if first_item is not None:
            return _coerce_message(first_item)

    return "Request failed"


def _flatten_field_errors(data, prefix: str = "") -> dict[str, list[str]]:
    """Recursively flatten DRF nested validation errors.

    DRF returns:
        {"email": ["required"], "items": [{"qty": ["bad"]}, {}]}

    This becomes:
        {"email": ["required"], "items.0.qty": ["bad"]}
    """
    out: dict[str, list[str]] = {}

    if isinstance(data, dict):
        for key, value in data.items():
            field_key = key if not prefix else f"{prefix}.{key}"
            for k, v in _flatten_field_errors(value, field_key).items():
                out.setdefault(k, []).extend(v)
        return out

    if isinstance(data, (list, tuple)):
        # Case A: list of plain strings → messages for the current field.
        if data and all(isinstance(x, str) for x in data):
            target = prefix or NON_FIELD_KEY
            out.setdefault(target, []).extend(str(x) for x in data)
            return out
        # Case B: list of dicts (many=True serializer errors).
        for idx, item in enumerate(data):
            if not item:
                continue
            indexed_prefix = f"{prefix}.{idx}" if prefix else str(idx)
            for k, v in _flatten_field_errors(item, indexed_prefix).items():
                out.setdefault(k, []).extend(v)
        return out

    if isinstance(data, str):
        out.setdefault(prefix or NON_FIELD_KEY, []).append(data)
        return out

    return out


def api_exception_handler(exc, context):
    # DRF's exception_handler rebinds Http404 / Django PermissionDenied to
    # their APIException equivalents *locally*, so the rebinding never reaches
    # us. Mirror it here so ``exc.default_code`` resolves to ``"not_found"`` /
    # ``"permission_denied"`` for the ``code`` field below.
    if isinstance(exc, Http404):
        exc = drf_exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = drf_exceptions.PermissionDenied()

    response = drf_exception_handler(exc, context)

    if response is None:
        return Response(
            {
                "success": False,
                "error": {
                    "message": "Internal server error",
                    "code": "internal_error",
                },
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    error_body: dict = {"message": _coerce_message(response.data)}

    # Attach structured per-field errors when present. Skip the noise case
    # where the only "field" is non_field_errors (already in ``message``).
    fields = _flatten_field_errors(response.data)
    fields.pop("detail", None)
    if fields and not (len(fields) == 1 and NON_FIELD_KEY in fields):
        error_body["fields"] = fields

    code = getattr(exc, "default_code", None)
    if code:
        error_body["code"] = code

    extra = getattr(exc, "extra", None)
    if isinstance(extra, dict):
        error_body.update(extra)

    response.data = {
        "success": False,
        "error": error_body,
    }

    if getattr(exc, "clear_auth_cookies", False):
        # Local import avoids a module-load cycle: responses imports settings,
        # which imports nothing from this module.
        from .responses import clear_auth_cookies

        clear_auth_cookies(response)

    return response
