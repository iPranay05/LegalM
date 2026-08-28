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
        groq_fields = extract_from_image(image_bytes)
        if groq_fields:
            # Convert structured fields back to readable text for downstream
            # compliance engine (which expects raw text to keyword-match against)
            text_lines = []
            for key, val in groq_fields.items():
                if val:
                    text_lines.append(f"{key.replace('_', ' ').title()}: {val}")
            synthesized_text = "\n".join(text_lines)

            return {
                "text": synthesized_text,
                "confidence": 95.0,        # Groq vision is highly reliable
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
