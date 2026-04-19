#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.prod}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm backend python manage.py shell <<'PY'
import os
from django.contrib.auth import get_user_model

User = get_user_model()

email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "").strip().lower()
password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "").strip()
full_name = os.environ.get("DJANGO_SUPERUSER_FULL_NAME", "Administrator").strip() or "Administrator"

if not email or not password:
    raise SystemExit("DJANGO_SUPERUSER_EMAIL and DJANGO_SUPERUSER_PASSWORD must be set.")

user = User.objects.filter(email=email).first()
if user is None:
    User.objects.create_superuser(email=email, password=password, full_name=full_name, role="admin")
    print(f"Created superuser: {email}")
else:
    changed = False
    if not user.is_staff:
        user.is_staff = True
        changed = True
    if not user.is_superuser:
        user.is_superuser = True
        changed = True
    if user.role != "admin":
        user.role = "admin"
        changed = True
    if full_name and user.full_name != full_name:
        user.full_name = full_name
        changed = True
    if changed:
        user.save(update_fields=["is_staff", "is_superuser", "role", "full_name"])
    print(f"Superuser already exists: {email}")
PY
