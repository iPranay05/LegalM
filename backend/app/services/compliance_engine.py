"""
Compliance Engine for Legal Metrology (Packaged Commodities) Rules, 2011.

Versioned, category-aware rule engine with 5-outcome evaluation and
confidence-gated decision support.

Outcomes (ComplianceCheckResult):
- Pass: Confident presence and compliance with rule specifications.
- Fail: Confident absence or violation of rule specifications.
- ManualReviewRequired: Extraction or calibration confidence below threshold. Never guesses.
- NotApplicable: Rule does not apply to this commodity category / evaluation date.
- Relaxed: Confirmed non-compliance excused by a valid, active RelaxationOrder.
"""

import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, date
from typing import Optional, Sequence, List, Union
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.rules import Rule, RelaxationOrder, RuleCheckType, ComplianceCheckResult as ModelCheckResult
from app.models.commodity_category import CommodityCategory

# ---------------------------------------------------------------------------
# Default field patterns catalog (used for Presence/Format rule dispatch)
# ---------------------------------------------------------------------------

COMPLIANCE_FIELDS = [
    {
        "key": "manufacturer_info",
        "rule_family": "manufacturer_info",
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
        "rule_family": "product_name",
        "label": "Common / Generic Name of Commodity",
        "weight": 10,
        "required": True,
        "patterns": [],
        "description": "Rule 6(1)(b) - Generic name of the product",
        "auto_detect": True,
    },
    {
        "key": "net_quantity",
        "rule_family": "net_quantity",
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
        "rule_family": "mfg_date",
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
        "rule_family": "expiry_date",
        "label": "Best Before / Use By / Expiry Date",
        "weight": 10,
        "required": False,
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
        "rule_family": "mrp",
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
        "rule_family": "consumer_care",
        "label": "Consumer Care / Grievance Contact",
        "weight": 10,
        "required": True,
        "patterns": [
            r"consumer\s*(care|helpline|service|grievance)",
            r"toll[\s-]*free",
            r"customer\s*(care|service|support)",
            r"helpline",
            r"1800[\s-]*\d",
            r"contact\s*us",
            r"उपभोक्ता\s*सेवा",
            r"शिकायत",
        ],
        "description": "Rule 6(1) - Consumer care / grievance redressal details",
    },
    {
        "key": "country_of_origin",
        "rule_family": "country_of_origin",
        "label": "Country of Origin",
        "weight": 5,
        "required": False,
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
        "rule_family": "fssai_number",
        "label": "FSSAI Licence Number",
        "weight": 5,
        "required": False,
        "patterns": [
            r"fssai",
            r"food\s*safety",
            r"lic\.?\s*no\.?\s*\d",
            r"licence\s*no",
            r"fssai\s*lic",
            r"\b\d{14}\b",
        ],
        "description": "FSSAI licence number (mandatory for food products)",
    },
    {
        "key": "font_size",
        "rule_family": "font_size",
        "label": "Minimum Declaration Font Size",
        "weight": 0,
        "required": True,
        "patterns": [],
        "description": "Rule 8 - Minimum font size verification requires calibrated physical measurement",
    },
]

COMPLIANCE_FIELD_MAP = {f["key"]: f for f in COMPLIANCE_FIELDS}

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
    image_index: Optional[int] = 0
    bounding_box: Optional[dict] = None
    evaluated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        data = asdict(self)
        data["evaluated_at"] = self.evaluated_at.isoformat()
        return data


# ---------------------------------------------------------------------------
# Rule Selection Query (Plan §3.2 point 4)
# ---------------------------------------------------------------------------

