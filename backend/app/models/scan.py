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

    # Product details (extracted by OCR or linked)
    product_name = Column(String, nullable=True)
    brand_name = Column(String, nullable=True)
    category = Column(String, nullable=True)  # food, cosmetic, textile, etc. (legacy string)
    commodity_category_id = Column(Integer, ForeignKey("commodity_categories.id"), nullable=True)
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

    # Pipeline intelligence flags
    groq_used = Column(Boolean, default=False)

    # Compliance result
    is_compliant = Column(Boolean, nullable=True)
    compliance_score = Column(Float, nullable=True)  # 0.0 - 100.0

    # Individual field compliance stored as JSON
    field_results = Column(JSON, nullable=True)

    # Missing fields list
    missing_fields = Column(JSON, nullable=True)

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
    commodity_category = relationship("CommodityCategory", back_populates="scans")
    product = relationship("Product", foreign_keys=[product_id])
    manual_findings = relationship("ManualFinding", back_populates="scan")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    compliance_checks = relationship("ComplianceCheck", back_populates="scan")

    @property
    def compliance_summary(self) -> dict:
        from app.services.compliance_engine import summarize_checks
        if self.review_status == "reviewed" and self.is_compliant is not None:
            return {"headline": "AllPass" if self.is_compliant else "HasFailures",
                    "counts": {}, "total": len(self.compliance_checks or [])}
        checks = self.compliance_checks or []
        if checks:
            return summarize_checks(checks)

        # Older/failed workers may have persisted the denormalized result before
        # ComplianceCheck rows were written. Never interpret an empty check set
        # as AllPass (the previous behavior caused false green badges).
        field_results = self.field_results or {}
        missing = len(self.missing_fields or [])
        if self.pipeline_status == "review_needed" or self.review_status == "pending":
            headline = "NeedsManualReview"
        elif self.is_compliant is False or missing:
            headline = "HasFailures"
        elif self.is_compliant is True and field_results:
            headline = "AllPass"
        else:
            headline = "NeedsManualReview"
        return {
            "headline": headline,
            "counts": {"Pass": sum(1 for v in field_results.values() if v), "Fail": missing, "ManualReviewRequired": 0, "NotApplicable": 0, "Relaxed": 0},
            "total": len(field_results),
        }


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
