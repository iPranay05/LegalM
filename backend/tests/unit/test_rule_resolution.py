"""
Phase 3 Unit Tests: Category-Aware, Versioned Rule Engine & Relaxation Orders
Covers IMPLEMENTATION_PLAN_V2.md §3.2 point 5, §3.4, and §3.2 point 6.

Test matrix:
  1. Standard-size four-scenario versioned rule test:
     - Milk-powder (General category) in 2015-06-01 -> standard_size_general applies (Pass/Fail per net qty).
     - Milk-powder in 2023-01-01 -> NotApplicable (standard_size_general retired in 2022-09-30, not Pass).
     - Edible Oil in 2023-01-01 -> NotApplicable (edible oil standard-size rule has not started yet).
     - Edible Oil in 2026-07-01 -> standard_size_edible_oil applies.
  2. Relaxation order matching and near-misses:
     - Matching rule + manufacturer + date -> Relaxed
     - Wrong manufacturer -> Fail
     - Wrong rule -> Fail
     - Outside valid date range -> Fail
  3. Medical Device font-size exemption:
     - Medical Device category -> NotApplicable with "Excluded — governed by Medical Devices Rules, 2017"
  4. FontSize calibration check:
     - Unverified calibration -> ManualReviewRequired
"""

from datetime import date
import pytest
from sqlalchemy.orm import Session

from app.models.commodity_category import CommodityCategory
from app.models.rules import Rule, RelaxationOrder, RuleCheckType
from app.models.manufacturer import Manufacturer
from app.models.product import Product
from app.services.compliance_engine import evaluate_declarations, get_active_rules
from app.services.seed_data import seed_rules, seed_categories


@pytest.fixture(autouse=True)
def setup_seed_data(db_session: Session):
    """Seed categories and rules for each test."""
    seed_rules(db_session)


# ─── 1. Standard-Size Worked Example (Plan §3.2 point 5) ───────────────────────

def test_standard_size_milk_powder_in_2015_applies_general_rule(db_session: Session):
    """Scenario 1: Milk powder (General/Food category) in 2015 -> general standard-size rule in force."""
    eval_date = date(2015, 6, 1)
    general_cat = db_session.query(CommodityCategory).filter(CommodityCategory.name == "General").first()
    active_rules = get_active_rules(category=general_cat, evaluation_date=eval_date, db=db_session)
    rule_families = [r.rule_family for r in active_rules]
    assert "standard_size_general" in rule_families

    # Evaluated with standard 500g -> Pass
    context = {
        "ocr_text": "Net Wt 500g",
        "extracted_fields": {"net_quantity": "500g"},
        "field_confidences": {"net_quantity": 0.9},
        "commodity_category": general_cat,
        "evaluation_date": eval_date,
        "active_rules": active_rules,
        "db": db_session,
    }
    checks = evaluate_declarations(context)
    ss_check = next(c for c in checks if c.field_key == "standard_size_general")
    assert ss_check.result == "Pass"


def test_standard_size_milk_powder_in_2023_is_not_applicable(db_session: Session):
    """Scenario 2: Milk powder in 2023 -> standard_size_general ended 2022-09-30, not in active rules."""
    eval_date = date(2023, 1, 1)
    general_cat = db_session.query(CommodityCategory).filter(CommodityCategory.name == "General").first()
    active_rules = get_active_rules(category=general_cat, evaluation_date=eval_date, db=db_session)
    rule_families = [r.rule_family for r in active_rules]
    assert "standard_size_general" not in rule_families
    assert "standard_size_edible_oil" not in rule_families


def test_standard_size_edible_oil_in_2023_is_not_applicable(db_session: Session):
    """Scenario 3: Edible Oil in 2023 -> edible oil standard-size rule has not started yet (starts 2026-06-01)."""
    eval_date = date(2023, 1, 1)
    oil_cat = db_session.query(CommodityCategory).filter(CommodityCategory.name == "Edible Oil").first()
    active_rules = get_active_rules(category=oil_cat, evaluation_date=eval_date, db=db_session)
    rule_families = [r.rule_family for r in active_rules]
    assert "standard_size_general" not in rule_families
    assert "standard_size_edible_oil" not in rule_families


