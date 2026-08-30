"""
Seed Data helper for Commodity Categories and Rules.
"""
from datetime import date
from sqlalchemy.orm import Session
from app.models.commodity_category import CommodityCategory
from app.models.rules import Rule, RuleCheckType


def seed_categories(db: Session) -> dict[str, CommodityCategory]:
    """Seed the 4 core commodity categories if not existing."""
    categories_data = [
        {
            "name": "General",
            "is_food": False,
            "is_medical_device": False,
            "requires_standard_size": False,
            "font_rule_exempted": False,
        },
        {
            "name": "Food",
            "is_food": True,
            "is_medical_device": False,
            "requires_standard_size": False,
            "font_rule_exempted": False,
        },
        {
            "name": "Edible Oil",
            "is_food": True,
            "is_medical_device": False,
            "requires_standard_size": True,
            "font_rule_exempted": False,
        },
        {
            "name": "Medical Device",
            "is_food": False,
            "is_medical_device": True,
            "requires_standard_size": False,
            "font_rule_exempted": True,
        },
    ]

    result = {}
    for data in categories_data:
        cat = db.query(CommodityCategory).filter(CommodityCategory.name == data["name"]).first()
        if not cat:
            cat = CommodityCategory(**data)
            db.add(cat)
            db.flush()
        result[data["name"]] = cat

    db.commit()
    return result


