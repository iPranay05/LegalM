"""
Compliance Engine for Legal Metrology (Packaged Commodities) Rules, 2011.

Mandatory declarations per Rule 6:
1.  Name and address of manufacturer / packer / importer
2.  Common or generic name of the commodity
3.  Net quantity (weight / volume / count)
4.  Month and year of manufacture / packing / import
5.  Best before / use by date (for applicable categories)
6.  Maximum Retail Price (MRP) inclusive of all taxes
7.  Consumer Care / Grievance contact details
8.  Country of origin (for imported goods)
9.  FSSAI licence number (for food products)

Each field carries a weight. Score = sum of weights for present fields / total weight * 100
"""

import re
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Optional, Sequence

# ---------------------------------------------------------------------------
# Field definitions — name, weight, patterns, description
# ---------------------------------------------------------------------------

COMPLIANCE_FIELDS = [
    {
        "key": "manufacturer_info",
        "label": "Manufacturer / Packer / Importer Name & Address",
        "weight": 15,
        "required": True,
        "patterns": [
            r"manufactured\s+by",
            r"mfg\.?\s+by",
            r"packed\s+by",
            r"marketed\s+by",
            r"imported\s+by",
            r"distributed\s+by",
            r"निर्मित",
            r"पैक्ड",
        ],
        "description": "Rule 6(1)(a) - Name and complete address of manufacturer/packer/importer",
    },
    {
        "key": "product_name",
        "label": "Common / Generic Name of Commodity",
        "weight": 10,
        "required": True,
        "patterns": [],  # Always check — any non-empty OCR text implies product name present
        "description": "Rule 6(1)(b) - Generic name of the product",
        "auto_detect": True,  # If OCR returns text, we assume name is present
    },
    {
        "key": "net_quantity",
        "label": "Net Quantity",
        "weight": 15,
        "required": True,
        "patterns": [
            r"\bnet\s*(wt|weight|qty|quantity|content|vol|volume)[\s.:]*[\d]",
            r"\b\d+\s*(g|gm|gms|gram|grams|kg|kgs|kilogram|ml|millilitre|l|litre|liters|oz|lb|lbs|pcs|pieces|nos|units|count)\b",
            r"नेट",
            r"शुद्ध भार",
        ],
        "description": "Rule 6(1)(c) - Net quantity in standard units",
    },
    {
        "key": "mfg_date",
        "label": "Date of Manufacture / Packing",
        "weight": 15,
        "required": True,
        "patterns": [
            r"(mfg|manufacturing|manufacture|packed|packing)\s*(date|dt)?[\s.:]*\d",
            r"mfg[\s.:-]*\d{2}[\/\-\.]\d{2,4}",
            r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.,-]*\d{4}",
            r"\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2,4}",
            r"निर्माण\s*तिथि",
            r"उत्पादन\s*तिथि",
        ],
        "description": "Rule 6(1)(d) - Month and year of manufacture/packing",
    },
    {
        "key": "expiry_date",
        "label": "Best Before / Use By / Expiry Date",
        "weight": 10,
        "required": False,  # Not mandatory for all categories
        "patterns": [
            r"best\s*before",
            r"use\s*by",
            r"expiry\s*date",
            r"exp[\s.:-]*\d",
            r"bb[\s.:-]*\d",
            r"expires?\s*(on|by)?[\s.:]*\d",
            r"best\s*before\s*end",
            r"consume\s*before",
            r"सर्वोत्तम\s*उपयोग",
            r"समाप्ति\s*तिथि",
        ],
        "description": "Rule 6(1)(e) - Best before or use by date (if applicable)",
    },
    {
        "key": "mrp",
        "label": "Maximum Retail Price (MRP)",
        "weight": 15,
        "required": True,
        "patterns": [
            r"m\.?r\.?p\.?",
            r"maximum\s+retail\s+price",
            r"max\.?\s*retail",
            r"rs\.?\s*\d+",
            r"₹\s*\d+",
            r"inr\s*\d+",
            r"inclusive\s+of\s+all\s+taxes",
            r"incl\.?\s+all\s+tax",
            r"अधिकतम\s*खुदरा\s*मूल्य",
            r"एम\.?आर\.?पी",
        ],
        "description": "Rule 6(1)(f) - MRP inclusive of all taxes",
    },
    {
        "key": "consumer_care",
        "label": "Consumer Care / Grievance Contact",
        "weight": 10,
        "required": True,
        "patterns": [
            r"consumer\s*(care|helpline|service|grievance)",
            r"toll[\s-]*free",
            r"customer\s*(care|service|support)",
            r"helpline",
            r"1800[\s-]*\d",  # Indian toll-free format
            r"contact\s*us",
            r"उपभोक्ता\s*सेवा",
            r"शिकायत",
        ],
        "description": "Rule 6(1) - Consumer care / grievance redressal details",
    },
    {
        "key": "country_of_origin",
        "label": "Country of Origin",
        "weight": 5,
        "required": False,  # Required only for imports
        "patterns": [
            r"country\s*of\s*origin",
            r"made\s*in\s+[a-z]+",
            r"product\s*of\s+[a-z]+",
            r"origin\s*:\s*[a-z]+",
            r"उत्पत्ति\s*देश",
        ],
        "description": "Rule 6(1) - Country of origin (mandatory for imports)",
    },
    {
        "key": "fssai_number",
        "label": "FSSAI Licence Number",
        "weight": 5,
        "required": False,  # Required for food products
        "patterns": [
            r"fssai",
            r"food\s*safety",
            r"lic\.?\s*no\.?\s*\d",
            r"licence\s*no",
            r"fssai\s*lic",
            r"\b\d{14}\b",  # 14-digit FSSAI number
        ],
        "description": "FSSAI licence number (mandatory for food products)",
    },
]