def test_standard_size_edible_oil_in_2026_july_applies_fourth_schedule(db_session: Session):
    """Scenario 4: Edible Oil in 2026-07 -> Fourth Schedule rule is active."""
    eval_date = date(2026, 7, 1)
    oil_cat = db_session.query(CommodityCategory).filter(CommodityCategory.name == "Edible Oil").first()
    active_rules = get_active_rules(category=oil_cat, evaluation_date=eval_date, db=db_session)
    rule_families = [r.rule_family for r in active_rules]
    assert "standard_size_edible_oil" in rule_families

    # 1L is standard -> Pass
    context = {
        "ocr_text": "Net Vol 1L",
        "extracted_fields": {"net_quantity": "1L"},
        "field_confidences": {"net_quantity": 0.95},
        "commodity_category": oil_cat,
        "evaluation_date": eval_date,
        "active_rules": active_rules,
        "db": db_session,
    }
    checks = evaluate_declarations(context)
    ss_check = next(c for c in checks if c.field_key == "standard_size_edible_oil")
    assert ss_check.result == "Pass"

    # 730ml is non-standard -> Fail
    context_fail = {
        "ocr_text": "Net Vol 730ml",
        "extracted_fields": {"net_quantity": "730ml"},
        "field_confidences": {"net_quantity": 0.95},
        "commodity_category": oil_cat,
        "evaluation_date": eval_date,
        "active_rules": active_rules,
        "db": db_session,
    }
    checks_fail = evaluate_declarations(context_fail)
    ss_check_fail = next(c for c in checks_fail if c.field_key == "standard_size_edible_oil")
    assert ss_check_fail.result == "Fail"


# ─── 2. Relaxation Order Hook & Near-Miss Tests (Plan §3.2 point 6) ─────────────

def test_relaxation_order_matches_and_relaxes_failure(db_session: Session):
    """When a rule evaluation fails but a matching relaxation order is active -> Relaxed."""
    mfr = Manufacturer(name="Acme Foods Ltd", contact_email="mfr@acme.com", is_active=True)
    db_session.add(mfr)
    db_session.commit()

    mrp_rule = db_session.query(Rule).filter(Rule.rule_family == "mrp").first()
    assert mrp_rule is not None

    order = RelaxationOrder(
        order_number="RO-2026-001",
        rule_id=mrp_rule.id,
        manufacturer_id=mfr.id,
        title="Temporary MRP exemption for packaging redesign",
        valid_from=date(2026, 1, 1),
        valid_until=date(2026, 12, 31),
        is_active=True,
    )
    db_session.add(order)
    db_session.commit()

    # Scan with missing MRP
    context = {
        "ocr_text": "Product Label without price declaration",
        "extracted_fields": {},
        "overall_confidence": 0.95,
        "evaluation_date": date(2026, 6, 1),
        "manufacturer_id": mfr.id,
        "active_rules": [mrp_rule],
        "db": db_session,
    }
    checks = evaluate_declarations(context)
    mrp_check = next(c for c in checks if c.field_key == "mrp")

    assert mrp_check.result == "Relaxed"
    assert mrp_check.relaxation_order_id == order.id


def test_relaxation_order_near_miss_wrong_manufacturer_stays_fail(db_session: Session):
    """Near-miss 1: Relaxation order belongs to another manufacturer -> stays Fail."""
    mfr_a = Manufacturer(name="Mfr A", contact_email="a@test.com", is_active=True)
    mfr_b = Manufacturer(name="Mfr B", contact_email="b@test.com", is_active=True)
    db_session.add_all([mfr_a, mfr_b])
    db_session.commit()

    mrp_rule = db_session.query(Rule).filter(Rule.rule_family == "mrp").first()
    order = RelaxationOrder(
        order_number="RO-MFR-A",
        rule_id=mrp_rule.id,
        manufacturer_id=mfr_a.id,
        title="Exemption for Mfr A only",
        valid_from=date(2026, 1, 1),
        valid_until=date(2026, 12, 31),
        is_active=True,
    )
    db_session.add(order)
    db_session.commit()

    # Mfr B scan -> should NOT be relaxed
    context = {
        "ocr_text": "Product without price",
        "extracted_fields": {},
        "overall_confidence": 0.95,
        "evaluation_date": date(2026, 6, 1),
        "manufacturer_id": mfr_b.id,
        "active_rules": [mrp_rule],
        "db": db_session,
    }
    checks = evaluate_declarations(context)
    mrp_check = next(c for c in checks if c.field_key == "mrp")
    assert mrp_check.result == "Fail"


