from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Report(Base):
    """
    Compliance report generated for a scan. Immutable once generated.
    Re-generation creates a new report and links via superseded_by_report_id.
    """
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String, unique=True, nullable=False, index=True)
    scan_id = Column(String, ForeignKey("scans.scan_id"), nullable=False)
    format = Column(String, nullable=False)  # "pdf" | "docx"
    file_path = Column(String, nullable=False)
    file_hash_sha256 = Column(String, nullable=False)  # evidentiary integrity
    generated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow)

    # Immutability chain: if regenerated, old report points to new
    superseded_by_report_id = Column(String, nullable=True)

    scan = relationship("Scan", foreign_keys=[scan_id])
    generated_by = relationship("User", foreign_keys=[generated_by_id])
