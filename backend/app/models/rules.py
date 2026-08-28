import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Text, ForeignKey, JSON, Float, Enum
from sqlalchemy.orm import relationship
from datetime import datetime, date
from app.database import Base


class RuleCheckType(str, enum.Enum):
    Presence = "Presence"
    Format = "Format"
    Placement = "Placement"
    FontSize = "FontSize"
    Symbol = "Symbol"
    StandardSize = "StandardSize"
    Exemption = "Exemption"


class Rule(Base):
    """
    A compliance rule with date-scoping and category-awareness.
    Rules can only be created or retired — never hard-deleted.
    is_conduct_bucket rules are recorded manually by officers; never auto-evaluated.
    """
    __tablename__ = "rules"

    id = Column(Integer, primary_key=True, index=True)
    rule_family = Column(String, nullable=False, index=True)  # stable slug across amendments, e.g. "mrp", "standard_size_edible_oil"
    code = Column(String, unique=True, nullable=False, index=True)  # e.g. "LM-PC-R6-01"
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    legal_reference = Column(String, nullable=True)  # e.g. "Rule 6(1)(a), LM(PC) Rules 2011"
    
    # Versioning & Category Scoping
    effective_from = Column(Date, nullable=False, default=date(2011, 4, 1))
    effective_to = Column(Date, nullable=True)  # null means currently in force
    has_transitional_clause = Column(Boolean, default=False, nullable=False)
    commodity_category_id = Column(Integer, ForeignKey("commodity_categories.id"), nullable=True)  # null = universal

    check_type = Column(
        Enum(RuleCheckType, name="rule_check_type_enum", values_callable=lambda obj: [e.value for e in obj]),
        default=RuleCheckType.Presence,
        nullable=False,
    )

    category_scope = Column(JSON, nullable=True)  # legacy field ["food","cosmetic"] or null = all
    is_mandatory = Column(Boolean, default=True)
    is_conduct_bucket = Column(Boolean, default=False)  # officer-recorded only, never auto
    weight = Column(Integer, default=10)  # scoring weight
    is_active = Column(Boolean, default=True)
    retired_at = Column(DateTime, nullable=True)
    retired_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    commodity_category = relationship("CommodityCategory", back_populates="rules")
    created_by = relationship("User", foreign_keys=[created_by_id])
    retired_by = relationship("User", foreign_keys=[retired_by_id])
    relaxations = relationship("RelaxationOrder", back_populates="rule")
    compliance_checks = relationship("ComplianceCheck", back_populates="rule")


class RelaxationOrder(Base):
    """
    A relaxation order grants an exemption from a specific rule for a manufacturer/product.
    Always bounded by valid_from and valid_until.
    """
    __tablename__ = "relaxation_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String, unique=True, nullable=False, index=True)
    rule_id = Column(Integer, ForeignKey("rules.id"), nullable=False)
    
    # Specific scope linkage (Plan §3.2 point 3)
    manufacturer_id = Column(Integer, ForeignKey("manufacturers.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)  # null = manufacturer-wide

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    gazette_reference = Column(String, nullable=True)
    applies_to_categories = Column(JSON, nullable=True)  # legacy list of category strings
    applies_to_states = Column(JSON, nullable=True)  # list of state strings; null = all India
    valid_from = Column(Date, nullable=False, default=date.today)
    valid_until = Column(Date, nullable=False)  # required / bounded
    is_active = Column(Boolean, default=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    rule = relationship("Rule", back_populates="relaxations")
    manufacturer = relationship("Manufacturer", back_populates="relaxation_orders")
    product = relationship("Product", back_populates="relaxation_orders")
    created_by = relationship("User", foreign_keys=[created_by_id])
    compliance_checks = relationship("ComplianceCheck", back_populates="relaxation_order")


class ComplianceCheckResult(str, enum.Enum):
    Pass = "Pass"
    Fail = "Fail"
    NotApplicable = "NotApplicable"
    Relaxed = "Relaxed"
    ManualReviewRequired = "ManualReviewRequired"


class ComplianceCheck(Base):
    """
    Frozen per-declaration compliance result for a scan.
    Re-evaluation inserts new rows rather than updating existing rows.
    """
    __tablename__ = "compliance_checks"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(String, ForeignKey("scans.scan_id"), nullable=False, index=True)
    rule_id = Column(Integer, ForeignKey("rules.id"), nullable=True)
    field_key = Column(String, nullable=False, index=True)
    result = Column(
        Enum(ComplianceCheckResult, name="compliancecheckresult", values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    confidence = Column(Float, nullable=True)
    extracted_value = Column(String, nullable=True)
    image_index = Column(Integer, default=0, nullable=True)
    bounding_box = Column(JSON, nullable=True)  # {'x_min': float, 'y_min': float, 'x_max': float, 'y_max': float, 'bbox_source': str}
    relaxation_order_id = Column(Integer, ForeignKey("relaxation_orders.id"), nullable=True)
    notes = Column(Text, nullable=True)
    evaluated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    scan = relationship("Scan", back_populates="compliance_checks")
    rule = relationship("Rule", back_populates="compliance_checks")
    relaxation_order = relationship("RelaxationOrder", back_populates="compliance_checks")