def test_relaxation_order_near_miss_wrong_rule_stays_fail(db_session: Session):
    """Near-miss 2: Relaxation order is for net_quantity, but MRP fails -> MRP stays Fail."""
    mfr = Manufacturer(name="Acme", contact_email="acme@test.com", is_active=True)
    db_session.add(mfr)
    db_session.commit()

    net_qty_rule = db_session.query(Rule).filter(Rule.rule_family == "net_quantity").first()
    mrp_rule = db_session.query(Rule).filter(Rule.rule_family == "mrp").first()

    order = RelaxationOrder(
        order_number="RO-NET-QTY",
        rule_id=net_qty_rule.id,
        manufacturer_id=mfr.id,
        title="Net Quantity relaxation",
        valid_from=date(2026, 1, 1),
        valid_until=date(2026, 12, 31),
        is_active=True,
    )
    db_session.add(order)
    db_session.commit()

    context = {
        "ocr_text": "Sample generic label with only brand logo",
        "extracted_fields": {},
        "overall_confidence": 0.95,
        "evaluation_date": date(2026, 6, 1),
        "manufacturer_id": mfr.id,
        "active_rules": [mrp_rule],
        "db": db_session,
    }
    checks = evaluate_declarations(context)
    mrp_check = next(c for c in checks if c.field_key == "mrp")
    assert mrp_check.result == "Fail"


def test_relaxation_order_near_miss_expired_stays_fail(db_session: Session):
    """Near-miss 3: Evaluation date is outside the relaxation order's validity window -> stays Fail."""
    mfr = Manufacturer(name="Acme", contact_email="acme@test.com", is_active=True)
    db_session.add(mfr)
    db_session.commit()

    mrp_rule = db_session.query(Rule).filter(Rule.rule_family == "mrp").first()
    order = RelaxationOrder(
        order_number="RO-EXPIRED",
        rule_id=mrp_rule.id,
        manufacturer_id=mfr.id,
        title="Expired relaxation",
        valid_from=date(2025, 1, 1),
        valid_until=date(2025, 12, 31),  # Expired
        is_active=True,
    )
    db_session.add(order)
    db_session.commit()

    context = {
        "ocr_text": "Sample generic label with only brand logo",
        "extracted_fields": {},
        "overall_confidence": 0.95,
        "evaluation_date": date(2026, 6, 1),  # after valid_until
        "manufacturer_id": mfr.id,
        "active_rules": [mrp_rule],
        "db": db_session,
    }
    checks = evaluate_declarations(context)
    mrp_check = next(c for c in checks if c.field_key == "mrp")
    assert mrp_check.result == "Fail"


# ─── 3. Medical Device Font-Size Exemption (Plan §3.4) ──────────────────────────

def test_medical_device_font_size_exemption(db_session: Session):
    """Medical Device category -> FontSize rule is NotApplicable with legal note."""
    med_cat = db_session.query(CommodityCategory).filter(CommodityCategory.name == "Medical Device").first()
    assert med_cat.font_rule_exempted is True

    font_rule = db_session.query(Rule).filter(Rule.rule_family == "font_size").first()

    context = {
        "ocr_text": "Medical device sample label",
        "commodity_category": med_cat,
        "active_rules": [font_rule],
        "calibration": {"method": "reference_marker", "mm_per_px_y": 0.1},
        "db": db_session,
    }
    checks = evaluate_declarations(context)
    font_check = next(c for c in checks if c.field_key == "font_size")

    assert font_check.result == "NotApplicable"
    assert font_check.notes == "Excluded — governed by Medical Devices Rules, 2017"


# ─── 4. FontSize Calibration Check (Plan §3.4) ──────────────────────────────────

def test_font_size_unverified_calibration_requires_manual_review(db_session: Session):
    """General category + unverified calibration -> FontSize check yields ManualReviewRequired."""
    general_cat = db_session.query(CommodityCategory).filter(CommodityCategory.name == "General").first()
    font_rule = db_session.query(Rule).filter(Rule.rule_family == "font_size").first()

    context = {
        "ocr_text": "Sample food product label",
        "commodity_category": general_cat,
        "active_rules": [font_rule],
        "calibration": {"method": "unverified"},
        "db": db_session,
    }
    checks = evaluate_declarations(context)
    font_check = next(c for c in checks if c.field_key == "font_size")

    assert font_check.result == "ManualReviewRequired"
    assert "Unverified calibration" in font_check.notes
