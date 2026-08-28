from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Rule(Base):
    """
    A compliance rule. Rules can only be created or retired — never hard-deleted.
    conduct_bucket rules are recorded manually by officers; never auto-evaluated.
    """
    __tablename__ = "rules"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False, index=True)  # e.g. "LM-PC-R6-01"
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    legal_reference = Column(String, nullable=True)  # e.g. "Rule 6(1)(a), LM(PC) Rules 2011"
    category_scope = Column(JSON, nullable=True)  # ["food","cosmetic"] or null = all
    is_mandatory = Column(Boolean, default=True)
    is_conduct_bucket = Column(Boolean, default=False)  # officer-recorded only, never auto
    weight = Column(Integer, default=10)  # scoring weight
    is_active = Column(Boolean, default=True)
    retired_at = Column(DateTime, nullable=True)
    retired_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by = relationship("User", foreign_keys=[created_by_id])
    retired_by = relationship("User", foreign_keys=[retired_by_id])
    relaxations = relationship("RelaxationOrder", back_populates="rule")


class RelaxationOrder(Base):
    """
    A relaxation order grants an exemption from a specific rule for a product/category/region.
    """
    __tablename__ = "relaxation_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String, unique=True, nullable=False, index=True)
    rule_id = Column(Integer, ForeignKey("rules.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    gazette_reference = Column(String, nullable=True)
    applies_to_categories = Column(JSON, nullable=True)  # list of category strings
    applies_to_states = Column(JSON, nullable=True)  # list of state strings; null = all India
    valid_from = Column(DateTime, nullable=False, default=datetime.utcnow)
    valid_until = Column(DateTime, nullable=True)  # null = indefinite
    is_active = Column(Boolean, default=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    rule = relationship("Rule", back_populates="relaxations")
    created_by = relationship("User", foreign_keys=[created_by_id])
