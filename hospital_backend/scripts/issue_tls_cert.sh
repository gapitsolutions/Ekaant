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
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
CERTBOT_STAGING="${CERTBOT_STAGING:-false}"

if [ -z "$DOMAIN_NAME" ] || [ -z "$CERTBOT_EMAIL" ]; then
  echo "DOMAIN_NAME and CERTBOT_EMAIL must be set in .env.prod"
  exit 1
fi

echo "Stopping nginx (if running) to free port 80 for certbot standalone..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop nginx || true

STAGING_FLAG=""
if [ "$CERTBOT_STAGING" = "true" ]; then
  STAGING_FLAG="--staging"
  echo "Using Let's Encrypt staging mode"
fi

echo "Requesting certificate for $DOMAIN_NAME"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile certbot run --rm --service-ports certbot \
  certonly --standalone --non-interactive --agree-tos --email "$CERTBOT_EMAIL" -d "$DOMAIN_NAME" $STAGING_FLAG

echo "Starting nginx with TLS config"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d nginx

echo "TLS certificate issuance complete."
