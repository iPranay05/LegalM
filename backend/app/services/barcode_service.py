"""
Barcode & QR Code Service
Decodes barcodes/QR codes from product label images using pyzbar + OpenCV.
After decoding, looks up the barcode on Open Food Facts to retrieve product info.

Graceful fallback at every step:
  - pyzbar not installed → returns empty result
  - Barcode found but lookup fails → returns barcode number only
  - Network unavailable → returns barcode number only
"""
import io
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from pyzbar import pyzbar
    PYZBAR_AVAILABLE = True
except ImportError:
    PYZBAR_AVAILABLE = False
    logger.warning("pyzbar not installed — barcode decoding disabled. Run: pip install pyzbar")

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False


def decode_barcodes(image_bytes: bytes) -> list[dict]:
    """
    Decode all barcodes and QR codes from image bytes.
    Returns list of decoded items: [{"type": "EAN13", "data": "8901234567890"}]
    Tries multiple preprocessing passes to maximise detection rate.
    """
    if not PYZBAR_AVAILABLE:
        return []

    try:
        from PIL import Image
        import numpy as np

        pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        arr = np.array(pil)

        results = []
        seen = set()

        def _decode_arr(img_arr):
            decoded = pyzbar.decode(img_arr)
            for obj in decoded:
                data = obj.data.decode("utf-8", errors="replace").strip()
                key = (obj.type, data)
                if key not in seen and data:
                    seen.add(key)
                    results.append({"type": obj.type, "data": data})

        # Pass 1: original colour image
        _decode_arr(arr)

        if not results and CV2_AVAILABLE:
            bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

            # Pass 2: grayscale
            gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            _decode_arr(gray)

            # Pass 3: adaptive threshold (helps with poor contrast)
            thresh = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 11, 2
            )
            _decode_arr(thresh)

            # Pass 4: upscaled (helps with small barcodes on label images)
            h, w = gray.shape
            if max(h, w) < 1200:
                scale = 1200 / max(h, w)
                upscaled = cv2.resize(gray, (int(w * scale), int(h * scale)),
                                      interpolation=cv2.INTER_CUBIC)
                _decode_arr(upscaled)

        return results

    except Exception:
        logger.exception("Barcode decoding failed")
        return []


def lookup_barcode(barcode: str) -> dict:
    """
    Look up a barcode on Open Food Facts API.
    Returns product info dict or empty dict if not found.
    Only EAN-13, EAN-8, and UPC-A codes are looked up.
    """
    # Only numeric barcodes are worth looking up on food databases
    if not re.match(r"^\d{8,14}$", barcode):
        return {}

    try:
        import urllib.request
        import json

        url = f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "LegalMetrologyComplianceChecker/1.0"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())

        if data.get("status") != 1:
            return {}

        product = data.get("product", {})
        return {
            "source": "open_food_facts",
            "barcode": barcode,
            "product_name": product.get("product_name") or product.get("product_name_en"),
            "brand_name": product.get("brands"),
            "manufacturer_name": product.get("manufacturing_places") or product.get("producer"),
            "net_quantity": product.get("quantity"),
            "country_of_origin": product.get("countries_tags", [None])[0],
            "fssai_number": _extract_fssai(product),
            "categories": product.get("categories"),
            "ingredients": product.get("ingredients_text_en") or product.get("ingredients_text"),
            "image_url": product.get("image_url"),
        }

    except Exception as e:
        logger.debug("Open Food Facts lookup failed for %s: %s", barcode, e)
        return {}


def _extract_fssai(product: dict) -> Optional[str]:
    """Try to extract FSSAI number from product fields."""
    for field in ("misc_tags", "labels_tags", "additives_tags"):
        for tag in product.get(field, []):
            match = re.search(r"\d{14}", str(tag))
            if match:
                return match.group(0)
    # Check raw text fields
    for field in ("labels", "packaging_text", "other_information"):
        text = product.get(field, "")
        if text:
            match = re.search(r"\b\d{14}\b", text)
            if match:
                return match.group(0)
    return None


def scan_barcodes_full(image_bytes: bytes) -> dict:
    """
    Full barcode pipeline: decode → lookup.
    Returns combined result dict ready to store in scan.barcode_data.

    Schema:
    {
      "barcodes": [{"type": "EAN13", "data": "8901234567890"}],
      "primary_barcode": "8901234567890",
      "product_info": { ...open_food_facts fields... },
      "decoded": true
    }
    """
    barcodes = decode_barcodes(image_bytes)

    if not barcodes:
        return {"barcodes": [], "primary_barcode": None, "product_info": {}, "decoded": False}

    # Pick first EAN/UPC barcode as primary (prefer longer codes)
    numeric = [b for b in barcodes if re.match(r"^\d+$", b["data"])]
    primary = max(numeric, key=lambda b: len(b["data"]))["data"] if numeric else barcodes[0]["data"]

    product_info = lookup_barcode(primary) if re.match(r"^\d{8,14}$", primary) else {}

    return {
        "barcodes": barcodes,
        "primary_barcode": primary,
        "product_info": product_info,
        "decoded": True,
    }
