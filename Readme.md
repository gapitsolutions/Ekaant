# Hospital Backend Full Setup Runbook (Docker + Nginx + TLS + Cron)

This guide is a complete end-to-end production setup for the backend stack in this repository.

Scope covered:

- VM preparation
- Docker and Compose installation
- directory layout and permissions
- environment configuration
- first deployment
- nginx + TLS issuance and renewal
- database backup/restore and retention
- cron setup and validation
- day-2 operations (logs, restart, update, rollback basics)
- troubleshooting checklist

Assumptions:

- Frontend is hosted separately (for example Vercel).
- Backend VM is Linux (Ubuntu 22.04/24.04 recommended).
- Domain points to this VM for API traffic.
- You run commands as a sudo-capable user.

---

## 1) Final Architecture (What runs where)

Services in `docker-compose.prod.yml`:

- `postgres`:
  - Stores DB data in host bind mount.
- `backend` (Django + Gunicorn):
  - Runs migrations and serves API.
  - Also serves Django static files through WhiteNoise.
  - Serves protected media through authenticated API endpoints.
- `nginx`:
  - Public entrypoint on ports 80/443.
  - Terminates TLS.
  - Proxies to backend service.
- `certbot` (profile-based, on demand):
  - Issues and renews certificates.

Persistent host paths (default):

- `/srv/hospital/postgres`
- `/srv/hospital/media`
- `/srv/hospital/staticfiles`
- `/srv/hospital/backups`
- `/srv/hospital/letsencrypt`
- `/srv/hospital/certbot-www`

---

## 2) Preflight Requirements

## 2.1 Domain and DNS

Create DNS record before TLS issuance:

- Type: `A`
- Host: your API subdomain (example `api`)
- Value: VM public IPv4
- TTL: 300 (or provider default)

Validate:

```bash
nslookup api.yourdomain.com
```

Expected: resolves to VM IP.

## 2.2 Firewall and cloud security rules

Open inbound ports:

- `22` (SSH)
- `80` (HTTP, required for first cert issue and renewal challenge)
- `443` (HTTPS)

Optional:

- Restrict SSH source IPs.

## 2.3 VM sizing recommendation

Minimum practical:

- 2 vCPU
- 4 GB RAM
- 40+ GB SSD

Recommended for stable production:

- 4 vCPU
- 8 GB RAM
- 80+ GB SSD

---

## 3) Install Docker + Compose Plugin (Ubuntu)

Run on fresh VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker "$USER"
```

Important:

- Log out and log back in once so `docker` works without `sudo`.

Validate:

```bash
docker --version
docker compose version
```

---

## 4) Clone Repo and Prepare Directories

## 4.1 Option A: Use bootstrap script (quick)

```bash
cd /srv
sudo mkdir -p hospital
sudo chown -R "$USER":"$USER" /srv/hospital

# Clone app repo root into /srv/hospital/app
cd /srv/hospital
git clone <YOUR_GIT_REPO_URL> app

