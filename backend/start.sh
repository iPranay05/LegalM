#!/bin/sh
# Production entrypoint for Render free tier.
# Handles: migrations → seed → celery worker (bg) → uvicorn (fg)
set -e

echo "==> Running database migrations..."

# Detect the state of the database and handle all three cases:
#   1. Brand-new DB (no tables)         → run full upgrade head normally
#   2. Existing schema, no alembic_version → stamp to head, skip all migrations
#   3. Existing schema, has alembic_version → upgrade head normally (idempotent)
python - <<'PYEOF'
import sys
from sqlalchemy import create_engine, inspect, text
from app.config import settings

engine = create_engine(settings.DATABASE_URL)
inspector = inspect(engine)
tables = inspector.get_table_names()

has_alembic = "alembic_version" in tables
has_schema  = "manufacturers" in tables  # reliable proxy for "fully migrated"

if has_schema and not has_alembic:
    print("Schema exists but no alembic_version table — stamping to head...")
    with engine.connect() as conn:
        conn.execute(text(
            "CREATE TABLE IF NOT EXISTS alembic_version "
            "(version_num VARCHAR(32) NOT NULL, "
            "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
        ))
        conn.execute(text("DELETE FROM alembic_version"))
        # Stamp directly to the latest revision so alembic upgrade head is a no-op
        conn.execute(text(
            "INSERT INTO alembic_version (version_num) "
            "VALUES ('e5f9a2b4c6d8')"
        ))
        conn.commit()
    print("Stamped to e5f9a2b4c6d8 (head). No migrations will run.")
elif not has_schema:
    print("Fresh database — full migration will run.")
else:
    print("alembic_version present — running incremental upgrade.")
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
