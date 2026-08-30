"""
OCR Service
Primary path: Groq vision model (llama-4-scout-17b) — reads the image directly,
returns clean structured fields. Much more accurate than Tesseract on real labels.

Fallback path: Tesseract v5 (English + Hindi) — used when GROQ_API_KEY is not
set or the vision call fails.
"""
import io
import logging
from PIL import Image, ImageEnhance, ImageFilter
from app.config import settings

logger = logging.getLogger(__name__)

try:
    import pytesseract
    if settings.TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    logger.warning("pytesseract not installed — Tesseract fallback disabled.")


def preprocess_image(image: Image.Image) -> Image.Image:
    """Preprocess for Tesseract: upscale, grayscale, contrast, sharpen."""
    w, h = image.size
    if w < 1000 or h < 1000:
        scale = max(1000 / w, 1000 / h)
        image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    image = image.convert("L")
    image = ImageEnhance.Contrast(image).enhance(2.0)
    image = image.filter(ImageFilter.SHARPEN)
    return image


def _average(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _derive_field_confidences_and_bboxes(
    raw_text: str, word_data: dict, avg_confidence: float, img_width: int, img_height: int
) -> tuple[dict, dict]:
    from app.services.compliance_engine import COMPLIANCE_FIELDS, _check_field, _normalize

    normalized_text = _normalize(raw_text)
    words = []
    n_boxes = len(word_data.get("text", []))
    for i in range(n_boxes):
        text = str(word_data["text"][i]).strip().lower()
        conf = word_data["conf"][i]
        try:
            score = float(conf)
        except (TypeError, ValueError):
            continue
        if text and score > 0:
            left = word_data["left"][i]
            top = word_data["top"][i]
            w = word_data["width"][i]
            h = word_data["height"][i]
            words.append({
                "token": text,
                "score": score / 100,
                "left": left,
                "top": top,
                "right": left + w,
                "bottom": top + h,
            })

    confidences = {}
    bboxes = {}
    default_confidence = round(avg_confidence / 100, 2)

    for field in COMPLIANCE_FIELDS:
        key = field["key"]
        if not _check_field(field, normalized_text):
            confidences[key] = default_confidence
            bboxes[key] = None
            continue

        markers = [key.replace("_", " ")]
        if key == "manufacturer_info":
            markers.extend(["manufactured", "packed", "imported", "marketed", "mfg by", "pkd by"])
        elif key == "net_quantity":
            markers.extend(["net", "quantity", "weight", "qty", "vol", "g", "kg", "ml", "l"])
        elif key == "mrp":
            markers.extend(["mrp", "rs", "inr", "price", "incl"])
        elif key == "mfg_date":
            markers.extend(["mfg", "manufactured", "packed", "pkd", "date"])
        elif key == "expiry_date":
            markers.extend(["expiry", "exp", "before", "use by"])
        elif key == "consumer_care":
            markers.extend(["consumer", "care", "helpline", "contact", "feedback", "email"])
        elif key == "country_of_origin":
            markers.extend(["origin", "made", "country", "india"])
        elif key == "fssai_number":
            markers.extend(["fssai", "licence", "license", "lic"])

        marker_tokens = {token for marker in markers for token in marker.split()}
        matched_words = [w for w in words if w["token"].strip(".:,") in marker_tokens]

        if matched_words:
            confidences[key] = round(_average([w["score"] for w in matched_words]), 2)
            min_l = min(w["left"] for w in matched_words)
            min_t = min(w["top"] for w in matched_words)
            max_r = max(w["right"] for w in matched_words)
            max_b = max(w["bottom"] for w in matched_words)

            x_min = round(max(0.0, min_l / img_width), 4)
            y_min = round(max(0.0, min_t / img_height), 4)
            x_max = round(min(1.0, max_r / img_width), 4)
            y_max = round(min(1.0, max_b / img_height), 4)

            bboxes[key] = {
                "x_min": x_min,
                "y_min": y_min,
                "x_max": x_max,
                "y_max": y_max,
                "bbox_source": "ocr_word_match",
            }
        else:
            confidences[key] = default_confidence
            bboxes[key] = None

    return confidences, bboxes


def _tesseract_extract(image_bytes: bytes) -> dict:
    """Run Tesseract OCR and return text + confidence + word bounding boxes."""
    if not TESSERACT_AVAILABLE:
        return {"text": "", "confidence": 0.0, "success": False,
                "error": "Tesseract not installed", "source": "tesseract", "field_bboxes": {}}
    try:
        image = Image.open(io.BytesIO(image_bytes))
        orig_w, orig_h = image.size
        processed = preprocess_image(image)
        proc_w, proc_h = processed.size

        try:
            raw_text = pytesseract.image_to_string(processed, lang="eng+hin")
        except Exception:
            raw_text = pytesseract.image_to_string(processed, lang="eng")

        data = {}
        try:
            data = pytesseract.image_to_data(
                processed, lang="eng", output_type=pytesseract.Output.DICT
            )
            confidences = [int(c) for c in data["conf"] if str(c).isdigit() and int(c) > 0]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        except Exception:
            avg_confidence = 0.0

        field_confs, field_bboxes = _derive_field_confidences_and_bboxes(
            raw_text, data, avg_confidence, proc_w, proc_h
        )

        return {
            "text": raw_text.strip(),
            "confidence": round(avg_confidence, 2),
            "field_confidences": field_confs,
            "field_bboxes": field_bboxes,
            "success": True,
            "error": None,
            "source": "tesseract",
        }
    except Exception as e:
        logger.exception("Tesseract OCR failed")
        return {"text": "", "confidence": 0.0, "success": False,
                "error": str(e), "source": "tesseract", "field_bboxes": {}}


def extract_text_from_bytes(image_bytes: bytes) -> dict:
    """
    Primary entry point for the pipeline.

    1. Try Groq vision model — returns structured fields directly as JSON text
       along with visual estimate bounding boxes.
    2. Fall back to Tesseract if Groq is unavailable or fails.

    Always returns:
      text, confidence, success, error, source ("groq_vision" | "tesseract"), field_bboxes
    """
    from app.services.groq_service import extract_from_image, _get_api_key

    if _get_api_key():
        groq_result = extract_from_image(image_bytes)
        groq_fields = groq_result.get("fields", {}) if isinstance(groq_result, dict) else {}
        field_confidences = groq_result.get("field_confidences", {}) if isinstance(groq_result, dict) else {}
        field_bboxes = groq_result.get("field_bboxes", {}) if isinstance(groq_result, dict) else {}
        if groq_fields:
            text_lines = []
            for key, val in groq_fields.items():
                if val:
                    text_lines.append(f"{key.replace('_', ' ').title()}: {val}")
            synthesized_text = "\n".join(text_lines)
            confidence_values = [
                float(conf) for conf in field_confidences.values()
                if isinstance(conf, (int, float)) and conf > 0
            ]
            overall_confidence = round(_average(confidence_values) * 100, 2)

            return {
                "text": synthesized_text,
                "confidence": overall_confidence,
                "field_confidences": field_confidences,
                "field_bboxes": field_bboxes,
                "success": True,
                "error": None,
                "source": "groq_vision",
                "groq_fields": groq_fields,
            }
        else:
            logger.info("Groq vision returned empty — falling back to Tesseract")

    # Tesseract fallback
    return _tesseract_extract(image_bytes)


def extract_text_from_path(file_path: str) -> dict:
    """Convenience wrapper to run OCR on a file path."""
    with open(file_path, "rb") as f:
        return extract_text_from_bytes(f.read())
