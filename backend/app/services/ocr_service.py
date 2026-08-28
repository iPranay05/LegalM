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


def _derive_field_confidences(raw_text: str, word_data: dict, avg_confidence: float) -> dict:
    from app.services.compliance_engine import COMPLIANCE_FIELDS, _check_field, _normalize

    normalized_text = _normalize(raw_text)
    words = []
    for text, conf in zip(word_data.get("text", []), word_data.get("conf", [])):
        token = str(text).strip().lower()
        try:
            score = float(conf)
        except (TypeError, ValueError):
            continue
        if token and score > 0:
            words.append((token, score / 100))

    confidences = {}
    default_confidence = round(avg_confidence / 100, 2)
    for field in COMPLIANCE_FIELDS:
        key = field["key"]
        if not _check_field(field, normalized_text):
            confidences[key] = default_confidence
            continue

        markers = [key.replace("_", " ")]
        if key == "manufacturer_info":
            markers.extend(["manufactured", "packed", "imported", "marketed"])
        elif key == "net_quantity":
            markers.extend(["net", "quantity", "weight", "qty"])
        elif key == "mrp":
            markers.extend(["mrp", "rs", "inr", "price"])
        elif key == "mfg_date":
            markers.extend(["mfg", "manufactured", "packed"])
        elif key == "expiry_date":
            markers.extend(["expiry", "exp", "before"])
        elif key == "consumer_care":
            markers.extend(["consumer", "care", "helpline", "contact"])
        elif key == "country_of_origin":
            markers.extend(["origin", "made"])
        elif key == "fssai_number":
            markers.extend(["fssai", "licence", "license"])

        marker_tokens = {token for marker in markers for token in marker.split()}
        matched_scores = [score for token, score in words if token.strip(".:") in marker_tokens]
        confidences[key] = round(_average(matched_scores) if matched_scores else default_confidence, 2)

    return confidences


def _tesseract_extract(image_bytes: bytes) -> dict:
    """Run Tesseract OCR and return text + confidence."""
    if not TESSERACT_AVAILABLE:
        return {"text": "", "confidence": 0.0, "success": False,
                "error": "Tesseract not installed", "source": "tesseract"}
    try:
        image = Image.open(io.BytesIO(image_bytes))
        processed = preprocess_image(image)

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

        return {
            "text": raw_text.strip(),
            "confidence": round(avg_confidence, 2),
            "field_confidences": _derive_field_confidences(raw_text, data, avg_confidence),
            "success": True,
            "error": None,
            "source": "tesseract",
        }
    except Exception as e:
        logger.exception("Tesseract OCR failed")
        return {"text": "", "confidence": 0.0, "success": False,
                "error": str(e), "source": "tesseract"}


def extract_text_from_bytes(image_bytes: bytes) -> dict:
    """
    Primary entry point for the pipeline.

    1. Try Groq vision model — returns structured fields directly as JSON text
       (highly accurate, handles Hindi, low contrast, angled photos).
    2. Fall back to Tesseract if Groq is unavailable or fails.

    Always returns:
      text, confidence, success, error, source ("groq_vision" | "tesseract")
    """
    from app.services.groq_service import extract_from_image, _get_api_key

    if _get_api_key():
        groq_result = extract_from_image(image_bytes)
        groq_fields = groq_result.get("fields", {}) if isinstance(groq_result, dict) else {}
        field_confidences = groq_result.get("field_confidences", {}) if isinstance(groq_result, dict) else {}
        if groq_fields:
            # Convert structured fields back to readable text for downstream
            # compliance engine (which expects raw text to keyword-match against)
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
                "success": True,
                "error": None,
                "source": "groq_vision",
                "groq_fields": groq_fields,  # pass structured fields upstream
            }
        else:
            logger.info("Groq vision returned empty — falling back to Tesseract")

    # Tesseract fallback
    return _tesseract_extract(image_bytes)


def extract_text_from_path(file_path: str) -> dict:
    """Convenience wrapper to run OCR on a file path."""
    with open(file_path, "rb") as f:
        return extract_text_from_bytes(f.read())
