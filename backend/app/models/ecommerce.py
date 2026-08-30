from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class EcommerceCheck(Base):
    """
    FR-18: Officer-submitted URL check for country-of-origin filter presence.
    Manual judgment — not OCR-based.
    """
    __tablename__ = "ecommerce_checks"

    id = Column(Integer, primary_key=True, index=True)
    check_id = Column(String, unique=True, nullable=False, index=True)
    platform_name = Column(String, nullable=True)  # e.g. "Amazon", "Flipkart"
    url = Column(Text, nullable=False)
    has_country_of_origin_filter = Column(Boolean, nullable=True)  # null = not yet assessed
    officer_notes = Column(Text, nullable=True)
    evidence_image_path = Column(String, nullable=True)
    checked_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    checked_at = Column(DateTime, default=datetime.utcnow)
    is_compliant = Column(Boolean, nullable=True)

    checked_by = relationship("User", foreign_keys=[checked_by_id])
