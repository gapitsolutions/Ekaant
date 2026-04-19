#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/backup.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.prod}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
. "$ENV_FILE"

DB_NAME="${DB_NAME:-hospital_db}"
DB_USER="${DB_USER:-postgres}"

echo "Restoring backup into $DB_NAME..."

gunzip -c "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "$DB_USER" -d "$DB_NAME"

echo "Restore complete."
