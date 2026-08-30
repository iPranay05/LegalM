"""
Groq LLM Service — two functions:

1. extract_from_image()  — Vision OCR via qwen/qwen3.6-27b.
   Reads the label image directly, returns structured JSON fields.
   Much more accurate than Tesseract on real-world product labels.

2. extract_structured()  — Text extraction via openai/gpt-oss-20b.
   Takes raw Tesseract OCR text and parses structured fields.

Both fall back gracefully if GROQ_API_KEY is not set or the call fails.
Neither uses response_format — JSON is parsed manually from response text.
"""
import base64
import json
import logging
import os
import re

logger = logging.getLogger(__name__)

GROQ_MODEL_VISION = "qwen/qwen3.8-27b"   # currently available Groq vision/reasoning model
GROQ_MODEL_TEXT   = "openai/gpt-oss-20b" # text-only model (fast, available on free plan)

_FIELDS_SCHEMA = """{
  "product_name": {"value": "Common/generic name of the commodity (e.g. 'Iodised Salt', 'ORS')", "confidence": 0.0, "bbox": [0.1, 0.2, 0.4, 0.3]},
  "brand_name": {"value": "Brand or trade name (e.g. 'Tata', 'Orsl', 'Dettol')", "confidence": 0.0, "bbox": [0.1, 0.05, 0.5, 0.15]},
  "manufacturer_name": {"value": "Name of manufacturer, packer or importer", "confidence": 0.0, "bbox": [0.1, 0.6, 0.9, 0.7]},
  "manufacturer_address": {"value": "Full address of manufacturer or packer", "confidence": 0.0, "bbox": [0.1, 0.7, 0.9, 0.8]},
  "net_quantity": {"value": "Net quantity with unit (e.g. '500g', '1L', '200ml')", "confidence": 0.0, "bbox": [0.5, 0.4, 0.8, 0.5]},
  "mrp": {"value": "Maximum Retail Price incl. taxes (digits only or with Rs., e.g. '45')", "confidence": 0.0, "bbox": [0.6, 0.5, 0.9, 0.6]},
  "mfg_date": {"value": "Manufacturing or packing date (e.g. 'Jan 2024', '01/2024')", "confidence": 0.0, "bbox": [0.1, 0.5, 0.4, 0.58]},
  "expiry_date": {"value": "Best before or expiry date", "confidence": 0.0, "bbox": [0.1, 0.55, 0.4, 0.65]},
  "batch_number": {"value": "Batch or lot number", "confidence": 0.0, "bbox": [0.1, 0.45, 0.4, 0.52]},
  "fssai_number": {"value": "FSSAI licence number. A complete number is 14 digits, but if only some digits are legible, return the digits you can actually read (do not pad or guess the rest) with a lower confidence", "confidence": 0.0, "bbox": [0.1, 0.8, 0.6, 0.88]},
  "consumer_care": {"value": "Consumer care phone number or email", "confidence": 0.0, "bbox": [0.1, 0.85, 0.9, 0.95]},
  "country_of_origin": {"value": "Country of origin (for imported products only)", "confidence": 0.0, "bbox": [0.5, 0.85, 0.9, 0.95]}
  ,"barcode_number": {"value": "Human-readable barcode digits, digits only", "confidence": 0.0, "bbox": [0.1, 0.85, 0.9, 0.99]}
  ,"veg_mark": {"value": "true if a green dot inside a green square is visible, false if clearly absent, null if this side of the pack isn't shown", "confidence": 0.0, "bbox": [0.05, 0.05, 0.2, 0.15]}
  ,"non_veg_mark": {"value": "true if a brown/maroon dot inside a brown/maroon square is visible, false if clearly absent, null if this side of the pack isn't shown", "confidence": 0.0, "bbox": [0.05, 0.05, 0.2, 0.15]}
}"""

