"""
Calibration Service
Determines physical scale of an image for measurement verification.
Three modes (in priority order):
  1. reference_marker  — known-size marker detected in image (e.g. standard A4 sheet corner)
  2. inspector         — inspector enters physical dimensions manually
  3. unverified        — no calibration possible; measurements flagged as unverified

Never fabricates scale — always reports the method used.
"""
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False


# Standard reference object: A4 paper is 210 x 297 mm
A4_WIDTH_MM = 210.0
A4_HEIGHT_MM = 297.0
EAN13_WIDTH_MM = 37.29

def calibrate_from_barcode(image_bytes: bytes) -> Optional[dict]:
    """Estimate scale from a localized EAN/UPC barcode of known nominal width."""
    try:
        from pyzbar import pyzbar
        from PIL import Image
        import io
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        import numpy as np
        arr = np.array(image)
        candidates = []
        def collect(frame, scale=1.0):
            for obj in pyzbar.decode(frame):
                if obj.type in ("EAN13", "EAN8", "UPCA", "UPC-A") and obj.rect.width / scale > 12:
                    candidates.append((obj, scale))
        collect(arr)
        if not candidates:
            gray = np.asarray(image.convert("L"))
            collect(gray)
            h, w = gray.shape
            scale = max(2.0, 1600 / max(h, w))
            enlarged = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC) if CV2_AVAILABLE else gray
            collect(enlarged, scale)
            if CV2_AVAILABLE:
                threshold = cv2.threshold(enlarged, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
                collect(threshold, scale)
        if not candidates:
            return None
        obj, scale = max(candidates, key=lambda item: item[0].rect.width / item[1])
        reference_width_px = obj.rect.width / scale
        width_mm = EAN13_WIDTH_MM if obj.type == "EAN13" else 29.83
        return {"method": "barcode_reference", "verified": True,
                "mm_per_px_x": round(width_mm / reference_width_px, 6),
                "mm_per_px_y": round(width_mm / reference_width_px, 6), "reference": obj.type,
                "reference_width_px": round(reference_width_px, 2), "confidence": 0.6}
    except Exception:
        return None


def _detect_a4_reference(bgr_image) -> Optional[dict]:
    """
    Try to detect A4 paper corners in image as a calibration reference.
    Returns pixel-to-mm ratio if found, else None.
    """
    if not CV2_AVAILABLE:
        return None
    try:
        import numpy as np
        gray = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Find largest rectangle-like contour
        candidates = []
        for c in contours:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4 and cv2.contourArea(c) > 10000:
                candidates.append((cv2.contourArea(c), approx))

        if not candidates:
            return None

        candidates.sort(key=lambda x: x[0], reverse=True)
        _, rect = candidates[0]
        pts = rect.reshape(4, 2).astype(float)

        # Estimate width and height in pixels
        widths = [
            np.linalg.norm(pts[0] - pts[1]),
            np.linalg.norm(pts[2] - pts[3]),
        ]
        heights = [
            np.linalg.norm(pts[1] - pts[2]),
            np.linalg.norm(pts[0] - pts[3]),
        ]
        px_w = float(np.mean(widths))
        px_h = float(np.mean(heights))

        # Determine orientation (landscape vs portrait)
        if px_w > px_h:
            mm_per_px_x = A4_HEIGHT_MM / px_w
            mm_per_px_y = A4_WIDTH_MM / px_h
        else:
            mm_per_px_x = A4_WIDTH_MM / px_w
            mm_per_px_y = A4_HEIGHT_MM / px_h

        return {
            "verified": True,
            "mm_per_px_x": round(mm_per_px_x, 4),
            "mm_per_px_y": round(mm_per_px_y, 4),
            "reference": "a4_paper",
            "confidence": 0.75,
        }
    except Exception:
        logger.exception("A4 reference detection failed")
        return None


def calibrate_from_image(image_bytes: bytes) -> dict:
    """
    Attempt automatic calibration from image bytes.
    Returns calibration result dict with method and scale info.
    """
    if not CV2_AVAILABLE:
        return {
            "method": "unverified",
            "reason": "OpenCV not available",
            "mm_per_px_x": None,
            "mm_per_px_y": None,
        }
    try:
        import numpy as np
        from PIL import Image
        import io
        pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        arr = np.array(pil)
        bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        result = _detect_a4_reference(bgr)
        if result:
            return {"method": "reference_marker", **result}
    except Exception:
        logger.exception("Image calibration failed")

    return {
        "method": "unverified",
        "reason": "No reference marker detected",
        "mm_per_px_x": None,
        "mm_per_px_y": None,
    }


def calibrate_from_inspector_input(width_mm: float, height_mm: float,
                                    img_width_px: int, img_height_px: int) -> dict:
    """
    Build calibration data from inspector-provided physical dimensions.
    """
    if img_width_px <= 0 or img_height_px <= 0:
        return {"method": "unverified", "reason": "Invalid pixel dimensions"}
    return {
        "method": "inspector",
        "verified": True,
        "mm_per_px_x": round(width_mm / img_width_px, 4),
        "mm_per_px_y": round(height_mm / img_height_px, 4),
        "provided_width_mm": width_mm,
        "provided_height_mm": height_mm,
    }
