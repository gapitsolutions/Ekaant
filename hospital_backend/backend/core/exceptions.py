from collections.abc import Iterable

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class ConflictError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Conflict"
    default_code = "conflict"


def _coerce_message(data) -> str:
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


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)

    if response is None:
        return Response(
            {
                "success": False,
                "error": {
                    "message": "Internal server error",
                },
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    response.data = {
        "success": False,
        "error": {
            "message": _coerce_message(response.data),
        },
    }
    return response