def get_active_rules(
    category: Optional[Union[CommodityCategory, int, str]] = None,
    evaluation_date: Optional[Union[date, datetime]] = None,
    db: Optional[Session] = None,
) -> List[Rule]:
    """
    Select active rules applicable to a commodity category as of evaluation_date.
    
    Query:
      Rule.is_active == True,
      effective_from <= evaluation_date,
      (effective_to is null or effective_to >= evaluation_date),
      (commodity_category_id is null or commodity_category_id == category.id)
    """
    if db is None:
        return []

    if evaluation_date is None:
        eval_d = date.today()
    elif isinstance(evaluation_date, datetime):
        eval_d = evaluation_date.date()
    else:
        eval_d = evaluation_date

    cat_id = None
    if isinstance(category, CommodityCategory):
        cat_id = category.id
    elif isinstance(category, int):
        cat_id = category
    elif isinstance(category, str) and category:
        cat_obj = db.query(CommodityCategory).filter(CommodityCategory.name.ilike(category.strip())).first()
        if cat_obj:
            cat_id = cat_obj.id

    q = db.query(Rule).filter(
        Rule.is_active == True,
        Rule.effective_from <= eval_d,
        or_(Rule.effective_to == None, Rule.effective_to >= eval_d),
    )

    if cat_id is not None:
        # FSSAI licence detection and the veg/non-veg symbol are always
        # evaluated when visible, even if a user selected General; category
        # controls whether the declaration is mandatory (see the NotApplicable
        # exemption below for non-food categories), not whether the
        # vision/OCR/OpenCV extractors are allowed to look for it.
        q = q.filter(or_(Rule.commodity_category_id == None,
                         Rule.commodity_category_id == cat_id,
                         Rule.rule_family == "fssai_number",
                         Rule.rule_family == "veg_non_veg_symbol"))
    else:
        q = q.filter(Rule.commodity_category_id == None)

    return q.order_by(Rule.code).all()


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    """Lowercase and collapse whitespace."""
    return re.sub(r"\s+", " ", text.lower().strip())


