#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.prod}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  echo "Copy .env.prod.example to .env.prod and update values."
  exit 1
fi

# shellcheck disable=SC1090
. "$ENV_FILE"

DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

if [ -z "$DB_PASSWORD" ] || [ -z "$POSTGRES_PASSWORD" ]; then
  echo "DB_PASSWORD and POSTGRES_PASSWORD must be set in $ENV_FILE"
  exit 1
fi

if [ "$DB_USER" = "$POSTGRES_USER" ] && [ "$DB_PASSWORD" != "$POSTGRES_PASSWORD" ]; then
  echo "Credential mismatch in $ENV_FILE:"
  echo "- DB_USER and POSTGRES_USER are both '$DB_USER'"
  echo "- but DB_PASSWORD and POSTGRES_PASSWORD differ"
  echo "Set them to the same value (or intentionally use different users)."
  exit 1
fi

if command -v git >/dev/null 2>&1; then
  git -C "$ROOT_DIR" pull --ff-only || true
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build backend

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm backend python manage.py migrate

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm backend python manage.py collectstatic --noinput

"$ROOT_DIR/scripts/create_superuser.sh"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d backend

DOMAIN_NAME="${DOMAIN_NAME:-}"
LETSENCRYPT_PATH="${LETSENCRYPT_PATH:-/srv/hospital/letsencrypt}"

if [ -n "$DOMAIN_NAME" ] && [ -f "$LETSENCRYPT_PATH/live/$DOMAIN_NAME/fullchain.pem" ]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d nginx
  echo "Nginx started with TLS cert for $DOMAIN_NAME"
else
  echo "TLS certificate not found for DOMAIN_NAME='${DOMAIN_NAME:-unset}'."
  echo "Run scripts/issue_tls_cert.sh to obtain certificates, then start nginx."
fi

docker image prune -f

echo "Backend deployment complete."
