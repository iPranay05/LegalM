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


def _has_fssai_mark_context(mask, contour, hsv) -> bool:
    """Require a colored circle inside a matching square on white ground."""
    x, y, w, h = cv2.boundingRect(contour)
    if w <= 0 or h <= 0 or max(w, h) / max(min(w, h), 1) > 1.7:
        return False
    # The standard mark has a white square interior/background around its dot.
    pad = max(4, int(max(w, h) * 0.8))
    y0, y1 = max(0, y - pad), min(hsv.shape[0], y + h + pad)
    x0, x1 = max(0, x - pad), min(hsv.shape[1], x + w + pad)
    region = hsv[y0:y1, x0:x1]
    white = ((region[:, :, 1] < 55) & (region[:, :, 2] > 170)).mean() if region.size else 0
    if white < 0.12:
        return False
    # Look for the matching square border in the same color mask surrounding
    # the circle (not merely a colored circle printed on packaging).
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    cx, cy = x + w / 2, y + h / 2
    for outer in contours:
        ox, oy, ow, oh = cv2.boundingRect(outer)
        if ow <= w or oh <= h or ow / max(oh, 1) < 0.45 or ow / max(oh, 1) > 2.2:
            continue
        if ox <= cx <= ox + ow and oy <= cy <= oy + oh and ow <= w * 8 and oh <= h * 8:
            return True
    return False


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

    if not CV2_AVAILABLE:
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
        MAX_SYMBOL_AREA = img_area * 0.02   # allow symbols on lower-resolution photos
        MIN_SYMBOL_AREA = 12

        # ── Green dot detection (Veg) ─────────────────────────────────────────
        # Phone glare and print on white can desaturate the green mark.
        lower_green = np.array([30, 35, 45])
        upper_green = np.array([95, 255, 255])
        green_mask = cv2.inRange(hsv, lower_green, upper_green)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        green_mask = cv2.morphologyEx(green_mask, cv2.MORPH_CLOSE, kernel)
        green_contours, _ = cv2.findContours(green_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        veg_candidates = [
            c for c in green_contours
            if MIN_SYMBOL_AREA < cv2.contourArea(c) < MAX_SYMBOL_AREA
            and _is_roughly_circular(c)
            and _has_fssai_mark_context(green_mask, c, hsv)
        ]
        if veg_candidates:
            largest = max(veg_candidates, key=cv2.contourArea)
            result["veg_dot"] = True
            result["veg_confidence"] = round(min(cv2.contourArea(largest) / 400, 1.0), 2)
        else:
            # At phone-photo resolution the circle and thin square border can
            # merge into one non-circular contour. Recognize that complete
            # square mark by its compact geometry and white center.
            for contour in green_contours:
                x, y, w0, h0 = cv2.boundingRect(contour)
                if 20 <= w0 <= 260 and 20 <= h0 <= 260 and 0.55 <= w0 / max(h0, 1) <= 1.8:
                    inner = hsv[y + h0 // 5:y + 4 * h0 // 5, x + w0 // 5:x + 4 * w0 // 5]
                    if inner.size and ((inner[:, :, 1] < 80) & (inner[:, :, 2] > 150)).mean() > 0.18:
                        result["veg_dot"] = True
                        result["veg_confidence"] = 0.65
                        break

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
            # Brown packaging graphics are common; the FSSAI mark is a small,
            # compact dot, so use a stricter area ceiling for brown candidates.
            if max(20, MIN_SYMBOL_AREA) < cv2.contourArea(c) < img_area * 0.003
            and _is_roughly_circular(c)
            and _has_fssai_mark_context(brown_mask, c, hsv)
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
