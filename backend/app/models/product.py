from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    brand_name = Column(String, nullable=True)
    # Category (legacy string and versioned FK)
    category = Column(String, nullable=True)  # food | cosmetic | textile | pharma | electronics | general
    commodity_category_id = Column(Integer, ForeignKey("commodity_categories.id"), nullable=True)
    commodity_category = relationship("CommodityCategory", back_populates="products")

    sku = Column(String, nullable=True, unique=True, index=True)
    barcode = Column(String, nullable=True, index=True)
    description = Column(Text, nullable=True)

    # Compliance tracking
    is_compliant = Column(Boolean, nullable=True)
    last_compliance_score = Column(Float, nullable=True)
    last_scan_id = Column(String, nullable=True)

    # Manufacturer relationship
    manufacturer_id = Column(Integer, ForeignKey("manufacturers.id"), nullable=True)
    manufacturer = relationship("Manufacturer", back_populates="products")
    relaxation_orders = relationship("RelaxationOrder", back_populates="product")

    # Self-check: is this product registered by the manufacturer themselves?
    registered_by_manufacturer = Column(Boolean, default=False)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
