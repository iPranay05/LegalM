import io
import os
import pytest
from PIL import Image
from docx import Document
from app.models.scan import Scan
from app.models.rules import ComplianceCheck, ComplianceCheckResult
from app.services.report_service import generate_report, _check_weasyprint


@pytest.fixture
def sample_image(tmp_path):
    img_path = str(tmp_path / "test_label.jpg")
    img = Image.new("RGB", (800, 600), color=(240, 240, 240))
    img.save(img_path, format="JPEG")
    return img_path


def test_report_contains_image_crops_for_flagged_checks(tmp_path, sample_image):
    scan_id = "test-scan-evidence-001"
    output_dir = str(tmp_path / "reports")

    scan = Scan(
        scan_id=scan_id,
        product_name="Test Product for Evidence Linking",
        category="food",
        image_path=sample_image,
        image_paths=[sample_image],
        is_compliant=False,
        compliance_score=65.0,
        ocr_confidence=85.0,
        field_results={"mrp": True, "net_quantity": True, "expiry_date": False},
        extracted_fields={"mrp": "Rs. 99", "net_quantity": "500g"},
        remarks="Missing mandatory expiry date declaration.",
    )

    checks = [
        ComplianceCheck(
            scan_id=scan_id,
            field_key="mrp",
            result=ComplianceCheckResult.Pass,
            confidence=0.92,
            extracted_value="Rs. 99",
            image_index=0,
            bounding_box={"x_min": 0.1, "y_min": 0.2, "x_max": 0.4, "y_max": 0.5, "bbox_source": "vision_estimate"},
        ),
        ComplianceCheck(
            scan_id=scan_id,
            field_key="net_quantity",
            result=ComplianceCheckResult.Pass,
            confidence=0.88,
            extracted_value="500g",
            image_index=0,
            bounding_box={"x_min": 0.5, "y_min": 0.6, "x_max": 0.8, "y_max": 0.9, "bbox_source": "ocr_word_match"},
        ),
        ComplianceCheck(
            scan_id=scan_id,
            field_key="expiry_date",
            result=ComplianceCheckResult.Fail,
            confidence=0.0,
            extracted_value=None,
            image_index=0,
            bounding_box=None,
        ),
    ]
    scan.compliance_checks = checks

    # 1. Test DOCX report generation has embedded pictures
    docx_meta = generate_report(scan, findings=[], fmt="docx", output_dir=output_dir)
    assert os.path.exists(docx_meta["file_path"])
    assert docx_meta["file_hash_sha256"]

    doc = Document(docx_meta["file_path"])
    # Verify inline shapes / images are embedded in the DOCX package
    assert len(doc.inline_shapes) >= 2 or any(
        "image" in rel.target_ref.lower() for rel in doc.part.rels.values()
    ), "DOCX report must contain embedded image crops for checks with bounding boxes"

    # 2. Test PDF/HTML report generation has embedded base64 image tags
    pdf_meta = generate_report(scan, findings=[], fmt="pdf", output_dir=output_dir)
    assert os.path.exists(pdf_meta["file_path"])

    with open(pdf_meta["file_path"], "rb") as f:
        file_bytes = f.read()

    if pdf_meta["format"] == "pdf":
        # Binary PDF contains JPEG streams / image XObjects
        assert b"/Image" in file_bytes or b"JFIF" in file_bytes or b"/Subtype /Image" in file_bytes or len(file_bytes) > 2000
    else:
        # HTML fallback contains embedded data:image/jpeg;base64
        assert b"data:image/jpeg;base64," in file_bytes, "HTML/PDF report must contain base64 embedded image crops"