def seed_rules(db: Session) -> list[Rule]:
    """Seed universal and versioned rules."""
    cats = seed_categories(db)
    food_cat = cats["Food"]
    edible_oil_cat = cats["Edible Oil"]

    rules_data = [
        {
            "rule_family": "manufacturer_info",
            "code": "LM-PC-R6-01",
            "title": "Manufacturer / Packer / Importer Name & Address",
            "description": "Rule 6(1)(a) - Name and complete address of manufacturer/packer/importer",
            "legal_reference": "Rule 6(1)(a), LM(PC) Rules 2011",
            "effective_from": date(2011, 4, 1),
            "effective_to": None,
            "commodity_category_id": None,
            "check_type": RuleCheckType.Presence,
            "is_mandatory": True,
            "weight": 15,
        },
        {
            "rule_family": "product_name",
            "code": "LM-PC-R6-02",
            "title": "Common / Generic Name of Commodity",
            "description": "Rule 6(1)(b) - Generic name of the product",
            "legal_reference": "Rule 6(1)(b), LM(PC) Rules 2011",
            "effective_from": date(2011, 4, 1),
            "effective_to": None,
            "commodity_category_id": None,
            "check_type": RuleCheckType.Presence,
            "is_mandatory": True,
            "weight": 10,
        },
        {
            "rule_family": "net_quantity",
            "code": "LM-PC-R6-03",
            "title": "Net Quantity Declaration",
            "description": "Rule 6(1)(c) - Net quantity in standard units",
            "legal_reference": "Rule 6(1)(c), LM(PC) Rules 2011",
            "effective_from": date(2011, 4, 1),
            "effective_to": None,
            "commodity_category_id": None,
            "check_type": RuleCheckType.Presence,
            "is_mandatory": True,
            "weight": 15,
        },
        {
            "rule_family": "mfg_date",
            "code": "LM-PC-R6-04",
            "title": "Date of Manufacture / Packing",
            "description": "Rule 6(1)(d) - Month and year of manufacture/packing",
            "legal_reference": "Rule 6(1)(d), LM(PC) Rules 2011",
            "effective_from": date(2011, 4, 1),
            "effective_to": None,
            "commodity_category_id": None,
            "check_type": RuleCheckType.Presence,
            "is_mandatory": True,
            "weight": 15,
        },
        {
            "rule_family": "expiry_date",
            "code": "LM-PC-R6-05",
            "title": "Best Before / Use By / Expiry Date",
            "description": "Rule 6(1)(e) - Best before or use by date (if applicable)",
            "legal_reference": "Rule 6(1)(e), LM(PC) Rules 2011",
            "effective_from": date(2011, 4, 1),
            "effective_to": None,
            "commodity_category_id": None,
            "check_type": RuleCheckType.Presence,
            "is_mandatory": False,
            "weight": 10,
        },
        {
            "rule_family": "mrp",
            "code": "LM-PC-R6-06",
            "title": "Maximum Retail Price (MRP)",
            "description": "Rule 6(1)(f) - MRP inclusive of all taxes",
            "legal_reference": "Rule 6(1)(f), LM(PC) Rules 2011",
            "effective_from": date(2011, 4, 1),
            "effective_to": None,
            "commodity_category_id": None,
            "check_type": RuleCheckType.Presence,
            "is_mandatory": True,
            "weight": 15,
        },
        {
            "rule_family": "consumer_care",
            "code": "LM-PC-R6-07",
            "title": "Consumer Care / Grievance Contact",
            "description": "Rule 6(1) - Consumer care / grievance redressal details",
            "legal_reference": "Rule 6(1), LM(PC) Rules 2011",
            "effective_from": date(2011, 4, 1),
            "effective_to": None,
            "commodity_category_id": None,
            "check_type": RuleCheckType.Presence,
            "is_mandatory": True,
            "weight": 10,
        },
        {
            "rule_family": "country_of_origin",
            "code": "LM-PC-R6-08",
            "title": "Country of Origin",
            "description": "Rule 6(1) - Country of origin (mandatory for imports)",
            "legal_reference": "Rule 6(1), LM(PC) Rules 2011",
            "effective_from": date(2011, 4, 1),
            "effective_to": None,
            "commodity_category_id": None,
            "check_type": RuleCheckType.Presence,
            "is_mandatory": False,
            "weight": 5,
        },
        {
            "rule_family": "fssai_number",
            "code": "LM-PC-R6-09",
            "title": "FSSAI Licence Number",
            "description": "FSSAI licence number (mandatory for food products)",
            "legal_reference": "Rule 6(1) / FSS Act 2006",
            "effective_from": date(2011, 4, 1),
            "effective_to": None,
            "commodity_category_id": food_cat.id,
            "check_type": RuleCheckType.Presence,
            "is_mandatory": True,
            "weight": 5,
        },
        {
            "rule_family": "veg_non_veg_symbol",
            "code": "LM-PC-R6-10",
            "title": "Veg / Non-Veg Symbol",
            "description": "FSSAI-mandated green (veg) or brown (non-veg) dot-in-square mark for food products",
            "legal_reference": "FSS (Labelling & Display) Regulations, 2020, Reg. 8",
            "effective_from": date(2011, 4, 1),
            "effective_to": None,
            "commodity_category_id": food_cat.id,
            "check_type": RuleCheckType.Symbol,
            "is_mandatory": True,
            "weight": 5,
        },
        {
            "rule_family": "font_size",
            "code": "LM-PC-R7-01",
            "title": "Minimum Height of Numerals and Letters",
            "description": "Rule 7 & 8 - Prescribed font height based on area/net quantity",
            "legal_reference": "Rule 7 & 8, LM(PC) Rules 2011",
            "effective_from": date(2011, 4, 1),
            "effective_to": None,
            "commodity_category_id": None,
            "check_type": RuleCheckType.FontSize,
            "is_mandatory": True,
            "weight": 10,
        },
        # Standard-Size Worked Example (Plan §3.2 point 5)
        {
            "rule_family": "standard_size_general",
            "code": "LM-PC-R5-SS-GEN",
            "title": "Standard Pack Sizes (Fifth Schedule)",
            "description": "Universal standard pack sizes under the Fifth Schedule",
            "legal_reference": "Rule 5 & Fifth Schedule, LM(PC) Rules 2011",
            "effective_from": date(2011, 4, 1),
            "effective_to": date(2022, 9, 30),
            "commodity_category_id": None,
            "check_type": RuleCheckType.StandardSize,
            "is_mandatory": True,
            "weight": 10,
        },
        {
            "rule_family": "standard_size_edible_oil",
            "code": "LM-PC-R5-SS-OIL",
            "title": "Standard Pack Sizes - Edible Oils (Second Amendment 2022 / Fourth Schedule)",
            "description": "Edible oil standard pack sizes introduced under Second Amendment 2022",
            "legal_reference": "Rule 5 & Second Amendment 2022",
            "effective_from": date(2026, 6, 1),
            "effective_to": None,
            "commodity_category_id": edible_oil_cat.id,
            "check_type": RuleCheckType.StandardSize,
            "is_mandatory": True,
            "weight": 10,
        },
    ]

    saved_rules = []
    for rdata in rules_data:
        rule = db.query(Rule).filter(Rule.code == rdata["code"]).first()
        if not rule:
            rule = Rule(**rdata)
            db.add(rule)
            db.flush()
        else:
            for k, v in rdata.items():
                setattr(rule, k, v)
        saved_rules.append(rule)

    db.commit()
    return saved_rules
