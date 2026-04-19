#!/usr/bin/env sh
set -eu

APP_ROOT="${APP_ROOT:-/srv/hospital/app}"
PERSIST_ROOT="${PERSIST_ROOT:-/srv/hospital}"

echo "Creating persistent directories..."
sudo mkdir -p "$PERSIST_ROOT/postgres" "$PERSIST_ROOT/media" "$PERSIST_ROOT/staticfiles" "$PERSIST_ROOT/backups" "$PERSIST_ROOT/env" "$PERSIST_ROOT/letsencrypt" "$PERSIST_ROOT/certbot-www"

if [ ! -d "$APP_ROOT/.git" ]; then
  echo "Cloning repository into $APP_ROOT"
  sudo mkdir -p "$APP_ROOT"
  sudo chown -R "$USER":"$USER" "$APP_ROOT"
  git clone <YOUR_GIT_REPO_URL> "$APP_ROOT"
fi

cd "$APP_ROOT/hospital_backend"

if [ ! -f ".env.prod" ]; then
  cp .env.prod.example .env.prod
  echo "Created .env.prod from template. Update secrets before deployment."
fi

chmod +x scripts/*.sh

./scripts/deploy_backend.sh

echo "Bootstrap complete."
