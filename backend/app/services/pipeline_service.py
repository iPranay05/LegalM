"""
Perception Pipeline Service
Orchestrates: OCR → calibration + symbol detection (parallel) → classifier

Mandatory Asynchronous Pipeline (Celery + Redis).
Every scan upload enqueues a background task and immediately returns a pending scan.
No synchronous Perception fallback is permitted.

Stages:
  1. OCR (English + Hindi/Devanagari) with confidence gating
  2. Calibration (reference marker → inspector input → unverified fallback)
  3. Symbol detection (veg/non-veg dot, GM mark) — parallel with calibration
  4. Rule-based classifier with 5-outcome evaluation and confidence scoring
"""
import logging
import os
from typing import Optional
from celery import Celery

logger = logging.getLogger(__name__)

# ── Celery configuration (Mandatory async pipeline) ───────────────────────────
_broker = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
_backend = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")

celery_app = Celery("lm_pipeline", broker=_broker, backend=_backend)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.task_ignore_result = False


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

    # Try inspector input
    if inspector_width_mm and img_width_px:
        return calibrate_from_inspector_input(inspector_width_mm, img_width_px)
    if inspector_height_mm and img_height_px:
        return calibrate_from_inspector_input(inspector_height_mm, img_height_px)

    return cal


def run_symbol_stage(image_bytes: bytes, ocr_text: str = "", category: str = "general") -> dict:
    """Detect veg/non-veg dot and GM mark."""
    from app.services.symbol_service import detect_symbols, detect_gm_mark_from_text
    symbols = detect_symbols(image_bytes)
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
                       img_height_px: Optional[int] = None,
                       db=None,
                       manufacturer_id=None,
                       product_id=None) -> dict:
    """
    Run the full perception pipeline synchronously.
    Used by Celery workers to process an enqueued scan image.
    """
    # ── Stage 1: Barcode/QR decode ───────────────────────────────────────────
    barcode_result = None
    barcode_product = None
    try:
        from app.services.barcode_service import decode_and_lookup
        barcode_result = decode_and_lookup(image_bytes)
        if barcode_result.get("decoded"):
            barcode_product = barcode_result.get("product_info")
    except Exception as e:
        logger.warning("Barcode decoding failed: %s", e)

    # ── Stage 2: OCR ─────────────────────────────────────────────────────────
    ocr = run_ocr_stage(image_bytes)
    raw_text = ocr.get("text", "")
    ocr_confidence = ocr.get("confidence", 0.0)
    ocr_low = ocr.get("low_confidence", False)
    groq_used = ocr.get("source") == "groq_vision"
    extracted_fields = ocr.get("extracted_fields") or ocr.get("groq_fields") or {}
    field_confidences = ocr.get("field_confidences") or {}
    field_bboxes = ocr.get("field_bboxes") or {}

    # ── Stages 3 & 4: Calibration + Symbol detection ─────────────────────────
    calibration = run_calibration_stage(
        image_bytes,
        inspector_width_mm=inspector_width_mm,
        inspector_height_mm=inspector_height_mm,
        img_width_px=img_width_px,
        img_height_px=img_height_px,
    )
    symbols = run_symbol_stage(image_bytes, raw_text, category)

    # Merge barcode metadata into extracted fields if OCR missed them
    if barcode_product:
        for src_key, dst_key in [
            ("product_name",      "product_name"),
            ("brands",            "brand_name"),
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
        "field_bboxes": field_bboxes,
        "image_index": 0,
        "overall_confidence": ocr_confidence,
        "low_confidence": ocr_low,
        "db": db,
        "manufacturer_id": manufacturer_id,
        "product_id": product_id,
    })

    # ── Bounding boxes ────────────────────────────────────────────────────────
    bounding_boxes = _build_bounding_boxes(
        compliance["extracted_fields"], ocr_confidence, field_confidences, field_bboxes
    )

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
        "compliance_checks": compliance.get("compliance_checks", []),
        "compliance_summary": compliance.get("compliance_summary", {}),
        "remarks": compliance["remarks"],
        "pipeline_status": pipeline_status,
    }


def _build_bounding_boxes(extracted_fields: dict, ocr_confidence: float,
                          field_confidences: dict = None, field_bboxes: dict = None) -> list:
    """Build bounding box annotations from extracted field values with real localization."""
    field_confidences = field_confidences or {}
    field_bboxes = field_bboxes or {}
    boxes = []
    for field_key, value in extracted_fields.items():
        if value:
            conf = field_confidences.get(field_key)
            if conf is None:
                conf = round(ocr_confidence / 100, 2)
            bbox = field_bboxes.get(field_key)
            boxes.append({
                "field": field_key,
                "text": value,
                "confidence": round(conf, 2),
                "confirmed": conf >= (OCR_CONFIDENCE_THRESHOLD / 100 if conf <= 1.0 else OCR_CONFIDENCE_THRESHOLD),
                "bbox": bbox,
                "bbox_source": bbox.get("bbox_source") if bbox else None,
            })
    return boxes


