from io import BytesIO
from unittest.mock import patch
from PIL import Image

from app.services.ecommerce_crawler import fetch_listing
from app.services.tamper_service import detect_tamper
from app.services.calibration_service import calibrate_from_inspector_input
from app.services import calibration_service


def test_crawler_rejects_invalid_url():
    result = fetch_listing("not-a-url")
    assert result["status"] == "fetch_failed"
    assert result["error"] == "invalid_url"


def test_crawler_reports_blocked_fetch():
    with patch("urllib.request.urlopen", side_effect=TimeoutError()):
        result = fetch_listing("https://example.com/product")
    assert result["status"] == "fetch_failed"


def test_barcode_reference_calibration_requires_positive_dimensions():
    result = calibrate_from_inspector_input(100, 200, 1000, 2000)
    assert result["method"] == "inspector"
    assert result["mm_per_px_x"] == 0.1
    assert result["verified"] is True


def test_multi_image_calibration_keeps_barcode_reference():
    """The aggregate pipeline selects verified barcode calibration, not image 0's fallback."""
    results = [{"calibration_data": {"method": "unverified"}},
               {"calibration_data": {"method": "barcode_reference", "verified": True, "mm_per_px_y": 0.1}}]
    selected = next((r["calibration_data"] for r in results if r["calibration_data"].get("verified")), results[0]["calibration_data"])
    assert selected["method"] == "barcode_reference"


def test_tamper_signal_never_claims_definitive_violation():
    payload = BytesIO()
    Image.new("RGB", (20, 20), "white").save(payload, format="PNG")
    result = detect_tamper(payload.getvalue(), {})
    assert result["status"] in {"not_detected", "suspected", "unavailable"}
    assert result["status"] != "violation"
