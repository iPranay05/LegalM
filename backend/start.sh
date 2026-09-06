#!/bin/sh
# Entrypoint for production (Render free tier).
# Runs DB migrations, seeds default data, starts Celery worker in the
# background, then starts uvicorn in the foreground.
set -e

echo "==> Running database migrations..."
alembic upgrade head

echo "==> Seeding default data (safe to run multiple times)..."
python seed.py || echo "Seed skipped (already seeded or seed.py not found)"

echo "==> Starting Celery worker in background..."
celery -A app.services.pipeline_service.celery_app worker \
  --loglevel=info --concurrency=1 &

echo "==> Starting API server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