# ── Celery task ───────────────────────────────────────────────────────────────

@celery_app.task(bind=True, name="pipeline.run", max_retries=2)
def run_pipeline_task(self, scan_id: str, image_path: str, category: str):
    """
    Celery task: run perception pipeline on a saved image, update scan record in DB.
    """
    from app.database import SessionLocal
    from app.models.scan import Scan
    from app.models.rules import ComplianceCheck, ComplianceCheckResult as ComplianceCheckResultEnum
    from app.models.commodity_category import CommodityCategory
    from app.models.product import Product

    db = SessionLocal()
    scan = None
    try:
        scan = db.query(Scan).filter(Scan.scan_id == scan_id).first()
        if not scan:
            return {"error": "Scan not found"}

        scan.pipeline_status = "processing"
        db.commit()

        with open(image_path, "rb") as f:
            image_bytes = f.read()

        result = run_pipeline_sync(
            image_bytes,
            category=category,
            db=db,
            manufacturer_id=None,
            product_id=scan.product_id,
        )

        for key, val in result.items():
            if hasattr(scan, key) and key != "compliance_checks":
                setattr(scan, key, val)

        # Extract product_name if missing
        extracted = result.get("extracted_fields") or {}
        product_name = scan.product_name or extracted.get("product_name")
        if not product_name:
            raw_text = result.get("raw_ocr_text", "")
            ocr_conf = result.get("ocr_confidence", 0) or 0
            if raw_text and ocr_conf >= 50:
                lines = [l.strip() for l in raw_text.splitlines() if len(l.strip()) > 3 and l.strip().replace(" ", "").isascii()]
                product_name = lines[0][:60] if lines else None
        if product_name:
            scan.product_name = product_name

        # Persist ComplianceCheck rows
        checks_data = result.get("compliance_checks", [])
        if checks_data:
            db.query(ComplianceCheck).filter(ComplianceCheck.scan_id == scan.scan_id).delete()
            for check in checks_data:
                res_val = check.get("result") if isinstance(check, dict) else getattr(check, "result", None)
                if isinstance(res_val, ComplianceCheckResultEnum):
                    res_enum = res_val
                else:
                    try:
                        res_enum = ComplianceCheckResultEnum(str(res_val))
                    except ValueError:
                        res_enum = ComplianceCheckResultEnum.ManualReviewRequired

                db.add(
                    ComplianceCheck(
                        scan_id=scan.scan_id,
                        rule_id=check.get("rule_id") if isinstance(check, dict) else getattr(check, "rule_id", None),
                        field_key=check.get("field_key") if isinstance(check, dict) else getattr(check, "field_key", ""),
                        result=res_enum,
                        confidence=check.get("confidence") if isinstance(check, dict) else getattr(check, "confidence", None),
                        extracted_value=check.get("extracted_value") if isinstance(check, dict) else getattr(check, "extracted_value", None),
                        relaxation_order_id=check.get("relaxation_order_id") if isinstance(check, dict) else getattr(check, "relaxation_order_id", None),
                        notes=check.get("notes") if isinstance(check, dict) else getattr(check, "notes", None),
                        image_index=check.get("image_index", 0) if isinstance(check, dict) else getattr(check, "image_index", 0),
                        bounding_box=check.get("bounding_box") if isinstance(check, dict) else getattr(check, "bounding_box", None),
                    )
                )

        # Auto-upsert Product
        if scan.product_name:
            cat_obj = db.query(CommodityCategory).filter(CommodityCategory.name.ilike((scan.category or "general").strip())).first()
            cat_id = cat_obj.id if cat_obj else None
            prod = db.query(Product).filter(
                Product.name.ilike(scan.product_name),
                (Product.commodity_category_id == cat_id) | (Product.category == (scan.category or "general")),
                Product.is_active == True,
            ).first()
            if not prod:
                prod = Product(
                    name=scan.product_name,
                    category=scan.category or "general",
                    commodity_category_id=cat_id,
                    brand_name=scan.brand_name,
                    is_compliant=scan.is_compliant,
                    last_compliance_score=scan.compliance_score,
                    last_scan_id=scan.scan_id,
                )
                db.add(prod)
                db.flush()
            else:
                prod.last_compliance_score = scan.compliance_score
                prod.last_scan_id = scan.scan_id
                prod.is_compliant = scan.is_compliant
                if cat_id and not prod.commodity_category_id:
                    prod.commodity_category_id = cat_id
            scan.product_id = prod.id

        db.commit()
        return {"scan_id": scan_id, "status": scan.pipeline_status}

    except Exception as exc:
        logger.exception("Error processing scan %s in Celery worker: %s", scan_id, exc)
        if scan:
            scan.pipeline_status = "failed"
            db.commit()
        raise self.retry(exc=exc, countdown=5)
    finally:
        db.close()
