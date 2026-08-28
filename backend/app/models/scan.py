from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Scan(Base):
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(String, unique=True, index=True, nullable=False)

    # Inspector who performed the scan
    inspector_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    inspector = relationship("User", back_populates="scans")

    # Product details (extracted by OCR)
    product_name = Column(String, nullable=True)
    brand_name = Column(String, nullable=True)
    category = Column(String, nullable=True)  # food, cosmetic, textile, etc.
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)

    # Location context
    shop_name = Column(String, nullable=True)
    location = Column(String, nullable=True)
    state = Column(String, nullable=True)
    district = Column(String, nullable=True)

    # Raw OCR output
    raw_ocr_text = Column(Text, nullable=True)
    ocr_confidence = Column(Float, nullable=True)
    ocr_language = Column(String, nullable=True)  # "eng" | "eng+hin"

    # Image paths (multiple images supported)
    image_path = Column(String, nullable=True)           # primary image
    image_paths = Column(JSON, nullable=True)            # all uploaded images

    # Bounding box annotations per field (for review UI)
    # [{"field": "mrp", "bbox": [x,y,w,h], "text": "₹45", "confidence": 0.87, "confirmed": false}]
    bounding_boxes = Column(JSON, nullable=True)

    # Pipeline status: pending | processing | review_needed | complete | failed
    pipeline_status = Column(String, default="complete")

    # Calibration data
    calibration_method = Column(String, nullable=True)   # "reference_marker" | "inspector" | "unverified"
    calibration_data = Column(JSON, nullable=True)

    # Symbol detection results
    symbols_detected = Column(JSON, nullable=True)  # {"veg_dot": true, "non_veg_dot": false, "gm_mark": false}

    # Barcode / QR code detection
    barcode_data = Column(JSON, nullable=True)
    # {"barcodes": [...], "primary_barcode": "8901234...", "product_info": {...}, "decoded": true}

    # Pipeline intelligence flags
    groq_used = Column(Boolean, default=False)  # True when Groq LLM enriched the extracted fields

    # Compliance result
    is_compliant = Column(Boolean, nullable=True)
    compliance_score = Column(Float, nullable=True)  # 0.0 - 100.0

    # Individual field compliance stored as JSON
    field_results = Column(JSON, nullable=True)

    # Missing fields list
    missing_fields = Column(JSON, nullable=True)  # list of strings

    # Extracted field values
    extracted_fields = Column(JSON, nullable=True)

    # Violation remarks
    remarks = Column(Text, nullable=True)

    # Manual review by officer
    review_status = Column(String, nullable=True)  # "pending" | "reviewed" | "escalated"
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    inspector = relationship("User", back_populates="scans", foreign_keys=[inspector_id])
    manual_findings = relationship("ManualFinding", back_populates="scan")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])


class ManualFinding(Base):
    """Officer-recorded manual finding for conduct-bucket rules."""
    __tablename__ = "manual_findings"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(String, ForeignKey("scans.scan_id"), nullable=False)
    rule_id = Column(Integer, ForeignKey("rules.id"), nullable=True)
    rule_code = Column(String, nullable=True)  # denormalized for display
    finding_type = Column(String, nullable=False)  # "violation" | "observation" | "compliant"
    description = Column(Text, nullable=False)
    severity = Column(String, default="medium")  # "low" | "medium" | "high" | "critical"
    evidence_note = Column(Text, nullable=True)
    recorded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    recorded_at = Column(DateTime, default=datetime.utcnow)

    scan = relationship("Scan", back_populates="manual_findings")
    recorded_by = relationship("User", foreign_keys=[recorded_by_id])
