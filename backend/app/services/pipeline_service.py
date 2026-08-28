"""
Perception Pipeline Service
Orchestrates: OCR → calibration + symbol detection (parallel) → classifier

With Celery: tasks run async, scan.pipeline_status updated via DB.
Without Celery: runs synchronously in the same thread (graceful fallback).

Stages:
  1. OCR (English + Hindi/Devanagari) with confidence gating
  2. Calibration (reference marker → inspector input → unverified fallback)
  3. Symbol detection (veg/non-veg dot, GM mark) — parallel with calibration
  4. Rule-based classifier with confidence scoring
"""
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# ── Celery setup (optional) ───────────────────────────────────────────────────
CELERY_AVAILABLE = False
celery_app = None

try:
    from celery import Celery
    _broker = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
    _backend = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
    celery_app = Celery("lm_pipeline", broker=_broker, backend=_backend)
    celery_app.conf.task_serializer = "json"
    celery_app.conf.result_serializer = "json"
    CELERY_AVAILABLE = True
    logger.info("Celery configured with broker: %s", _broker)
except ImportError:
    logger.info("Celery not installed — pipeline will run synchronously.")


# ── OCR confidence gate ───────────────────────────────────────────────────────
OCR_CONFIDENCE_THRESHOLD = 40.0  # Below this → flag as low-confidence, still proceed


def run_ocr_stage(image_bytes: bytes) -> dict:
    """
    Run OCR — Groq vision first, Tesseract fallback.
    Returns text, confidence, language, low_confidence flag, source, and
    groq_fields (pre-parsed structured data when Groq vision was used).
    """
    from app.services.ocr_service import extract_text_from_bytes
    result = extract_text_from_bytes(image_bytes)
    result["low_confidence"] = result["confidence"] < OCR_CONFIDENCE_THRESHOLD
    if result["low_confidence"] and result.get("source") != "groq_vision":
        logger.warning(
            "OCR confidence %.1f%% below threshold %.1f%% — results may be unreliable.",
            result["confidence"], OCR_CONFIDENCE_THRESHOLD,
        )
    return result


def run_calibration_stage(image_bytes: bytes,
                           inspector_width_mm: Optional[float] = None,
                           inspector_height_mm: Optional[float] = None,
                           img_width_px: Optional[int] = None,
                           img_height_px: Optional[int] = None) -> dict:
    """Run calibration: auto first, then inspector input, then unverified."""
    from app.services.calibration_service import (
        calibrate_from_image,
        calibrate_from_inspector_input,
    )
    # Try automatic
    cal = calibrate_from_image(image_bytes)
    if cal["method"] != "unverified":
        return cal
    # Try inspector-provided
    if inspector_width_mm and inspector_height_mm and img_width_px and img_height_px:
        return calibrate_from_inspector_input(
            inspector_width_mm, inspector_height_mm, img_width_px, img_height_px
        )
    return cal


def run_symbol_stage(image_bytes: bytes, ocr_text: str, category: str = "general") -> dict:
    """Run symbol detection from image + OCR text."""
    from app.services.symbol_service import detect_symbols, detect_gm_mark_from_text
    symbols = detect_symbols(image_bytes, category=category)
    # Supplement with text-based GM mark detection
    if not symbols.get("gm_mark"):
        symbols["gm_mark"] = detect_gm_mark_from_text(ocr_text)
    return symbols


def run_classifier_stage(scan_context: dict) -> dict:
    """Run the confidence-gated declaration evaluator."""
    from app.services.compliance_engine import evaluate_declarations, _legacy_summary_from_checks

    checks = evaluate_declarations(scan_context)
    return _legacy_summary_from_checks(checks)


