#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.prod}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
. "$ENV_FILE"

DOMAIN_NAME="${DOMAIN_NAME:-}"
if [ -z "$DOMAIN_NAME" ]; then
  echo "DOMAIN_NAME must be set in .env.prod"
  exit 1
fi

echo "Renewing certificates using webroot challenge..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile certbot run --rm certbot \
  renew --webroot -w /var/www/certbot --quiet

echo "Reloading nginx to apply renewed certs"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T nginx nginx -s reload

echo "TLS renewal complete."
