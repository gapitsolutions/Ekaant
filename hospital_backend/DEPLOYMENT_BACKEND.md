# Backend Deployment (Docker on VM)

This guide is backend-only. Frontend can remain on Vercel.

## 1. What Was Added

- `Dockerfile` for Django + Gunicorn
- `docker-compose.prod.yml` with `postgres`, `backend`, `nginx`, `certbot`
- `scripts/entrypoint.sh` (waits for DB)
- `scripts/deploy_backend.sh` (build, migrate, collectstatic, create superuser, start backend and conditionally nginx)
- `scripts/create_superuser.sh` (idempotent admin creation)
- `scripts/backup_postgres.sh` (backup + retention cleanup)
- `scripts/restore_postgres.sh` (restore from backup)
- `scripts/install_backup_cron.sh` (installs DB backup cron)
- `scripts/issue_tls_cert.sh` (first certificate issuance)
- `scripts/renew_tls_cert.sh` (certificate renewal + nginx reload)
- `scripts/install_tls_renew_cron.sh` (installs TLS renewal cron)
- `scripts/bootstrap_backend_vm.sh` (one-time bootstrap helper)
- `nginx/default.conf.template` (domain + TLS + certbot challenge layout)
- `.env.prod.example`
- health endpoints: `/healthz/` and `/api/v1/health/`
- `seed_hospital` command removed

## 2. Persistent Storage Design

Use bind mounts on VM so data survives container deletion/recreation:

- Postgres data: `/srv/hospital/postgres`
- Media files: `/srv/hospital/media`
- Static files: `/srv/hospital/staticfiles`
- Backups: `/srv/hospital/backups`
- TLS certs: `/srv/hospital/letsencrypt`
- Certbot webroot: `/srv/hospital/certbot-www`

Data is lost only if VM storage is deleted.

## 3. One-Time VM Setup

```bash
sudo mkdir -p /srv/hospital/postgres /srv/hospital/media /srv/hospital/staticfiles /srv/hospital/backups /srv/hospital/env /srv/hospital/letsencrypt /srv/hospital/certbot-www
cd /srv/hospital
git clone <YOUR_GIT_REPO_URL> app
cd /srv/hospital/app/hospital_backend
cp .env.prod.example .env.prod
chmod +x scripts/*.sh
```

Update `.env.prod` values before first deploy:

- `SECRET_KEY`
- `DB_PASSWORD`
- `POSTGRES_PASSWORD`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `DJANGO_SUPERUSER_EMAIL`
- `DJANGO_SUPERUSER_PASSWORD`
- `DOMAIN_NAME`
- `CERTBOT_EMAIL`

## 4. Deploy Workflow

```bash
cd /srv/hospital/app/hospital_backend
./scripts/deploy_backend.sh
```

What this does:

1. build backend image
2. start postgres
3. run migrations
4. run collectstatic
5. create/update superuser
6. start backend
7. start nginx only if TLS cert files already exist
8. prune old dangling images

## 5. Verify

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl -s http://<VM_IP>/healthz/
curl -s http://<VM_IP>/api/v1/health/
```

Photo persistence check:

1. upload a patient photo
2. confirm file under `/srv/hospital/media`
3. restart containers and verify photo still serves

## 6. TLS Certificate Issuance (Let's Encrypt)

After first deploy (backend is running), issue cert:

```bash
./scripts/issue_tls_cert.sh
```

This script:

1. stops nginx temporarily
2. runs certbot standalone challenge on port 80
3. writes certs into `/srv/hospital/letsencrypt`
4. restarts nginx with TLS config

Verify:

```bash
curl -I https://<your-domain>/healthz/
```

## 7. Existing Postgres Data Migration

If your old container already has data:

```bash
# On VM host (old running container name assumed hospital_postgres)
docker exec hospital_postgres pg_dump -U postgres -d hospital_db > /srv/hospital/backups/hospital_db.sql
```

Start new stack first:

```bash
cd /srv/hospital/app/hospital_backend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres
```

Restore:

```bash
cat /srv/hospital/backups/hospital_db.sql | docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres psql -U postgres -d hospital_db
```

## 8. Backups + Retention

Manual backup:

```bash
./scripts/backup_postgres.sh
```

Install daily backup cron (default 2:00 AM):

```bash
./scripts/install_backup_cron.sh
```

Override schedule example:

```bash
CRON_SCHEDULE="30 1 * * *" ./scripts/install_backup_cron.sh
```

Retention is controlled by `BACKUP_RETENTION_DAYS` in `.env.prod`.

## 9. TLS Renew + Cron

Manual renew:

```bash
./scripts/renew_tls_cert.sh
```

Install daily TLS renew cron (default 3:20 AM):

```bash
./scripts/install_tls_renew_cron.sh
```

Custom schedule:

```bash
CRON_SCHEDULE="15 4 * * *" ./scripts/install_tls_renew_cron.sh
```

## 10. Restore From Compressed Backup

```bash
./scripts/restore_postgres.sh /srv/hospital/backups/hospital_db_YYYY-MM-DD_HH-MM-SS.sql.gz
```

## 11. Notes

- Media is not served as public `/media` in production debug mode; app serves protected media through authenticated API endpoints.
- Health endpoints are intentionally unauthenticated for uptime checks.
- `seed_hospital` command has been removed intentionally.
