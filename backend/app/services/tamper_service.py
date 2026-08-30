"""Conservative image-forensics signals for suspected price stickers."""
import io
from PIL import Image, ImageStat

def detect_tamper(image_bytes: bytes, field_bboxes: dict | None = None) -> dict:
    """Return a suspicion signal; never turns visual heuristics into a failure."""
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        signals = []
        for key in ("mrp",):
            box = (field_bboxes or {}).get(key)
            if not isinstance(box, dict):
                continue
            w, h = image.size
            crop = image.crop((int(box["x_min"]*w), int(box["y_min"]*h), int(box["x_max"]*w), int(box["y_max"]*h)))
            if crop.width < 4 or crop.height < 4:
                continue
            # A sticker often has a sharp local luminance discontinuity; this
            # is evidence for review, not proof of tampering.
            if ImageStat.Stat(crop).var[0] > 1800:
                signals.append("high local contrast around MRP region")
        return {"status": "suspected" if signals else "not_detected", "signals": signals, "confidence": 0.35 if signals else 0.0}
    except Exception:
        return {"status": "unavailable", "signals": [], "confidence": 0.0}
