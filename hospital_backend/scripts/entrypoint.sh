#!/usr/bin/env sh
set -eu

echo "Waiting for PostgreSQL at ${DB_HOST:-postgres}:${DB_PORT:-5432}..."

python - <<'PY'
import os
import time
import psycopg2

host = os.getenv("DB_HOST", "postgres")
port = int(os.getenv("DB_PORT", "5432"))
name = os.getenv("DB_NAME", "hospital_db")
user = os.getenv("DB_USER", "postgres")
password = os.getenv("DB_PASSWORD", "postgres")

max_attempts = 30
for attempt in range(1, max_attempts + 1):
    try:
        conn = psycopg2.connect(
            dbname=name,
            user=user,
            password=password,
            host=host,
            port=port,
        )
        conn.close()
        print("PostgreSQL is ready.")
        break
    except Exception as exc:
        if attempt == max_attempts:
            raise SystemExit(f"Database not reachable after {max_attempts} attempts: {exc}")
        time.sleep(2)
PY

exec "$@"
