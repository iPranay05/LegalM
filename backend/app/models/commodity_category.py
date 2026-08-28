from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class CommodityCategory(Base):
    """
    Commodity category model governing versioned rule applicability and exemptions.
    Four core seed categories:
      1. General (baseline universal path)
      2. Food (FSSAI mandatory, veg/non-veg)
      3. Edible Oil (standard pack sizes required)
      4. Medical Device (exempt from LM font/placement rules per MDR 2017)
    """
    __tablename__ = "commodity_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    is_food = Column(Boolean, default=False, nullable=False)
    is_medical_device = Column(Boolean, default=False, nullable=False)
    requires_standard_size = Column(Boolean, default=False, nullable=False)
    font_rule_exempted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    products = relationship("Product", back_populates="commodity_category")
    scans = relationship("Scan", back_populates="commodity_category")
    rules = relationship("Rule", back_populates="commodity_category")
