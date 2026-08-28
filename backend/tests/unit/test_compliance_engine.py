from app.services.compliance_engine import ComplianceCheckResult, evaluate_declarations, summarize_checks


def test_low_confidence_never_becomes_pass_or_fail():
    scan_context = {
        "ocr_text": "MRP Rs. 45 inclusive of all taxes",
        "overall_confidence": 0.95,
        "low_confidence": False,
        "field_confidences": {"mrp": 0.2},
        "extracted_fields": {"mrp": "Rs. 45"},
        "category": "general",
        "symbols": {},
        "calibration": {},
    }

    checks = evaluate_declarations(scan_context)
    mrp_check = next(check for check in checks if check.field_key == "mrp")

    assert mrp_check.result == "ManualReviewRequired"


def test_confidently_present_field_becomes_pass():
    checks = evaluate_declarations({
        "ocr_text": "MRP Rs. 45 inclusive of all taxes",
        "overall_confidence": 0.95,
        "low_confidence": False,
        "field_confidences": {"mrp": 0.91},
        "extracted_fields": {"mrp": "Rs. 45"},
    })
    mrp_check = next(check for check in checks if check.field_key == "mrp")

    assert mrp_check.result == "Pass"


def test_confidently_absent_field_becomes_fail():
    checks = evaluate_declarations({
        "ocr_text": "Only a brand logo is visible on this label",
        "overall_confidence": 0.92,
        "low_confidence": False,
        "field_confidences": {"mrp": 0.9},
        "extracted_fields": {},
    })
    mrp_check = next(check for check in checks if check.field_key == "mrp")

    assert mrp_check.result == "Fail"


def test_headline_summary_manual_review_takes_priority_over_failures():
    summary = summarize_checks([
        ComplianceCheckResult(field_key="mrp", result="Fail", confidence=0.9),
        ComplianceCheckResult(
            field_key="net_quantity",
            result="ManualReviewRequired",
            confidence=0.2,
        ),
    ])

    assert summary["headline"] == "NeedsManualReview"
    assert summary["counts"]["Fail"] == 1
    assert summary["counts"]["ManualReviewRequired"] == 1
