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

GROQ_MODEL_VISION = "qwen/qwen3.6-27b"   # vision model (image + text)
GROQ_MODEL_TEXT   = "openai/gpt-oss-20b" # text-only model (fast, available on free plan)

_FIELDS_SCHEMA = """{
  "product_name": "Common/generic name of the commodity (e.g. 'Iodised Salt', 'ORS')",
  "brand_name": "Brand or trade name (e.g. 'Tata', 'Orsl', 'Dettol')",
  "manufacturer_name": "Name of manufacturer, packer or importer",
  "manufacturer_address": "Full address of manufacturer or packer",
  "net_quantity": "Net quantity with unit (e.g. '500g', '1L', '200ml')",
  "mrp": "Maximum Retail Price incl. taxes (digits only or with Rs., e.g. '45')",
  "mfg_date": "Manufacturing or packing date (e.g. 'Jan 2024', '01/2024')",
  "expiry_date": "Best before or expiry date",
  "batch_number": "Batch or lot number",
  "fssai_number": "FSSAI licence number — exactly 14 digits",
  "consumer_care": "Consumer care phone number or email",
  "country_of_origin": "Country of origin (for imported products only)"
}"""

_RULES = """Rules:
- product_name = generic/common name, NOT the brand name
- brand_name = trade/brand name printed large on the label
- Extract ONLY what is clearly visible — never invent values
- For Hindi/Devanagari text, transliterate to English
- Output raw JSON only — no markdown fences, no code blocks, no explanation text"""

IMAGE_PROMPT = f"""You are an expert at reading Indian packaged commodity labels under the Legal Metrology (Packaged Commodities) Rules, 2011.

Examine this product label image and extract all visible declaration fields.
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


def _sanitize(parsed: dict) -> dict:
    """Remove null/empty/placeholder values and strip whitespace."""
    return {
        k: v.strip() if isinstance(v, str) else v
        for k, v in parsed.items()
        if v is not None and str(v).strip() not in ("", "null", "None", "N/A", "n/a")
    }


def _parse_json(text: str) -> dict:
    """
    Extract a JSON object from model response text.
    Handles: raw JSON, markdown fences, Qwen <think> blocks, surrounding prose.
    """
    if not text:
        return {}

    # Strip Qwen reasoning blocks
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

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
            max_tokens=1024,
        )

        content = response.choices[0].message.content or ""
        parsed = _parse_json(content)
        if not parsed:
            logger.warning("Groq vision: no JSON found in response. Raw: %s", content[:200])
            return {}

        result = _sanitize(parsed)
        logger.info("Groq vision OCR succeeded: %s", list(result.keys()))
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
