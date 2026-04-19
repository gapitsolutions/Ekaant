#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RENEW_SCRIPT="$ROOT_DIR/scripts/renew_tls_cert.sh"
CRON_SCHEDULE="${CRON_SCHEDULE:-20 3 * * *}"

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab command not found. Install cron first."
  exit 1
fi

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -v "renew_tls_cert.sh" > "$TMP_CRON" || true
echo "$CRON_SCHEDULE $RENEW_SCRIPT >> /var/log/hospital_tls_renew.log 2>&1" >> "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"

echo "TLS renew cron installed: $CRON_SCHEDULE"
