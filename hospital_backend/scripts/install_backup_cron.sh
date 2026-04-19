#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BACKUP_SCRIPT="$ROOT_DIR/scripts/backup_postgres.sh"
CRON_SCHEDULE="${CRON_SCHEDULE:-0 2 * * *}"

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab command not found. Install cron first."
  exit 1
fi

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -v "backup_postgres.sh" > "$TMP_CRON" || true
echo "$CRON_SCHEDULE $BACKUP_SCRIPT >> /var/log/hospital_backup.log 2>&1" >> "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"

echo "Cron job installed: $CRON_SCHEDULE"
