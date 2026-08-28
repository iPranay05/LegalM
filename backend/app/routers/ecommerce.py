"""E-Commerce Listing Checker (FR-18) — officer-submitted URL checks."""
import os
import uuid
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from app.database import get_db
from app.models.ecommerce import EcommerceCheck
from app.models.user import User
from app.routers.deps import get_current_user
from app.config import settings
from pydantic import BaseModel

router = APIRouter(prefix="/ecommerce", tags=["E-Commerce Checker"])

ALLOWED_IMG = {"image/jpeg", "image/png", "image/webp", "image/jpg"}


class EcommerceCheckOut(BaseModel):
    id: int
    check_id: str
    platform_name: Optional[str]
    url: str
    has_country_of_origin_filter: Optional[bool]
    officer_notes: Optional[str]
    evidence_image_path: Optional[str]
    is_compliant: Optional[bool]
    checked_at: datetime
    class Config:
        from_attributes = True


@router.post("/check", response_model=EcommerceCheckOut, status_code=201)
async def submit_ecommerce_check(
    url: str = Form(...),
    platform_name: Optional[str] = Form(None),
    has_country_of_origin_filter: Optional[bool] = Form(None),
    officer_notes: Optional[str] = Form(None),
    evidence_screenshot: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Officer submits a URL check result. Evidence screenshot is optional.
    is_compliant = has_country_of_origin_filter (manual officer judgment).
    """
    check_id = str(uuid.uuid4())
    evidence_path = None

    if evidence_screenshot and evidence_screenshot.filename:
        if evidence_screenshot.content_type not in ALLOWED_IMG:
            raise HTTPException(status_code=400, detail="Screenshot must be JPEG or PNG")
        img_bytes = await evidence_screenshot.read()
        if len(img_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Screenshot exceeds 10MB")
        screenshots_dir = os.path.join(settings.UPLOAD_DIR, "ecommerce")
        os.makedirs(screenshots_dir, exist_ok=True)
        ext = evidence_screenshot.filename.rsplit(".", 1)[-1] if "." in evidence_screenshot.filename else "jpg"
        fname = f"{check_id}.{ext}"
        evidence_path = os.path.join(screenshots_dir, fname)
        async with aiofiles.open(evidence_path, "wb") as f:
            await f.write(img_bytes)

    check = EcommerceCheck(
        check_id=check_id,
        platform_name=platform_name,
        url=url,
        has_country_of_origin_filter=has_country_of_origin_filter,
        officer_notes=officer_notes,
        evidence_image_path=evidence_path,
        is_compliant=has_country_of_origin_filter,  # compliance = filter present
        checked_by_id=current_user.id,
    )
    db.add(check)
    db.commit()
    db.refresh(check)
    return check


@router.get("/checks", response_model=List[EcommerceCheckOut])
def list_checks(
    platform: Optional[str] = None,
    is_compliant: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(EcommerceCheck)
    if platform:
        q = q.filter(EcommerceCheck.platform_name.ilike(f"%{platform}%"))
    if is_compliant is not None:
        q = q.filter(EcommerceCheck.is_compliant == is_compliant)
    return q.order_by(EcommerceCheck.checked_at.desc()).offset(skip).limit(limit).all()


@router.get("/checks/{check_id}", response_model=EcommerceCheckOut)
def get_check(
    check_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check = db.query(EcommerceCheck).filter(EcommerceCheck.check_id == check_id).first()
    if not check:
        raise HTTPException(status_code=404, detail="Check not found")
    return check


@router.patch("/checks/{check_id}/update", response_model=EcommerceCheckOut)
def update_check(
    check_id: str,
    has_filter: Optional[bool] = None,
    notes: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Allow officer to update their judgment on a submitted check."""
    check = db.query(EcommerceCheck).filter(EcommerceCheck.check_id == check_id).first()
    if not check:
        raise HTTPException(status_code=404, detail="Check not found")
    user_role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if check.checked_by_id != current_user.id and user_role_val != "Controller":
        raise HTTPException(status_code=403, detail="Not authorised")
    if has_filter is not None:
        check.has_country_of_origin_filter = has_filter
        check.is_compliant = has_filter
    if notes is not None:
        check.officer_notes = notes
    db.commit()
    db.refresh(check)
    return check
