"""
One-time migration: add new columns to existing scans table.
SQLite does not support ALTER TABLE ... ADD COLUMN for multiple columns at once,
so we do them one by one. Safe to re-run — skips columns that already exist.
"""
from app.database import engine
from sqlalchemy import text

NEW_SCAN_COLUMNS = [
    ("pipeline_status",    "VARCHAR"),
    ("ocr_confidence",     "FLOAT"),
    ("ocr_language",       "VARCHAR"),
    ("image_paths",        "JSON"),
    ("bounding_boxes",     "JSON"),
    ("calibration_method", "VARCHAR"),
    ("calibration_data",   "JSON"),
    ("symbols_detected",   "JSON"),
    ("barcode_data",       "JSON"),
    ("groq_used",          "BOOLEAN"),
    ("product_id",         "INTEGER"),
    ("review_status",      "VARCHAR"),
    ("reviewed_by_id",     "INTEGER"),
    ("reviewed_at",        "DATETIME"),
]

# Also create any completely new tables (manufacturers, products, rules, etc.)
# by importing all models and calling create_all
import app.models  # noqa: F401 — registers all models
from app.database import Base
Base.metadata.create_all(bind=engine)
print("create_all() done — new tables created if missing.")

with engine.connect() as conn:
    result = conn.execute(text("PRAGMA table_info(scans)"))
    existing = {row[1] for row in result.fetchall()}
    print(f"Existing scans columns: {existing}")

    for col, col_type in NEW_SCAN_COLUMNS:
        if col not in existing:
            conn.execute(text(f"ALTER TABLE scans ADD COLUMN {col} {col_type}"))
            print(f"  + Added column: {col} ({col_type})")
        else:
            print(f"  = Already exists: {col}")

    conn.commit()

print("\nMigration complete. Restart uvicorn.")
