import os
import uuid
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from app.database import get_db
from app.models.scan import Scan, ManualFinding
from app.models.rules import ComplianceCheck, ComplianceCheckResult as ComplianceCheckResultEnum
from app.models.product import Product
from app.models.user import User, UserRole
from app.routers.deps import get_current_user, require_role
from app.services.auth_service import scope_scans_for_user
from app.config import settings
from pydantic import BaseModel

router = APIRouter(prefix="/scan", tags=["Scan"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


# ── Product auto-linking ───────────────────────────────────────────────────────

def _upsert_product(db: Session, product_name: str, category: str, scan: Scan) -> Optional[Product]:
    """
    After every scan, find-or-create a Product record by name+category.
    Updates its latest compliance stats and links scan.product_id.
    This is how scanned products automatically appear in the Products registry.
    """
    if not product_name:
        return None

    product = db.query(Product).filter(
        Product.name.ilike(product_name),
        Product.category == (category or "general"),
        Product.is_active == True,
    ).first()

    if not product:
        product = Product(
            name=product_name,
            category=category or "general",
            brand_name=scan.brand_name,
            is_compliant=scan.is_compliant,
            last_compliance_score=scan.compliance_score,
            last_scan_id=scan.scan_id,
        )
        db.add(product)
        db.flush()
    else:
        product.last_compliance_score = scan.compliance_score
        product.last_scan_id = scan.scan_id
        product.is_compliant = scan.is_compliant

    scan.product_id = product.id
    return product


def _persist_compliance_checks(db: Session, scan_id: str, checks: list[dict]) -> None:
    for check in checks or []:
        result = check.get("result")
        db.add(ComplianceCheck(
            scan_id=scan_id,
            rule_id=check.get("rule_id"),
            field_key=check["field_key"],
            result=ComplianceCheckResultEnum(result),
            confidence=check.get("confidence"),
            extracted_value=check.get("extracted_value"),
            relaxation_order_id=check.get("relaxation_order_id"),
            notes=check.get("notes"),
        ))


# ── Response schemas ───────────────────────────────────────────────────────────

class BoundingBox(BaseModel):
    field: str
    text: Optional[str]
    confidence: float
    confirmed: bool
    bbox: Optional[List[float]]


class ManualFindingCreate(BaseModel):
    rule_id: Optional[int] = None
    rule_code: Optional[str] = None
    finding_type: str
    description: str
    severity: str = "medium"
    evidence_note: Optional[str] = None


class ManualFindingOut(BaseModel):
    id: int
    scan_id: str
    rule_id: Optional[int]
    rule_code: Optional[str]
    finding_type: str
    description: str
    severity: str
    evidence_note: Optional[str]
    recorded_at: datetime
    class Config:
        from_attributes = True


class ComplianceCheckOut(BaseModel):
    id: Optional[int] = None
    scan_id: Optional[str] = None
    rule_id: Optional[int] = None
    field_key: str
    result: str
    confidence: Optional[float] = None
    extracted_value: Optional[str] = None
    relaxation_order_id: Optional[int] = None
    notes: Optional[str] = None
    evaluated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ComplianceSummaryOut(BaseModel):
    headline: str
    counts: dict
    total: int


class ScanOut(BaseModel):
    id: int
    scan_id: str
    product_name: Optional[str]
    brand_name: Optional[str]
    category: Optional[str]
    shop_name: Optional[str]
    location: Optional[str]
    state: Optional[str]
    district: Optional[str]
    raw_ocr_text: Optional[str]
    ocr_confidence: Optional[float]
    image_path: Optional[str]
    image_paths: Optional[List[str]]
    bounding_boxes: Optional[List[dict]]
    pipeline_status: Optional[str]
    calibration_method: Optional[str]
    symbols_detected: Optional[dict]
    is_compliant: Optional[bool]
    compliance_score: Optional[float]
    field_results: Optional[dict]
    missing_fields: Optional[List[str]]
    extracted_fields: Optional[dict]
    compliance_checks: Optional[List[ComplianceCheckOut]] = None
    compliance_summary: Optional[ComplianceSummaryOut] = None
    remarks: Optional[str]
    review_status: Optional[str]
    created_at: datetime
    inspector_id: Optional[int]
    product_id: Optional[int]
    class Config:
        from_attributes = True


class ScanResultFourTab(BaseModel):
    scan: ScanOut
    all_rules: List[dict]
    violations: List[dict]
    not_applicable_relaxed: List[dict]
    manual_findings: List[ManualFindingOut]


# ── Upload and run pipeline ────────────────────────────────────────────────────

@router.post("/upload", response_model=ScanOut, status_code=201)
async def upload_and_scan(
    file: UploadFile = File(...),
    category: Optional[str] = Form("general"),
    shop_name: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    state: Optional[str] = Form(None),
    district: Optional[str] = Form(None),
    label_width_mm: Optional[float] = Form(None),
    label_height_mm: Optional[float] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Inspector", "ManufacturerSelfCheck")),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Use JPEG, PNG, or WebP.")
    image_bytes = await file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit.")

    scan_id = str(uuid.uuid4())
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "jpg"
    image_path = os.path.join(settings.UPLOAD_DIR, f"{scan_id}.{ext}")
    async with aiofiles.open(image_path, "wb") as f:
        await f.write(image_bytes)

    from app.services.pipeline_service import run_pipeline_sync
    from PIL import Image
    import io as _io
    pil = Image.open(_io.BytesIO(image_bytes))
    img_w, img_h = pil.size

    pipeline_result = run_pipeline_sync(
        image_bytes, category=category or "general",
        inspector_width_mm=label_width_mm, inspector_height_mm=label_height_mm,
        img_width_px=img_w, img_height_px=img_h,
    )

    # Priority order for product_name + brand_name:
    #   1. Groq extraction (most accurate)
    #   2. Barcode lookup (Open Food Facts)
    #   3. OCR first line (last resort, only if confidence ≥ 50%)
    extracted = pipeline_result.get("extracted_fields") or {}
    barcode_data = pipeline_result.get("barcode_data") or {}
    barcode_product = barcode_data.get("product_info") or {}

    product_name = (
        extracted.get("product_name")
        or barcode_product.get("product_name")
        or None
    )
    brand_name = (
        extracted.get("brand_name")
        or barcode_product.get("brand_name")
        or None
    )

    if not product_name:
        raw_text = pipeline_result.get("raw_ocr_text", "")
        ocr_confidence = pipeline_result.get("ocr_confidence", 0) or 0
        if raw_text and ocr_confidence >= 50:
            lines = [l.strip() for l in raw_text.splitlines()
                     if len(l.strip()) > 3 and l.strip().replace(" ", "").isascii()]
            product_name = lines[0][:60] if lines else None

    scan = Scan(
        scan_id=scan_id,
        inspector_id=current_user.id if current_user else None,
        product_name=product_name,
        brand_name=brand_name,
        category=category,
        shop_name=shop_name,
        location=location,
        state=state,
        district=district,
        image_path=image_path,
        image_paths=[image_path],
        raw_ocr_text=pipeline_result.get("raw_ocr_text"),
        ocr_confidence=pipeline_result.get("ocr_confidence"),
        ocr_language=pipeline_result.get("ocr_language"),
        calibration_method=pipeline_result.get("calibration_method"),
        calibration_data=pipeline_result.get("calibration_data"),
        symbols_detected=pipeline_result.get("symbols_detected"),
        barcode_data=barcode_data,
        groq_used=pipeline_result.get("groq_used", False),
        bounding_boxes=pipeline_result.get("bounding_boxes"),
        pipeline_status=pipeline_result.get("pipeline_status", "complete"),
        is_compliant=pipeline_result.get("is_compliant"),
        compliance_score=pipeline_result.get("compliance_score"),
        field_results=pipeline_result.get("field_results"),
        missing_fields=pipeline_result.get("missing_fields"),
        extracted_fields=pipeline_result.get("extracted_fields"),
        remarks=pipeline_result.get("remarks"),
    )
    db.add(scan)
    db.flush()
    _persist_compliance_checks(db, scan.scan_id, pipeline_result.get("compliance_checks", []))
    _upsert_product(db, product_name, category or "general", scan)
    db.commit()
    db.refresh(scan)
    return scan


@router.post("/upload-multi", response_model=ScanOut, status_code=201)
async def upload_multi_and_scan(
    files: List[UploadFile] = File(...),
    category: Optional[str] = Form("general"),
    shop_name: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    state: Optional[str] = Form(None),
    district: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Inspector", "ManufacturerSelfCheck")),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > 6:
        raise HTTPException(status_code=400, detail="Maximum 6 images per scan")

    scan_id = str(uuid.uuid4())
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    saved_paths = []
    all_bytes = []

    for i, upload in enumerate(files):
        if upload.content_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail=f"File {i+1}: unsupported type")
        img_bytes = await upload.read()
        if len(img_bytes) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"File {i+1}: exceeds 10MB")
        ext = (upload.filename or "img").rsplit(".", 1)[-1]
        fpath = os.path.join(settings.UPLOAD_DIR, f"{scan_id}_{i}.{ext}")
        async with aiofiles.open(fpath, "wb") as f:
            await f.write(img_bytes)
        saved_paths.append(fpath)
        all_bytes.append(img_bytes)

    from app.services.pipeline_service import run_pipeline_sync
    pipeline_result = run_pipeline_sync(all_bytes[0], category=category or "general")

    if len(all_bytes) > 1:
        from app.services.ocr_service import extract_text_from_bytes
        combined_text = pipeline_result.get("raw_ocr_text", "")
        combined_confidences = {}
        for extra_bytes in all_bytes[1:]:
            extra_ocr = extract_text_from_bytes(extra_bytes)
            combined_text += "\n" + extra_ocr.get("text", "")
            combined_confidences.update(extra_ocr.get("field_confidences") or {})
        from app.services.pipeline_service import run_classifier_stage
        re_compliance = run_classifier_stage({
            "ocr_text": combined_text,
            "category": category or "general",
            "symbols": pipeline_result.get("symbols_detected") or {},
            "calibration": {},
            "extracted_fields": pipeline_result.get("extracted_fields") or {},
            "field_confidences": combined_confidences,
            "overall_confidence": pipeline_result.get("ocr_confidence"),
            "low_confidence": pipeline_result.get("low_confidence_ocr"),
        })
        pipeline_result.update({
            "raw_ocr_text": combined_text,
            "is_compliant": re_compliance["is_compliant"],
            "compliance_score": re_compliance["compliance_score"],
            "field_results": re_compliance["field_results"],
            "missing_fields": re_compliance["missing_fields"],
            "extracted_fields": re_compliance["extracted_fields"],
            "compliance_checks": re_compliance["compliance_checks"],
            "compliance_summary": re_compliance["compliance_summary"],
            "remarks": re_compliance["remarks"],
        })

    extracted = pipeline_result.get("extracted_fields") or {}
    product_name = extracted.get("product_name") or None
    brand_name = extracted.get("brand_name") or None

    if not product_name:
        raw_text = pipeline_result.get("raw_ocr_text", "")
        ocr_confidence = pipeline_result.get("ocr_confidence", 0) or 0
        if raw_text and ocr_confidence >= 50:
            lines = [l.strip() for l in raw_text.splitlines()
                     if len(l.strip()) > 3 and l.strip().replace(" ", "").isascii()]
            product_name = lines[0][:60] if lines else None

    scan = Scan(
        scan_id=scan_id,
        inspector_id=current_user.id if current_user else None,
        product_name=product_name,
        brand_name=brand_name,
        category=category,
        shop_name=shop_name,
        location=location,
        state=state,
        district=district,
        image_path=saved_paths[0],
        image_paths=saved_paths,
        raw_ocr_text=pipeline_result.get("raw_ocr_text"),
        ocr_confidence=pipeline_result.get("ocr_confidence"),
        ocr_language=pipeline_result.get("ocr_language"),
        calibration_method=pipeline_result.get("calibration_method"),
        symbols_detected=pipeline_result.get("symbols_detected"),
        bounding_boxes=pipeline_result.get("bounding_boxes"),
        pipeline_status=pipeline_result.get("pipeline_status", "complete"),
        is_compliant=pipeline_result.get("is_compliant"),
        compliance_score=pipeline_result.get("compliance_score"),
        field_results=pipeline_result.get("field_results"),
        missing_fields=pipeline_result.get("missing_fields"),
        extracted_fields=pipeline_result.get("extracted_fields"),
        remarks=pipeline_result.get("remarks"),
    )
    db.add(scan)
    db.flush()
    _persist_compliance_checks(db, scan.scan_id, pipeline_result.get("compliance_checks", []))
    _upsert_product(db, product_name, category or "general", scan)
    db.commit()
    db.refresh(scan)
    return scan


# ── List & detail ──────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ScanOut])
def list_scans(
    skip: int = 0,
    limit: int = 50,
    state: Optional[str] = None,
    district: Optional[str] = None,
    is_compliant: Optional[bool] = None,
    category: Optional[str] = None,
    pipeline_status: Optional[str] = None,
    review_status: Optional[str] = None,
    product_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = scope_scans_for_user(db.query(Scan), current_user, db)
    if state:
        query = query.filter(Scan.state == state)
    if district:
        query = query.filter(Scan.district == district)
    if is_compliant is not None:
        query = query.filter(Scan.is_compliant == is_compliant)
    if category:
        query = query.filter(Scan.category == category)
    if pipeline_status:
        query = query.filter(Scan.pipeline_status == pipeline_status)
    if review_status:
        query = query.filter(Scan.review_status == review_status)
    if product_id:
        query = query.filter(Scan.product_id == product_id)
    return query.order_by(Scan.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = scope_scans_for_user(db.query(Scan), current_user, db)
    scan = query.filter(Scan.scan_id == scan_id).first()
    if not scan:
        existing = db.query(Scan).filter(Scan.scan_id == scan_id).first()
        if existing:
            raise HTTPException(status_code=403, detail="Not authorised to view this scan")
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.get("/{scan_id}/result-tabs", response_model=ScanResultFourTab)
def get_scan_result_tabs(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.compliance_engine import COMPLIANCE_FIELDS

    query = scope_scans_for_user(db.query(Scan), current_user, db)
    scan = query.filter(Scan.scan_id == scan_id).first()
    if not scan:
        existing = db.query(Scan).filter(Scan.scan_id == scan_id).first()
        if existing:
            raise HTTPException(status_code=403, detail="Not authorised to view this scan")
        raise HTTPException(status_code=404, detail="Scan not found")

    field_results = scan.field_results or {}
    extracted = scan.extracted_fields or {}

    all_rules = []
    violations = []
    not_applicable_relaxed = []

    for field_def in COMPLIANCE_FIELDS:
        key = field_def["key"]
        present = field_results.get(key, False)
        entry = {
            "key": key,
            "label": field_def["label"],
            "required": field_def["required"],
            "weight": field_def["weight"],
            "present": present,
            "extracted_value": extracted.get(key),
            "legal_reference": field_def.get("description"),
        }
        all_rules.append(entry)
        if not present:
            if field_def["required"]:
                violations.append(entry)
            else:
                not_applicable_relaxed.append(entry)

    findings_objs = db.query(ManualFinding).filter(ManualFinding.scan_id == scan_id).all()

    return ScanResultFourTab(
        scan=ScanOut.model_validate(scan),
        all_rules=all_rules,
        violations=violations,
        not_applicable_relaxed=not_applicable_relaxed,
        manual_findings=[ManualFindingOut.model_validate(f) for f in findings_objs],
    )


# ── Bounding box confirmation ──────────────────────────────────────────────────

@router.patch("/{scan_id}/confirm-bbox")
def confirm_bounding_box(
    scan_id: str,
    field: str,
    corrected_value: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = scope_scans_for_user(db.query(Scan), current_user, db)
    scan = query.filter(Scan.scan_id == scan_id).first()
    if not scan:
        existing = db.query(Scan).filter(Scan.scan_id == scan_id).first()
        if existing:
            raise HTTPException(status_code=403, detail="Not authorised to view this scan")
        raise HTTPException(status_code=404, detail="Scan not found")

    boxes = scan.bounding_boxes or []
    updated = False
    for box in boxes:
        if box.get("field") == field:
            box["confirmed"] = True
            if corrected_value is not None:
                box["text"] = corrected_value
                extracted = scan.extracted_fields or {}
                extracted[field] = corrected_value
                scan.extracted_fields = extracted
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail=f"Bounding box for field '{field}' not found")

    scan.bounding_boxes = boxes
    db.commit()
    return {"detail": "Confirmed", "field": field}


@router.patch("/{scan_id}/review-complete")
def mark_review_complete(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = scope_scans_for_user(db.query(Scan), current_user, db)
    scan = query.filter(Scan.scan_id == scan_id).first()
    if not scan:
        existing = db.query(Scan).filter(Scan.scan_id == scan_id).first()
        if existing:
            raise HTTPException(status_code=403, detail="Not authorised to view this scan")
        raise HTTPException(status_code=404, detail="Scan not found")

    unconfirmed = [b for b in (scan.bounding_boxes or []) if not b.get("confirmed")]
    if unconfirmed:
        raise HTTPException(
            status_code=400,
            detail=f"{len(unconfirmed)} unconfirmed bounding box(es). Confirm all before submitting.",
        )

    scan.review_status = "reviewed"
    scan.reviewed_by_id = current_user.id
    scan.reviewed_at = datetime.utcnow()
    db.commit()
    return {"detail": "Review complete", "scan_id": scan_id}


# ── Manual findings ────────────────────────────────────────────────────

@router.post("/{scan_id}/findings", response_model=ManualFindingOut, status_code=201)
def add_manual_finding(
    scan_id: str,
    payload: ManualFindingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = scope_scans_for_user(db.query(Scan), current_user, db)
    scan = query.filter(Scan.scan_id == scan_id).first()
    if not scan:
        existing = db.query(Scan).filter(Scan.scan_id == scan_id).first()
        if existing:
            raise HTTPException(status_code=403, detail="Not authorised to view this scan")
        raise HTTPException(status_code=404, detail="Scan not found")

    finding = ManualFinding(
        scan_id=scan_id,
        rule_id=payload.rule_id,
        rule_code=payload.rule_code,
        finding_type=payload.finding_type,
        description=payload.description,
        severity=payload.severity,
        evidence_note=payload.evidence_note,
        recorded_by_id=current_user.id,
    )
    db.add(finding)
    db.commit()
    db.refresh(finding)
    return finding


@router.get("/{scan_id}/findings", response_model=List[ManualFindingOut])
def list_findings(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = scope_scans_for_user(db.query(Scan), current_user, db)
    scan = query.filter(Scan.scan_id == scan_id).first()
    if not scan:
        existing = db.query(Scan).filter(Scan.scan_id == scan_id).first()
        if existing:
            raise HTTPException(status_code=403, detail="Not authorised to view this scan")
        raise HTTPException(status_code=404, detail="Scan not found")

    return db.query(ManualFinding).filter(ManualFinding.scan_id == scan_id).all()


@router.delete("/{scan_id}/findings/{finding_id}", status_code=204)
def delete_finding(
    scan_id: str,
    finding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = scope_scans_for_user(db.query(Scan), current_user, db)
    scan = query.filter(Scan.scan_id == scan_id).first()
    if not scan:
        existing = db.query(Scan).filter(Scan.scan_id == scan_id).first()
        if existing:
            raise HTTPException(status_code=403, detail="Not authorised to view this scan")
        raise HTTPException(status_code=404, detail="Scan not found")

    finding = db.query(ManualFinding).filter(
        ManualFinding.id == finding_id,
        ManualFinding.scan_id == scan_id,
    ).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    user_role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if finding.recorded_by_id != current_user.id and user_role_val != "Controller":
        raise HTTPException(status_code=403, detail="Not authorised")
    db.delete(finding)
    db.commit()
