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

BACKUP_DIR="${BACKUP_DIR:-/srv/hospital/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DB_NAME="${DB_NAME:-hospital_db}"
DB_USER="${DB_USER:-postgres}"

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
OUT_FILE="$BACKUP_DIR/hospital_db_$STAMP.sql.gz"

echo "Creating backup: $OUT_FILE"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$OUT_FILE"

echo "Removing backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -type f -name "hospital_db_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

echo "Backup complete."
