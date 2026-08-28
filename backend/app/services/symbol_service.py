"""
Symbol Detection Service
Detects veg/non-veg dots and GM (Genetically Modified) marks on product labels
using OpenCV contour analysis and color-based heuristics.

FSSAI specification:
  - Veg: solid green circle inside a green square border
  - Non-Veg: solid brown/maroon circle inside a brown square border
  - Only relevant for food products (category == "food")

Falls back gracefully if OpenCV is unavailable.
"""
import logging
import io
import re

logger = logging.getLogger(__name__)

try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    logger.warning("OpenCV not available — symbol detection disabled.")

# Categories where veg/non-veg detection is meaningful
FOOD_CATEGORIES = {"food", "beverage", "food & beverage"}


def _pil_to_cv2(pil_image):
    """Convert PIL image to OpenCV BGR array."""
    import numpy as np
    if pil_image.mode != "RGB":
        pil_image = pil_image.convert("RGB")
    arr = np.array(pil_image)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _is_roughly_circular(contour) -> bool:
    """
    Return True if contour is roughly circular (circularity > 0.6).
    FSSAI veg/non-veg symbols are small filled circles.
    """
    area = cv2.contourArea(contour)
    if area < 30:
        return False
    perimeter = cv2.arcLength(contour, True)
    if perimeter == 0:
        return False
    circularity = (4 * np.pi * area) / (perimeter ** 2)
    return circularity > 0.55


def detect_symbols(image_bytes: bytes, category: str = "general") -> dict:
    """
    Detect food symbols on a product label image.

    Veg/non-veg detection only runs for food-category products.
    Returns:
        {
          "veg_dot": bool,
          "non_veg_dot": bool,
          "gm_mark": bool,
          "veg_confidence": float,
          "non_veg_confidence": float,
          "method": "opencv" | "skipped" | "unavailable"
        }
    """
    result = {
        "veg_dot": False,
        "non_veg_dot": False,
        "gm_mark": False,
        "veg_confidence": 0.0,
        "non_veg_confidence": 0.0,
        "method": "unavailable",
    }

    # Only check veg/non-veg for food products
    is_food = category.lower() in FOOD_CATEGORIES

    if not CV2_AVAILABLE:
        return result

    if not is_food:
        result["method"] = "skipped"
        result["skip_reason"] = f"Category '{category}' does not require veg/non-veg marking"
        return result

    try:
        from PIL import Image
        import numpy as np

        image = Image.open(io.BytesIO(image_bytes))
        # Resize to a consistent size to avoid scale-dependent thresholds
        max_dim = 1200
        w, h = image.size
        if max(w, h) > max_dim:
            scale = max_dim / max(w, h)
            image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        bgr = _pil_to_cv2(image)
        img_area = bgr.shape[0] * bgr.shape[1]  # total pixel area
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

        # FSSAI symbols are small: typically 5–15mm on a label.
        # At 1200px max dimension, that's roughly 50–400px² area.
        # Anything larger is packaging color, not a symbol.
        MAX_SYMBOL_AREA = img_area * 0.008   # max 0.8% of image area
        MIN_SYMBOL_AREA = 50

        # ── Green dot detection (Veg) ─────────────────────────────────────────
        lower_green = np.array([40, 100, 60])
        upper_green = np.array([85, 255, 220])
        green_mask = cv2.inRange(hsv, lower_green, upper_green)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        green_mask = cv2.morphologyEx(green_mask, cv2.MORPH_CLOSE, kernel)
        green_contours, _ = cv2.findContours(green_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        veg_candidates = [
            c for c in green_contours
            if MIN_SYMBOL_AREA < cv2.contourArea(c) < MAX_SYMBOL_AREA
            and _is_roughly_circular(c)
        ]
        if veg_candidates:
            largest = max(veg_candidates, key=cv2.contourArea)
            result["veg_dot"] = True
            result["veg_confidence"] = round(min(cv2.contourArea(largest) / 400, 1.0), 2)

        # ── Brown/maroon dot detection (Non-Veg) ──────────────────────────────
        lower_brown = np.array([0, 80, 30])
        upper_brown = np.array([15, 220, 140])
        lower_brown2 = np.array([165, 80, 30])
        upper_brown2 = np.array([180, 220, 140])
        mask1 = cv2.inRange(hsv, lower_brown, upper_brown)
        mask2 = cv2.inRange(hsv, lower_brown2, upper_brown2)
        brown_mask = cv2.bitwise_or(mask1, mask2)
        brown_mask = cv2.morphologyEx(brown_mask, cv2.MORPH_CLOSE, kernel)
        brown_contours, _ = cv2.findContours(brown_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        nonveg_candidates = [
            c for c in brown_contours
            if MIN_SYMBOL_AREA < cv2.contourArea(c) < MAX_SYMBOL_AREA
            and _is_roughly_circular(c)
        ]
        if nonveg_candidates:
            largest = max(nonveg_candidates, key=cv2.contourArea)
            result["non_veg_dot"] = True
            result["non_veg_confidence"] = round(min(cv2.contourArea(largest) / 400, 1.0), 2)

        result["method"] = "opencv"
        return result

    except Exception as e:
        logger.exception("Symbol detection failed")
        result["method"] = "unavailable"
        return result


def detect_gm_mark_from_text(ocr_text: str) -> bool:
    """
    Detect GM (Genetically Modified) mark from OCR text.
    GM products must be labelled per FSSAI regulations.
    """
    gm_patterns = [
        r"\bGM\b",
        r"\bgenetically\s+modified\b",
        r"\bGMO\b",
        r"\bcontains\s+GM\b",
    ]
    for pattern in gm_patterns:
        if re.search(pattern, ocr_text, re.IGNORECASE):
            return True
    return False