def _check_field(field: dict, text: str) -> bool:
    """Return True if the field is detected in the OCR text."""
    if field.get("auto_detect"):
        return len(text.strip()) > 10

    for pattern in field.get("patterns", []):
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def _extract_value(key: str, text: str) -> Optional[str]:
    """
    Attempt to extract the actual value of a field from OCR text.
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

    # FSSAI licence numbers are a distinctive, unique-length 14-digit run.
    # OCR frequently garbles the preceding "FSSAI"/"Lic. No." keyword on
    # small print, which would otherwise make the keyworded pattern above
    # miss a number that is genuinely on the label. A bare 14-digit run is
    # specific enough on its own to be a safe fallback (nothing else on a
    # commodity label is normally exactly 14 digits).
    if key == "fssai_number":
        bare_match = re.search(r"\b(\d{14})\b", text)
        if bare_match:
            return bare_match.group(1)

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


# ---------------------------------------------------------------------------
# Core Evaluation Engine (Plan §2.2, §3.2, §3.4)
# ---------------------------------------------------------------------------

def evaluate_declarations(scan_context: dict) -> list[ComplianceCheckResult]:
    """
    Evaluate declarations with five possible outcomes:
      - Pass
      - Fail
      - ManualReviewRequired
      - NotApplicable
      - Relaxed
    """
    ocr_text = scan_context.get("ocr_text") or scan_context.get("raw_ocr_text") or ""
    normalized_text = _normalize(ocr_text)
    extracted_fields = scan_context.get("extracted_fields") or {}
    field_confidences = scan_context.get("field_confidences") or {}
    field_bboxes = scan_context.get("field_bboxes") or {}
    image_index = scan_context.get("image_index", 0)
    overall_confidence = scan_context.get("overall_confidence", scan_context.get("ocr_confidence"))
    low_confidence = bool(scan_context.get("low_confidence") or scan_context.get("low_confidence_ocr"))

    db: Optional[Session] = scan_context.get("db")
    eval_date = scan_context.get("evaluation_date") or scan_context.get("evaluated_at") or date.today()
    if isinstance(eval_date, datetime):
        eval_date = eval_date.date()

    manufacturer_id = scan_context.get("manufacturer_id")
    product_id = scan_context.get("product_id")

    # Resolve CommodityCategory
    category_input = scan_context.get("commodity_category") or scan_context.get("category_obj") or scan_context.get("category")
    category_obj: Optional[CommodityCategory] = None
    if isinstance(category_input, CommodityCategory):
        category_obj = category_input
    elif db and isinstance(category_input, str):
        category_obj = db.query(CommodityCategory).filter(CommodityCategory.name.ilike(category_input.strip())).first()
    elif db and isinstance(category_input, int):
        category_obj = db.query(CommodityCategory).filter(CommodityCategory.id == category_input).first()

    # Determine active rules
    active_rules: Optional[List[Rule]] = scan_context.get("active_rules")
    if active_rules is None and db:
        active_rules = get_active_rules(category=category_obj or category_input, evaluation_date=eval_date, db=db)

    checks: list[ComplianceCheckResult] = []
    now = datetime.utcnow()

    # If active_rules are available from DB or context, evaluate per Rule row
    if active_rules:
        for rule in active_rules:
            key = rule.rule_family or rule.code
            rule_id = rule.id
            check_type = rule.check_type
            if hasattr(check_type, "value"):
                check_type = check_type.value

            confidence = _field_confidence(key, field_confidences, overall_confidence)
            value = extracted_fields.get(key)
            extracted_value = str(value).strip() if _has_extracted_value(value) else _extract_value(key, normalized_text)
            relaxation_order_id = None
            notes = None
            bbox = field_bboxes.get(key)

            if key == "fssai_number" and category_obj and not category_obj.is_food:
                checks.append(ComplianceCheckResult(
                    field_key=key, result="NotApplicable", confidence=confidence,
                    extracted_value=extracted_value, rule_id=rule_id,
                    notes="Detected when visible, but not mandatory for this category.",
                    image_index=image_index, bounding_box=bbox,
                ))
                continue

            if key == "veg_non_veg_symbol" and category_obj and not category_obj.is_food:
                symbols_ctx = scan_context.get("symbols") or {}
                mark_seen = bool(symbols_ctx.get("veg_dot") or symbols_ctx.get("non_veg_dot"))
                checks.append(ComplianceCheckResult(
                    field_key=key,
                    result="Pass" if mark_seen else "NotApplicable",
                    confidence=confidence, extracted_value=extracted_value, rule_id=rule_id,
                    notes="Detected when visible, but not mandatory for this category."
                          if mark_seen else "Not mandatory for this category.",
                    image_index=image_index, bounding_box=bbox,
                ))
                continue

            # ── CheckType: FontSize ──────────────────────────────────────────
            if check_type == "FontSize":
                # Check for category exemption (e.g. Medical Device)
                if category_obj and category_obj.font_rule_exempted:
                    result = "NotApplicable"
                    notes = "Excluded — governed by Medical Devices Rules, 2017"
                else:
                    calibration = scan_context.get("calibration") or {}
                    cal_method = calibration.get("method")
                    if not cal_method or cal_method == "unverified":
                        result = "ManualReviewRequired"
                        notes = "Unverified calibration: physical font size cannot be determined reliably."
                    else:
                        mm_per_px_y = calibration.get("mm_per_px_y")
                        bboxes = scan_context.get("bounding_boxes") or []
                        if not isinstance(mm_per_px_y, (int, float)) or mm_per_px_y <= 0 or not bboxes:
                            result = "ManualReviewRequired"
                            notes = "Calibration lacks a measured scale or localized text; officer review required."
                            mm_per_px_y = None
                        else:
                            font_pass = True
                            for b in bboxes:
                                raw_bbox = b.get("bbox") if isinstance(b, dict) else None
                                if isinstance(raw_bbox, dict):
                                    h_px = float(raw_bbox.get("y_max", 0)) - float(raw_bbox.get("y_min", 0))
                                elif isinstance(raw_bbox, (list, tuple)) and len(raw_bbox) >= 4:
                                    h_px = float(raw_bbox[3])
                                else:
                                    result = "ManualReviewRequired"
                                    notes = "Font declaration has no genuine localized bounding box; officer review required."
                                    font_pass = None
                                    break
                                if h_px * mm_per_px_y < 1.0:
                                    font_pass = False
                                    break
                            if font_pass is True:
                                result = "Pass"
                            elif font_pass is False:
                                result = "Fail"
                                notes = "Font size below minimum prescribed height under Rule 7."

            # ── CheckType: StandardSize ──────────────────────────────────────
            elif check_type == "StandardSize":
                net_qty_val = str(extracted_fields.get("net_quantity") or _extract_value("net_quantity", normalized_text) or "").lower().strip()
                if not net_qty_val:
                    if low_confidence:
                        result = "ManualReviewRequired"
                        notes = "Could not extract net quantity to verify standard size."
                    else:
                        result = "Fail"
                        notes = "Net quantity declaration missing for standard size verification."
                else:
                    match = re.search(r"(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams|kg|kgs|kilogram|ml|millilitre|l|litre|litres)", net_qty_val)
                    if match:
                        num = float(match.group(1))
                        unit = match.group(2)
                        if unit in ("kg", "kgs", "kilogram", "l", "litre", "litres"):
                            size = num * 1000
                        else:
                            size = num
                        STANDARD_SIZES = {25, 50, 100, 200, 250, 400, 500, 750, 1000, 1500, 2000, 5000, 15000}
                        if size in STANDARD_SIZES or (size >= 1000 and size % 500 == 0):
                            result = "Pass"
                        else:
                            result = "Fail"
                            notes = f"Pack size '{net_qty_val}' is not a prescribed standard size under the Second Schedule / Fifth Schedule."
                    else:
                        result = "ManualReviewRequired"
                        notes = "Net quantity could not be parsed for standard-size verification."

            # ── CheckType: Symbol ────────────────────────────────────────────
            elif check_type == "Symbol":
                symbols = scan_context.get("symbols") or {}
                if key == "veg_non_veg_symbol":
                    if symbols.get("veg_dot") or symbols.get("non_veg_dot"):
                        result = "Pass"
                    else:
                        result = "Fail"
                        notes = "Mandatory veg / non-veg symbol not detected."
                else:
                    result = "Pass"

            # ── CheckType: Presence / Format / Generic ──────────────────────
            else:
                field_def = COMPLIANCE_FIELD_MAP.get(key, {"patterns": [], "auto_detect": False})
                text_present = _check_field(field_def, normalized_text)
                present = _has_extracted_value(extracted_value) or text_present

                if low_confidence or confidence is None or confidence < FIELD_CONFIDENCE_THRESHOLD:
                    result = "ManualReviewRequired"
                    notes = "Extraction confidence below threshold; officer review required."
                elif present:
                    result = "Pass"
                else:
                    result = "Fail"

            # ── Relaxation Order Hook (Plan §3.2 point 6) ───────────────────
            if result == "Fail" and db and manufacturer_id and rule_id:
                order = db.query(RelaxationOrder).filter(
                    RelaxationOrder.rule_id == rule_id,
                    RelaxationOrder.manufacturer_id == manufacturer_id,
                    or_(RelaxationOrder.product_id == None, RelaxationOrder.product_id == product_id),
                    RelaxationOrder.is_active == True,
                    RelaxationOrder.valid_from <= eval_date,
                    RelaxationOrder.valid_until >= eval_date,
                ).first()
                if order:
                    result = "Relaxed"
                    relaxation_order_id = order.id
                    notes = f"Relaxed under order {order.order_number}"

            checks.append(
                ComplianceCheckResult(
                    field_key=key,
                    result=result,
                    confidence=confidence,
                    extracted_value=extracted_value,
                    rule_id=rule_id,
                    relaxation_order_id=relaxation_order_id,
                    notes=notes,
                    image_index=image_index,
                    bounding_box=bbox,
                    evaluated_at=now,
                )
            )

        return checks

    # Fallback to COMPLIANCE_FIELDS catalog (for purely in-memory unit tests)
    for field in COMPLIANCE_FIELDS:
        key = field["key"]
        confidence = _field_confidence(key, field_confidences, overall_confidence)
        value = extracted_fields.get(key)
        text_present = _check_field(field, normalized_text)
        extracted_value = str(value).strip() if _has_extracted_value(value) else _extract_value(key, normalized_text)
        present = _has_extracted_value(extracted_value) or text_present
        bbox = field_bboxes.get(key)

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
                image_index=image_index,
                bounding_box=bbox,
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
        COMPLIANCE_FIELD_MAP.get(check.field_key, {}).get("label", check.field_key)
        for check in checks
        if check.result == "Fail"
    ]

    mandatory_fields_present = sum(
        1 for check in checks
        if check.result in ("Pass", "Relaxed")
    )
    # NotApplicable rules (for example FSSAI on a non-food scan) must not
    # dilute the score denominator. Manual review remains unresolved and is
    # intentionally counted, preserving the prior 8/9 = 88.9% behaviour.
    total_mandatory_fields = sum(1 for check in checks if check.result != "NotApplicable")
    compliance_score = round((mandatory_fields_present / total_mandatory_fields * 100), 1) if total_mandatory_fields else 100.0
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
    Run compliance check against extracted OCR text.
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
