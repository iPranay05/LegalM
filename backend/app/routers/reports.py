"""Report generation router — PDF and DOCX, SHA-256, immutable chain."""
import os
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from app.database import get_db
from app.models.report import Report
from app.models.scan import Scan, ManualFinding
from app.models.user import User
from app.routers.deps import get_current_user
from app.services.report_service import generate_report
from app.config import settings
from pydantic import BaseModel

router = APIRouter(prefix="/reports", tags=["Reports"])

REPORTS_DIR = os.path.join(os.path.dirname(settings.UPLOAD_DIR), "reports")


class ReportOut(BaseModel):
    id: int
    report_id: str
    scan_id: str
    format: str
    file_hash_sha256: str
    generated_at: datetime
    superseded_by_report_id: str | None
    class Config:
        from_attributes = True


@router.post("/generate/{scan_id}", response_model=ReportOut, status_code=201)
def generate_scan_report(
    scan_id: str,
    fmt: str = "pdf",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a PDF or DOCX compliance report for a scan.
    If a previous report exists for the same scan, it is superseded (not deleted).
    """
    if fmt not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="Format must be 'pdf' or 'docx'")

    scan = db.query(Scan).filter(Scan.scan_id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Gather manual findings for this scan
    findings_objs = db.query(ManualFinding).filter(ManualFinding.scan_id == scan_id).all()
    findings = [
        {
            "rule_code": f.rule_code,
            "finding_type": f.finding_type,
            "severity": f.severity,
            "description": f.description,
        }
        for f in findings_objs
    ]

    try:
        result = generate_report(scan, findings, fmt, REPORTS_DIR, user_id=current_user.id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Find any existing report for this scan+format and mark as superseded
    previous = (
        db.query(Report)
        .filter(Report.scan_id == scan_id, Report.format == fmt, Report.superseded_by_report_id == None)
        .first()
    )

    report = Report(
        report_id=result["report_id"],
        scan_id=scan_id,
        format=result["format"],
        file_path=result["file_path"],
        file_hash_sha256=result["file_hash_sha256"],
        generated_by_id=current_user.id,
    )
    db.add(report)
    db.flush()  # get the report_id assigned

    if previous:
        previous.superseded_by_report_id = report.report_id

    db.commit()
    db.refresh(report)
    return report


@router.get("/scan/{scan_id}", response_model=List[ReportOut])
def list_reports_for_scan(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all reports for a scan (latest first, including superseded chain)."""
    return (
        db.query(Report)
        .filter(Report.scan_id == scan_id)
        .order_by(Report.generated_at.desc())
        .all()
    )


@router.get("/download/{report_id}")
def download_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream the report file for download."""
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not os.path.exists(report.file_path):
        raise HTTPException(status_code=410, detail="Report file no longer available on disk")

    with open(report.file_path, "rb") as f:
        content = f.read()

    media_type = "application/pdf" if report.format == "pdf" else (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    filename = f"compliance_report_{report.scan_id}.{report.format}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
