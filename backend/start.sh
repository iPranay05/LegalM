#!/bin/sh
# Production entrypoint for Render free tier.
# Handles: migrations → seed → celery worker (bg) → uvicorn (fg)
set -e

echo "==> Running database migrations..."

python - <<'PYEOF'
from sqlalchemy import create_engine, inspect, text
from app.config import settings

# The head revision — update this if new migrations are added
HEAD_REVISION = 'e5f9a2b4c6d8'

engine = create_engine(settings.DATABASE_URL)
inspector = inspect(engine)
tables = inspector.get_table_names()

has_alembic = 'alembic_version' in tables
has_schema  = 'manufacturers' in tables

if not has_schema:
    # Truly empty database — let alembic run the full migration chain
    print("Fresh database — full migration will run.")
else:
    # Schema already fully exists (from a previous deploy or local run).
    # Find out what revision alembic thinks it's at, if any.
    with engine.connect() as conn:
        # Ensure the alembic_version table exists
        conn.execute(text(
            "CREATE TABLE IF NOT EXISTS alembic_version "
            "(version_num VARCHAR(32) NOT NULL, "
            "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
        ))
        row = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).fetchone()
        current = row[0] if row else None
        print(f"Current alembic revision: {current}")

        if current != HEAD_REVISION:
            print(f"Schema is fully migrated but revision is '{current}' not '{HEAD_REVISION}'.")
            print(f"Force-updating alembic_version to head ({HEAD_REVISION})...")
            conn.execute(text("DELETE FROM alembic_version"))
            conn.execute(text(f"INSERT INTO alembic_version (version_num) VALUES ('{HEAD_REVISION}')"))
            conn.commit()
            print("Done — alembic upgrade head will now be a no-op.")
        else:
            print(f"Already at head ({HEAD_REVISION}) — no action needed.")
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
