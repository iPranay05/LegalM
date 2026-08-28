from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.user import UserRole


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.Inspector
    district: Optional[str] = None
    state: Optional[str] = None


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    district: Optional[str]
    state: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Scan ──────────────────────────────────────────────────────────────────────

class ScanCreate(BaseModel):
    category: Optional[str] = "general"
    shop_name: Optional[str] = None
    location: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None


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
    counts: Dict[str, int]
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
    image_path: Optional[str]
    is_compliant: Optional[bool]
    compliance_score: Optional[float]
    field_results: Optional[Dict[str, bool]]
    missing_fields: Optional[List[str]]
    extracted_fields: Optional[Dict[str, Any]]
    compliance_checks: Optional[List[ComplianceCheckOut]] = None
    compliance_summary: Optional[ComplianceSummaryOut] = None
    pipeline_status: Optional[str] = None
    review_status: Optional[str] = None
    remarks: Optional[str]
    created_at: datetime
    inspector_id: Optional[int]

    class Config:
        from_attributes = True


class ComplianceResult(BaseModel):
    scan_id: str
    is_compliant: bool
    compliance_score: float
    field_results: Dict[str, bool]
    missing_fields: List[str]
    extracted_fields: Dict[str, Any]
    remarks: str
    total_fields_checked: int
    mandatory_fields_present: int
    total_mandatory_fields: int
    ocr_confidence: float
    raw_ocr_text: str
    compliance_checks: List[ComplianceCheckOut] = []
    compliance_summary: ComplianceSummaryOut


# ── Dashboard stats ───────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_scans: int
    compliant_count: int
    non_compliant_count: int
    compliance_rate: float
    avg_compliance_score: float
    scans_today: int
    scans_this_week: int
    top_missing_fields: List[Dict[str, Any]]
    recent_scans: List[ScanOut]