cd /srv/hospital/app/hospital_backend
chmod +x scripts/*.sh
```

The script `scripts/bootstrap_backend_vm.sh` can also create dirs and run deploy.

## 4.2 Option B: Manual setup (explicit)

```bash
sudo mkdir -p \
  /srv/hospital/postgres \
  /srv/hospital/media \
  /srv/hospital/staticfiles \
  /srv/hospital/backups \
  /srv/hospital/env \
  /srv/hospital/letsencrypt \
  /srv/hospital/certbot-www

sudo chown -R "$USER":"$USER" /srv/hospital
```

---

## 5) Environment File Setup (.env.prod)

From repository root `hospital_backend`:

```bash
cp .env.prod.example .env.prod
```

Update all sensitive and environment-specific values.

## 5.1 Required variables checklist

Identity/security:

- `DEBUG=False`
- `SECRET_KEY=<strong-random-secret>`
- `ALLOWED_HOSTS=api.yourdomain.com,127.0.0.1`
- `COOKIE_SECURE=True`

Database:

- `DB_NAME=hospital_db`
- `DB_USER=postgres`
- `DB_PASSWORD=<strong-db-password>`
- `DB_HOST=postgres`
- `DB_PORT=5432`

Postgres container init:

- `POSTGRES_DB=hospital_db`
- `POSTGRES_USER=postgres`
- `POSTGRES_PASSWORD=<same-as-db-password-or-planned-value>`

Important for first initialization:

- If `DB_USER` and `POSTGRES_USER` are the same user (default `postgres`), keep `DB_PASSWORD` and `POSTGRES_PASSWORD` identical.
- Changing `POSTGRES_PASSWORD` later does not reinitialize existing Postgres data in `/srv/hospital/postgres`.

Frontend integration:

- `CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app`
- `CSRF_TRUSTED_ORIGINS=https://your-frontend.vercel.app`

TLS:

- `DOMAIN_NAME=api.yourdomain.com`
- `CERTBOT_EMAIL=ops@yourdomain.com`
- `CERTBOT_STAGING=false`

Django paths (container internal):

- `MEDIA_ROOT=/app/backend/media`
- `STATIC_ROOT=/app/backend/staticfiles`

Superuser bootstrap:

- `DJANGO_SUPERUSER_EMAIL=admin@yourdomain.com`
- `DJANGO_SUPERUSER_PASSWORD=<strong-admin-password>`
- `DJANGO_SUPERUSER_FULL_NAME=Administrator`

Persistent host paths:

- `POSTGRES_DATA_PATH=/srv/hospital/postgres`
- `MEDIA_PATH=/srv/hospital/media`
- `STATIC_PATH=/srv/hospital/staticfiles`
- `BACKUP_DIR=/srv/hospital/backups`
- `BACKUP_RETENTION_DAYS=14`
- `LETSENCRYPT_PATH=/srv/hospital/letsencrypt`
- `CERTBOT_WWW_PATH=/srv/hospital/certbot-www`

---

## 6) First Deployment (Backend + DB)

From `hospital_backend` directory:

```bash
chmod +x scripts/*.sh
./scripts/deploy_backend.sh
```

What `deploy_backend.sh` does:

1. Checks `.env.prod` exists.
2. Optional `git pull --ff-only` when git is available.
3. Builds backend image.
4. Starts `postgres`.
5. Runs Django migrations.
6. Runs `collectstatic --noinput`.
7. Runs idempotent superuser creation/update.
8. Starts backend service.
9. Starts nginx only if TLS cert already exists.
10. Prunes dangling images.

It also performs an early env validation and stops immediately if `DB_PASSWORD`/`POSTGRES_PASSWORD` are inconsistent for the same DB user.

Expected first run behavior:

- Backend and Postgres come up.
- nginx may not start yet (until cert exists).

Check status:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Check logs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f postgres
```

Health checks:

```bash
curl -s http://<VM_IP>/healthz/
curl -s http://<VM_IP>/api/v1/health/
```

---

## 7) TLS Certificate Issuance (First Time)

Prerequisites:

- `DOMAIN_NAME` resolves to VM IP.
- Port `80` open publicly.

Run:

```bash
./scripts/issue_tls_cert.sh
```

What it does:

1. Stops nginx temporarily to free port 80.
2. Runs certbot standalone challenge via certbot profile.
3. Stores certs in `/srv/hospital/letsencrypt`.
4. Starts nginx with TLS config.

Verify TLS:

```bash
curl -I https://api.yourdomain.com/healthz/
```

Expected:

- HTTP status from backend through nginx.
- Valid certificate chain for your domain.

---

## 8) Nginx Behavior in This Stack

Current template behavior:

- Port 80 server:
  - serves ACME challenge path `/.well-known/acme-challenge/`
  - proxies `/healthz/`
  - redirects all other paths to HTTPS
- Port 443 server:
  - loads cert from `/etc/letsencrypt/live/${DOMAIN_NAME}/...`
  - proxies all traffic to `backend:8000`

Notes:

- nginx is reverse proxy only in this setup.
- Static is served by Django WhiteNoise (not direct nginx alias).
- Media access follows backend auth rules.

---

## 9) Static Files, Media, and Data Persistence

Static:

- Collected during deploy via `python manage.py collectstatic --noinput`.
- Stored in container path `/app/backend/staticfiles`.
- Persisted on host at `/srv/hospital/staticfiles` through bind mount.
- Served by backend WhiteNoise middleware.

Media:

- Stored in container `/app/backend/media`.
- Persisted on host at `/srv/hospital/media`.
- Served via protected backend API endpoints.

Database:

- Postgres data persisted in `/srv/hospital/postgres`.

---

## 10) Cron Jobs (Backups and TLS Renew)

Important:

- Scripts install jobs into current user crontab.
- Ensure cron daemon is installed and running.

Install/enable cron if needed:

```bash
sudo apt-get install -y cron
sudo systemctl enable cron
sudo systemctl start cron
```

## 10.1 Database backup cron

Install with default schedule (2:00 AM daily):

```bash
./scripts/install_backup_cron.sh
```

Install custom schedule example (1:30 AM daily):

```bash
CRON_SCHEDULE="30 1 * * *" ./scripts/install_backup_cron.sh
```

What backup script does:

- `pg_dump` from `postgres` service
- gzip output to `BACKUP_DIR/hospital_db_YYYY-MM-DD_HH-MM-SS.sql.gz`
- delete backup files older than `BACKUP_RETENTION_DAYS`

Backup cron log file:

- `/var/log/hospital_backup.log`

## 10.2 TLS renew cron

Install with default schedule (3:20 AM daily):

```bash
./scripts/install_tls_renew_cron.sh
```

Install custom schedule example (4:15 AM daily):

```bash
CRON_SCHEDULE="15 4 * * *" ./scripts/install_tls_renew_cron.sh
```

What renew script does:

- certbot renew with webroot challenge
- nginx reload after renewal

TLS renew cron log file:

- `/var/log/hospital_tls_renew.log`

## 10.3 Validate crontab entries

```bash
crontab -l
```

You should see entries ending with:

- `backup_postgres.sh >> /var/log/hospital_backup.log 2>&1`
- `renew_tls_cert.sh >> /var/log/hospital_tls_renew.log 2>&1`

---

## 11) Manual Backup and Restore Operations

## 11.1 Run a manual backup now

```bash
./scripts/backup_postgres.sh
ls -lah /srv/hospital/backups
```

## 11.2 Restore from backup file

```bash
./scripts/restore_postgres.sh /srv/hospital/backups/hospital_db_YYYY-MM-DD_HH-MM-SS.sql.gz
```

Safety recommendation:

- Always take a fresh backup immediately before restore.
- Prefer restoring into maintenance window.

---

## 12) Day-2 Operations (Routine Commands)

All commands from `hospital_backend` directory.

Status:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Tail logs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f nginx
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f postgres
```

Restart one service:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod restart backend
```

Redeploy after code update:

```bash
git pull --ff-only
./scripts/deploy_backend.sh
```

Open Django shell:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend python manage.py shell
```

Run ad-hoc migration:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py migrate
```

---

## 13) Full Verification Checklist (Go-Live)

After first complete setup:

1. `docker compose ps` shows healthy services.
2. `http://<VM_IP>/healthz/` works.
3. `https://api.yourdomain.com/healthz/` works with valid cert.
4. API login/auth flow works from frontend domain.
5. Patient create/edit/read works.
6. Media upload works and files appear in `/srv/hospital/media`.
7. Static assets load with no 404 regressions.
8. `backup_postgres.sh` creates a file in `/srv/hospital/backups`.
9. `crontab -l` includes backup and TLS jobs.
10. `/var/log/hospital_backup.log` and `/var/log/hospital_tls_renew.log` are writable.

---

## 14) Troubleshooting

## 14.1 nginx not starting after deploy

Check cert files:

```bash
ls -lah /srv/hospital/letsencrypt/live/${DOMAIN_NAME}
```

If missing, run:

```bash
./scripts/issue_tls_cert.sh
```

## 14.2 Certificate issuance fails

Check:

- DNS A record points to VM.
- Port 80 open in firewall/security group.
- No other process occupies port 80.

Debug:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile certbot run --rm --service-ports certbot \
  certonly --standalone --agree-tos --email "$CERTBOT_EMAIL" -d "$DOMAIN_NAME" -v
```

## 14.3 DB connection errors from backend

Validate env values in `.env.prod`:

- `DB_HOST=postgres`
- `DB_PORT=5432`
- credentials match Postgres vars.

Check postgres logs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f postgres
```

## 14.4 CORS/CSRF blocked requests from frontend

Ensure exact frontend origin in:

- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`

Must include scheme (`https://`).

## 14.5 Cron appears installed but not running

Check cron service:

```bash
sudo systemctl status cron
```

Check user crontab:

```bash
crontab -l
```

Check log files:

```bash
tail -n 200 /var/log/hospital_backup.log
tail -n 200 /var/log/hospital_tls_renew.log
```

## 14.6 FATAL: password authentication failed for user postgres

Why this happens:

- Credentials in `.env.prod` are mismatched (`DB_PASSWORD` vs `POSTGRES_PASSWORD`) for the same DB user.
- Or Postgres data already exists from an older password in `/srv/hospital/postgres`.

Fix path (keep existing data):

1. Set a new known password inside running Postgres:

```bash
docker exec -u postgres hospital_postgres psql -d hospital_db -c "ALTER USER postgres WITH PASSWORD 'YourStrongNewPassword';"
```

2. Update `.env.prod` so all of these match:

- `DB_USER=postgres`
- `POSTGRES_USER=postgres`
- `DB_PASSWORD=YourStrongNewPassword`
- `POSTGRES_PASSWORD=YourStrongNewPassword`

3. Redeploy:

```bash
./scripts/deploy_backend.sh
```

Reset path (destructive, only when you do not need old DB data):

```bash
cd /srv/hospital/app/hospital_backend
docker compose -f docker-compose.prod.yml --env-file .env.prod down
sudo rm -rf /srv/hospital/postgres/*
./scripts/deploy_backend.sh
```

---

## 15) Security Hardening Recommendations

Minimum:

- Strong unique secrets for `SECRET_KEY`, DB password, superuser password.
- Keep `DEBUG=False`.
- Limit `ALLOWED_HOSTS` to required hosts.
- Restrict SSH ingress to trusted IPs.
- Keep VM and Docker updated monthly.

Recommended:

- Enable unattended security upgrades.
- Add external uptime monitor on `/healthz/`.
- Send backup files to off-VM object storage (secondary copy).
- Add fail2ban and SSH key-only login.
- Rotate superuser password periodically.

---

## 16) Disaster Recovery Drill (Suggested Monthly)

1. Create fresh backup:

```bash
./scripts/backup_postgres.sh
```

2. On staging VM, deploy same stack.

3. Restore latest backup:

```bash
./scripts/restore_postgres.sh /srv/hospital/backups/<latest-backup>.sql.gz
```

4. Verify critical records and login.

5. Document RTO/RPO and any failures.

---

## 17) Quick Command Reference

Initial deploy:

```bash
./scripts/deploy_backend.sh
```

First TLS issue:

```bash
./scripts/issue_tls_cert.sh
```

Manual TLS renew:

```bash
./scripts/renew_tls_cert.sh
```

Install backup cron:

```bash
./scripts/install_backup_cron.sh
```

Install TLS renew cron:

```bash
./scripts/install_tls_renew_cron.sh
```

Manual backup:

```bash
./scripts/backup_postgres.sh
```

Restore backup:

```bash
./scripts/restore_postgres.sh /path/to/file.sql.gz
```

---

If you want, next step can be adding a second companion runbook for zero-downtime deploy strategy (blue/green or canary) with this same stack.