_RULES = """Rules:
- product_name = generic/common name, NOT the brand name
- brand_name = trade/brand name printed large on the label
- Read the entire image, including tiny embossed/inkjet and side-panel text. Mentally zoom into every region before answering; do not rely only on the largest text.
- First transcribe visible text internally, then map it to fields. Preserve the printed spelling in values, correcting only obvious OCR character errors.
- Recognize label synonyms and noisy variants: LOT/Lot/LT = batch_number; MFG/MFD/PKD/Manth & Year of Mfg. = mfg_date; EXP/Expiry/Best Before = expiry_date; MRP/M.R.P./incl. of all taxes = mrp; Made in/Country of Origin/Origin = country_of_origin; Net Vol/Contents = net_quantity.
- For a value that is visible but partly blurred, return the best transcription with confidence below 0.6; for text that cannot be read, return null. Never invent values.
- Each field must be an object with value, confidence, and approximate normalized bbox [x_min, y_min, x_max, y_max] (0.0 to 1.0)
- confidence must be a number from 0.0 to 1.0 based only on visual certainty
- If a field is unclear, partially obscured, or guessed, set value to null or confidence below 0.6
- For Hindi/Devanagari text, transliterate to English
- If a barcode is visible, read the printed digits below it into barcode_number; do not guess or infer missing digits.
- fssai_number: transcribe only digits you can actually read; a genuine licence number is 14 digits, but a shorter partial reading with confidence below 0.6 is more useful than a null. Only return null if no such number appears anywhere in the image.
- veg_mark / non_veg_mark: these are small (5-15mm) government-mandated marks — a solid dot inside a matching square outline, printed near the product name or net quantity, almost always on the FRONT of the pack. Look at every corner and edge of the image, including small or rotated regions, before concluding one is absent. Set to false (not null) only if the front of the pack IS visible in this image and the mark is genuinely not on it; set to null if this image does not show the area where the mark would be (e.g. only the back/ingredients panel is shown).
- Output raw JSON only — no markdown fences, no code blocks, no explanation text"""

IMAGE_PROMPT = f"""You are an expert at reading Indian packaged commodity labels under the Legal Metrology (Packaged Commodities) Rules, 2011.

Examine this product label image and extract all visible declaration fields.
This may be a low-resolution photograph. Inspect all four corners, edges, seals, caps, inkjet print, and side/back panels. Pay special attention to short declarations such as LOT, MFG/MFD, EXP, MRP, and Made in India. Do not confuse a product name with a brand, and do not treat decorative text as a declaration.
Output ONLY a raw JSON object with these exact keys (null for missing fields):

{_FIELDS_SCHEMA}

{_RULES}"""

TEXT_PROMPT = f"""You are a product label parser for Indian packaged commodities under the Legal Metrology (Packaged Commodities) Rules, 2011.

The following is raw OCR text from a product label (may contain errors or Hindi/English mix).
Extract declaration fields and output ONLY a raw JSON object with these exact keys (null for missing):

{_FIELDS_SCHEMA}

{_RULES}

OCR Text:
"""


def _get_api_key() -> str:
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if not key:
        try:
            from app.config import settings
            key = (getattr(settings, "GROQ_API_KEY", None) or "").strip()
        except Exception:
            pass
    return key


def _is_real_value(value) -> bool:
    return value is not None and str(value).strip() not in ("", "null", "None", "N/A", "n/a")


def _normalize_confidence(value) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.0
    if confidence > 1:
        confidence = confidence / 100
    return max(0.0, min(confidence, 1.0))


def _sanitize(parsed: dict) -> dict:
    """Normalize model JSON into field values, per-field confidences, and bounding boxes."""
    fields = {}
    confidences = {}
    bboxes = {}
    for key, raw in parsed.items():
        if isinstance(raw, dict):
            value = raw.get("value")
            confidence = _normalize_confidence(raw.get("confidence"))
            raw_bbox = raw.get("bbox") or raw.get("box_2d") or raw.get("bounding_box")
        else:
            value = raw
            confidence = 0.0
            raw_bbox = None

        confidences[key] = confidence
        if _is_real_value(value):
            fields[key] = value.strip() if isinstance(value, str) else value

        # Parse normalized bounding box [x_min, y_min, x_max, y_max]
        if raw_bbox and isinstance(raw_bbox, (list, tuple)) and len(raw_bbox) == 4:
            try:
                x_min, y_min, x_max, y_max = [float(v) for v in raw_bbox]
                bboxes[key] = {
                    "x_min": round(max(0.0, min(1.0, x_min)), 4),
                    "y_min": round(max(0.0, min(1.0, y_min)), 4),
                    "x_max": round(max(0.0, min(1.0, x_max)), 4),
                    "y_max": round(max(0.0, min(1.0, y_max)), 4),
                    "bbox_source": "vision_estimate",
                }
            except (TypeError, ValueError):
                bboxes[key] = None
        elif isinstance(raw_bbox, dict) and "x_min" in raw_bbox:
            try:
                bboxes[key] = {
                    "x_min": round(max(0.0, min(1.0, float(raw_bbox["x_min"]))), 4),
                    "y_min": round(max(0.0, min(1.0, float(raw_bbox["y_min"]))), 4),
                    "x_max": round(max(0.0, min(1.0, float(raw_bbox["x_max"]))), 4),
                    "y_max": round(max(0.0, min(1.0, float(raw_bbox["y_max"]))), 4),
                    "bbox_source": "vision_estimate",
                }
            except (TypeError, ValueError):
                bboxes[key] = None
        else:
            bboxes[key] = None

    return {"fields": fields, "field_confidences": confidences, "field_bboxes": bboxes}