def run_pipeline_sync(image_bytes: bytes,
                       category: str = "general",
                       inspector_width_mm: Optional[float] = None,
                       inspector_height_mm: Optional[float] = None,
                       img_width_px: Optional[int] = None,
                       img_height_px: Optional[int] = None) -> dict:
    """
    Run the full pipeline synchronously.
    Returns a combined result dict suitable for writing to the Scan model.

    Stages:
      1. Barcode/QR decode + Open Food Facts lookup (fast, runs first)
      2. OCR (English + Hindi)
      3. Calibration + Symbol detection
      4. Rule-based compliance classifier
      5. Groq LLM structured extraction (optional, enriches fields)
    """
    # ── Stage 1: Barcode detection ────────────────────────────────────────────
    from app.services.barcode_service import scan_barcodes_full
    barcode_result = scan_barcodes_full(image_bytes)
    barcode_product = barcode_result.get("product_info", {})

    # ── Stage 2: OCR ──────────────────────────────────────────────────────────
    ocr = run_ocr_stage(image_bytes)
    raw_text = ocr["text"]
    ocr_confidence = ocr["confidence"]
    ocr_low = ocr["low_confidence"]
    # If Groq vision was used, structured fields are already available — skip
    # the separate Groq text extraction step to avoid a redundant API call.
    groq_vision_fields = ocr.get("groq_fields", {})

    # ── Stages 3a & 3b: Calibration + Symbol detection ────────────────────────
    calibration = run_calibration_stage(
        image_bytes, inspector_width_mm, inspector_height_mm,
        img_width_px, img_height_px,
    )
    symbols = run_symbol_stage(image_bytes, raw_text, category)

    # ── Stage 4: Groq LLM structured extraction ───────────────────────────────
    # If Groq vision already ran during OCR stage, reuse those fields directly.
    # Otherwise send the Tesseract text to the Groq text model.
    from app.services.groq_service import extract_structured
    field_confidences = dict(ocr.get("field_confidences") or {})
    if groq_vision_fields:
        groq_fields = groq_vision_fields
        logger.info("Using Groq vision fields — skipping text extraction pass.")
    else:
        structured = extract_structured(raw_text)
        if structured.get("fields") is not None:
            groq_fields = structured.get("fields") or {}
            field_confidences.update(structured.get("field_confidences") or {})
        else:
            groq_fields = structured
    groq_used = bool(groq_fields)

    extracted_fields = dict(groq_fields)
    manufacturer_parts = [
        extracted_fields.get("manufacturer_name"),
        extracted_fields.get("manufacturer_address"),
    ]
    manufacturer_info = ", ".join(part for part in manufacturer_parts if part)
    if manufacturer_info and not extracted_fields.get("manufacturer_info"):
        extracted_fields["manufacturer_info"] = manufacturer_info
        part_confidences = [
            field_confidences.get("manufacturer_name"),
            field_confidences.get("manufacturer_address"),
        ]
        usable_confidences = [float(c) for c in part_confidences if isinstance(c, (int, float))]
        if usable_confidences:
            field_confidences["manufacturer_info"] = sum(usable_confidences) / len(usable_confidences)

    if groq_used:
        logger.info("Using structured extraction fields: %s", list(extracted_fields.keys()))

    # ── Barcode info as highest-priority fallback for key fields ──────────────
    # Open Food Facts data is authoritative — overwrite only if present
    if barcode_product:
        for src_key, dst_key in [
            ("product_name",      "product_name"),
            ("brand_name",        "brand_name"),
            ("manufacturer_name", "manufacturer_info"),
            ("net_quantity",      "net_quantity"),
            ("fssai_number",      "fssai_number"),
            ("country_of_origin", "country_of_origin"),
        ]:
            val = barcode_product.get(src_key)
            if val and not extracted_fields.get(dst_key):
                extracted_fields[dst_key] = val
                field_confidences[dst_key] = 1.0

    # ── Stage 5: Confidence-gated classifier ─────────────────────────────────
    compliance = run_classifier_stage({
        "ocr_text": raw_text,
        "category": category,
        "symbols": symbols,
        "calibration": calibration,
        "extracted_fields": extracted_fields,
        "field_confidences": field_confidences,
        "overall_confidence": ocr_confidence,
        "low_confidence": ocr_low,
    })

    # ── Bounding boxes ────────────────────────────────────────────────────────
    bounding_boxes = _build_bounding_boxes(compliance["extracted_fields"], ocr_confidence)

    # ── Pipeline status ───────────────────────────────────────────────────────
    needs_review = compliance["compliance_summary"]["headline"] == "NeedsManualReview"
    pipeline_status = "review_needed" if needs_review else "complete"

    return {
        "raw_ocr_text": raw_text,
        "ocr_confidence": ocr_confidence,
        "ocr_language": ocr.get("language", "eng"),
        "calibration_method": calibration["method"],
        "calibration_data": calibration,
        "symbols_detected": symbols,
        "barcode_data": barcode_result,
        "groq_used": groq_used,
        "bounding_boxes": bounding_boxes,
        "is_compliant": compliance["is_compliant"],
        "compliance_score": compliance["compliance_score"],
        "field_results": compliance["field_results"],
        "missing_fields": compliance["missing_fields"],
        "extracted_fields": compliance["extracted_fields"],
        "compliance_checks": compliance["compliance_checks"],
        "compliance_summary": compliance["compliance_summary"],
        "remarks": compliance["remarks"],
        "total_fields_checked": compliance["total_fields_checked"],
        "mandatory_fields_present": compliance["mandatory_fields_present"],
        "total_mandatory_fields": compliance["total_mandatory_fields"],
        "pipeline_status": pipeline_status,
        "low_confidence_ocr": ocr_low,
    }


def _build_bounding_boxes(extracted_fields: dict, ocr_confidence: float) -> list:
    """
    Build synthetic bounding box annotations from extracted field values.
    Without actual word-level Tesseract position data this produces placeholder
    annotations that the review UI can display and let officers confirm/correct.
    When Tesseract image_to_data is available, real positions are used.
    """
    boxes = []
    for field_key, value in extracted_fields.items():
        if value:
            boxes.append({
                "field": field_key,
                "text": value,
                "confidence": round(ocr_confidence / 100, 2),
                "confirmed": ocr_confidence >= OCR_CONFIDENCE_THRESHOLD,
                "bbox": None,  # [x, y, w, h] — populated by real Tesseract word coords when available
            })
    return boxes


# ── Celery tasks (only registered if Celery is available) ─────────────────────

if CELERY_AVAILABLE and celery_app:
    @celery_app.task(bind=True, name="pipeline.run", max_retries=2)
    def run_pipeline_task(self, scan_id: str, image_path: str, category: str):
        """
        Celery task: run pipeline on a saved image, update scan record in DB.
        """
        from app.database import SessionLocal
        from app.models.scan import Scan

        db = SessionLocal()
        try:
            scan = db.query(Scan).filter(Scan.scan_id == scan_id).first()
            if not scan:
                return {"error": "Scan not found"}

            scan.pipeline_status = "processing"
            db.commit()

            with open(image_path, "rb") as f:
                image_bytes = f.read()

            result = run_pipeline_sync(image_bytes, category=category)

            for key, val in result.items():
                if hasattr(scan, key):
                    setattr(scan, key, val)

            db.commit()
            return {"scan_id": scan_id, "status": scan.pipeline_status}

        except Exception as exc:
            if scan:
                scan.pipeline_status = "failed"
                db.commit()
            raise self.retry(exc=exc, countdown=5)
        finally:
            db.close()
