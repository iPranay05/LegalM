#!/bin/sh
# Production entrypoint for Render free tier.
# Handles: migrations → seed → celery worker (bg) → uvicorn (fg)
set -e

echo "==> Running database migrations..."

# If the alembic_version table does not exist yet the DB is either brand-new
# (run upgrade head normally) or was created outside of Alembic (stamp first
# so Alembic knows the schema is already at baseline, then upgrade to head).
python - <<'PYEOF'
import sys
from sqlalchemy import create_engine, inspect, text
from app.config import settings

engine = create_engine(settings.DATABASE_URL)
with engine.connect() as conn:
    tables = inspect(engine).get_table_names()
    has_alembic = "alembic_version" in tables
    has_tables  = "manufacturers" in tables   # proxy for "schema already exists"

    if has_tables and not has_alembic:
        print("Schema exists but no alembic_version — stamping baseline...")
        conn.execute(text(
            "CREATE TABLE IF NOT EXISTS alembic_version "
            "(version_num VARCHAR(32) NOT NULL, CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
        ))
        conn.execute(text("DELETE FROM alembic_version"))
        conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('0339113e0bab')"))
        conn.commit()
        print("Stamped.")
    elif not has_tables:
        print("Fresh database — will run full migration.")
    else:
        print("Alembic version table present — proceeding normally.")
PYEOF

alembic upgrade head
echo "==> Migrations complete."

echo "==> Seeding default data..."
python seed.py || echo "Seed skipped (already seeded or error — continuing)"

echo "==> Starting Celery worker in background..."
celery -A app.services.pipeline_service.celery_app worker \
  --loglevel=info --concurrency=1 &

echo "==> Starting API server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
