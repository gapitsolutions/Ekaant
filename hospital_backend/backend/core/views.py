from django.db import connection
from django.http import JsonResponse
from django.utils import timezone


def health_check(_request):
    db_ok = True
    db_error = None

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception as exc:
        db_ok = False
        db_error = str(exc)

    payload = {
        "status": "ok" if db_ok else "degraded",
        "database": "ok" if db_ok else "error",
        "timestamp": timezone.now().isoformat(),
    }

    if db_error:
        payload["error"] = db_error

    return JsonResponse(payload, status=200 if db_ok else 503)