def _parse_json(text: str) -> dict:
    """
    Extract a JSON object from model response text.
    Handles: raw JSON, markdown fences, Qwen <think> blocks, surrounding prose.
    """
    if not text:
        return {}

    # Strip Qwen reasoning blocks. Some responses omit the closing tag; in
    # that case retain everything from the first JSON object onward.
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if "<think>" in text:
        text = text.split("<think>", 1)[1]
        if "}" in text:
            text = text[text.find("{"):]

    # Models occasionally add a short sentence before JSON. Decode the first
    # valid object instead of relying on a greedy regex that can include prose.
    first_object = text.find("{")
    if first_object > 0:
        text = text[first_object:]
    try:
        decoded, _ = json.JSONDecoder().raw_decode(text)
        return decoded
    except json.JSONDecodeError:
        pass

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strip markdown fences (```json ... ``` or ``` ... ```)
    stripped = re.sub(r"```(?:json)?\s*", "", text).replace("```", "").strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # Grab first top-level {...} block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return {}


def extract_from_image(image_bytes: bytes) -> dict:
    """
    Send product label image to Groq vision model.
    Returns structured fields dict, or empty dict on failure.
    """
    api_key = _get_api_key()
    if not api_key:
        logger.debug("GROQ_API_KEY not set — skipping vision OCR.")
        return {}

    try:
        from groq import Groq
        client = Groq(api_key=api_key)

        b64 = base64.b64encode(image_bytes).decode("utf-8")
        mime = "image/png" if image_bytes[:4] == b"\x89PNG" else "image/jpeg"

        response = client.chat.completions.create(
            model=GROQ_MODEL_VISION,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    {"type": "text", "text": IMAGE_PROMPT},
                ],
            }],
            temperature=0.0,
            max_tokens=2048,
            reasoning_format="hidden",
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content or ""
        parsed = _parse_json(content)
        if not parsed:
            logger.warning("Groq vision: no JSON found in response. Raw: %s", content[:200])
            return {}

        result = _sanitize(parsed)
        logger.info("Groq vision OCR succeeded: %s", list(result["fields"].keys()))
        return result

    except ImportError:
        logger.warning("groq package not installed. Run: pip install groq")
        return {}
    except Exception as e:
        logger.warning("Groq vision OCR failed: %s", e)
        return {}


def extract_structured(ocr_text: str) -> dict:
    """
    Send raw OCR text to Groq text model for structured extraction.
    Used as a second pass when Tesseract is the OCR source.
    """
    api_key = _get_api_key()
    if not api_key:
        logger.debug("GROQ_API_KEY not set — skipping structured extraction.")
        return {}

    if not ocr_text or len(ocr_text.strip()) < 10:
        return {}

    try:
        from groq import Groq
        client = Groq(api_key=api_key)

        response = client.chat.completions.create(
            model=GROQ_MODEL_TEXT,
            messages=[{
                "role": "user",
                "content": TEXT_PROMPT + ocr_text[:3000],
            }],
            temperature=0.0,
            max_tokens=512,
        )

        content = response.choices[0].message.content or ""
        parsed = _parse_json(content)
        if not parsed:
            logger.warning("Groq text: no JSON found. Raw: %s", content[:200])
            return {}

        result = _sanitize(parsed)
        logger.info("Groq text extraction succeeded: %s", list(result.keys()))
        return result

    except ImportError:
        logger.warning("groq package not installed. Run: pip install groq")
        return {}
    except Exception as e:
        logger.warning("Groq text extraction failed: %s", e)
        return {}