TOTAL_MANDATORY_WEIGHT = sum(
    f["weight"] for f in COMPLIANCE_FIELDS if f["required"]
)

FIELD_CONFIDENCE_THRESHOLD = 0.6
CHECK_RESULTS = (
    "Pass",
    "Fail",
    "NotApplicable",
    "Relaxed",
    "ManualReviewRequired",
)


@dataclass(frozen=True)
class ComplianceCheckResult:
    field_key: str
    result: str
    confidence: Optional[float] = None
    extracted_value: Optional[str] = None
    rule_id: Optional[int] = None
    relaxation_order_id: Optional[int] = None
    notes: Optional[str] = None
    evaluated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        data = asdict(self)
        data["evaluated_at"] = self.evaluated_at.isoformat()
        return data


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    """Lowercase and collapse whitespace."""
    return re.sub(r"\s+", " ", text.lower().strip())


def _check_field(field: dict, text: str) -> bool:
    """Return True if the field is detected in the OCR text."""
    if field.get("auto_detect"):
        return len(text.strip()) > 10  # If OCR produced meaningful text, name is there

    for pattern in field["patterns"]:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def _extract_value(key: str, text: str) -> Optional[str]:
    """
    Attempt to extract the actual value of a field from OCR text.
    Returns a short snippet for display purposes.
    """
    extractors = {
        "net_quantity": r"\b(\d+\.?\d*\s*(g|gm|grams?|kg|kgs?|ml|millilitre|l|litres?|oz|lb|lbs?|pcs|pieces|nos|units|count))\b",
        "mrp": r"(?:m\.?r\.?p\.?|₹|rs\.?)\s*(\d+\.?\d*)",
        "mfg_date": r"(?:mfg|manufactured|packed)\s*(?:date|dt)?[\s.:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\w+\s*\d{4})",
        "expiry_date": r"(?:best\s*before|exp|use\s*by|expires?)[\s.:-]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\w+\s*\d{4})",
        "fssai_number": r"(?:fssai|lic\.?\s*no\.?)[\s.:]*(\d{10,14})",
    }

    pattern = extractors.get(key)
    if pattern:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def _normalize_confidence(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return None
    if confidence > 1:
        confidence = confidence / 100
    return max(0.0, min(confidence, 1.0))


def _field_confidence(field_key: str, field_confidences: dict, overall_confidence: Optional[float]) -> Optional[float]:
    confidence = _normalize_confidence(field_confidences.get(field_key))
    if confidence is not None:
        return confidence
    return _normalize_confidence(overall_confidence)


def _has_extracted_value(value) -> bool:
    return value is not None and str(value).strip() not in ("", "null", "None", "N/A", "n/a")


def evaluate_declarations(scan_context: dict) -> list[ComplianceCheckResult]:
    """
    Evaluate declarations with five possible outcomes.

    Phase 2 keeps COMPLIANCE_FIELDS as the detection catalog, but the outcome is
    now confidence-gated: low confidence always becomes ManualReviewRequired,
    never a guessed Pass or Fail.
    """
    ocr_text = scan_context.get("ocr_text") or scan_context.get("raw_ocr_text") or ""
    normalized_text = _normalize(ocr_text)
    extracted_fields = scan_context.get("extracted_fields") or {}
    field_confidences = scan_context.get("field_confidences") or {}
    overall_confidence = scan_context.get("overall_confidence", scan_context.get("ocr_confidence"))
    low_confidence = bool(scan_context.get("low_confidence") or scan_context.get("low_confidence_ocr"))

    checks: list[ComplianceCheckResult] = []
    now = datetime.utcnow()
    for field in COMPLIANCE_FIELDS:
        key = field["key"]
        confidence = _field_confidence(key, field_confidences, overall_confidence)
        value = extracted_fields.get(key)
        text_present = _check_field(field, normalized_text)
        extracted_value = str(value).strip() if _has_extracted_value(value) else _extract_value(key, normalized_text)
        present = _has_extracted_value(extracted_value) or text_present

        if low_confidence or confidence is None or confidence < FIELD_CONFIDENCE_THRESHOLD:
            result = "ManualReviewRequired"
            notes = "Extraction confidence below threshold; officer review required."
        elif present:
            result = "Pass"
            notes = None
        else:
            result = "Fail"
            notes = None

        checks.append(
            ComplianceCheckResult(
                field_key=key,
                result=result,
                confidence=confidence,
                extracted_value=extracted_value,
                notes=notes,
                evaluated_at=now,
            )
        )

    return checks


def summarize_checks(checks: Sequence[ComplianceCheckResult | object | dict]) -> dict:
    counts = {result: 0 for result in CHECK_RESULTS}

    for check in checks:
        if isinstance(check, dict):
            result = check.get("result")
        else:
            result = getattr(check, "result", None)
            if hasattr(result, "value"):
                result = result.value
        if result in counts:
            counts[result] += 1

    if counts["ManualReviewRequired"]:
        headline = "NeedsManualReview"
    elif counts["Fail"]:
        headline = "HasFailures"
    else:
        headline = "AllPass"

    return {
        "headline": headline,
        "counts": counts,
        "total": sum(counts.values()),
    }


def _legacy_summary_from_checks(checks: Sequence[ComplianceCheckResult]) -> dict:
    field_results = {
        check.field_key: check.result in ("Pass", "Relaxed")
        for check in checks
    }
    extracted_fields = {
        check.field_key: check.extracted_value
        for check in checks
        if _has_extracted_value(check.extracted_value)
    }
    missing_fields = [
        field["label"]
        for field in COMPLIANCE_FIELDS
        if field["required"] and not field_results.get(field["key"], False)
    ]

    mandatory_fields_present = sum(
        1 for field in COMPLIANCE_FIELDS
        if field["required"] and field_results.get(field["key"], False)
    )
    total_mandatory_fields = sum(1 for field in COMPLIANCE_FIELDS if field["required"])
    compliance_score = round((mandatory_fields_present / total_mandatory_fields) * 100, 1)
    summary = summarize_checks(checks)

    if summary["headline"] == "NeedsManualReview":
        remarks = "One or more declarations require manual review because extraction confidence is insufficient."
    elif summary["headline"] == "HasFailures":
        remarks = f"Missing mandatory declarations: {', '.join(missing_fields)}." if missing_fields else "One or more declaration checks failed."
    else:
        remarks = "All evaluated declarations passed."

    return {
        "is_compliant": summary["headline"] == "AllPass",
        "compliance_score": compliance_score,
        "field_results": field_results,
        "missing_fields": missing_fields,
        "extracted_fields": extracted_fields,
        "remarks": remarks,
        "total_fields_checked": len(checks),
        "mandatory_fields_present": mandatory_fields_present,
        "total_mandatory_fields": total_mandatory_fields,
        "compliance_checks": [check.to_dict() for check in checks],
        "compliance_summary": summary,
    }


# ---------------------------------------------------------------------------
# Main compliance check function
# ---------------------------------------------------------------------------

def check_compliance(ocr_text: str, category: str = "general") -> dict:
    """
    Run the full compliance check against the extracted OCR text.

    Args:
        ocr_text: Raw text from Tesseract OCR
        category: Product category (food, cosmetic, textile, general)

    Returns:
        A dict with compliance result, score, field results, missing fields,
        extracted values, and remarks.
    """
    checks = evaluate_declarations({
        "ocr_text": ocr_text,
        "category": category,
        "overall_confidence": 1.0,
        "low_confidence": False,
    })
    return _legacy_summary_from_checks(checks)


def get_field_definitions() -> list:
    """Return all compliance field definitions (for frontend reference)."""
    return [
        {
            "key": f["key"],
            "label": f["label"],
            "required": f["required"],
            "weight": f["weight"],
            "description": f["description"],
        }
        for f in COMPLIANCE_FIELDS
    ]
