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

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found. Install Docker before running this script."
  exit 1
fi

max_attempts="${DOCKER_WAIT_ATTEMPTS:-30}"
sleep_seconds="${DOCKER_WAIT_SLEEP:-2}"
attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  if docker info >/dev/null 2>&1; then
    break
  fi
  echo "Waiting for Docker daemon to be ready ($attempt/$max_attempts)..."
  sleep "$sleep_seconds"
  attempt=$((attempt + 1))
done

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon not ready after $max_attempts attempts."
  exit 1
fi

# shellcheck disable=SC1090
. "$ENV_FILE"

echo "Starting postgres..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres

echo "Starting backend..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d backend

DOMAIN_NAME="${DOMAIN_NAME:-}"
LETSENCRYPT_PATH="${LETSENCRYPT_PATH:-/srv/hospital/letsencrypt}"

if [ -n "$DOMAIN_NAME" ] && [ -f "$LETSENCRYPT_PATH/live/$DOMAIN_NAME/fullchain.pem" ]; then
  echo "Starting nginx with TLS for $DOMAIN_NAME..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d nginx
else
  echo "Skipping nginx: TLS certificate not found for DOMAIN_NAME='${DOMAIN_NAME:-unset}'."
  echo "Run scripts/issue_tls_cert.sh after DNS is configured, then start nginx."
fi

echo "Restart complete."