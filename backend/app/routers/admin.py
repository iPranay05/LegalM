"""Admin Panel Router — rules, relaxation orders, user management (controller only)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from datetime import datetime
from app.database import get_db
from app.models.rules import Rule, RelaxationOrder
from app.models.user import User
from app.routers.deps import get_current_user
from pydantic import BaseModel, Field

router = APIRouter(prefix="/admin", tags=["Admin"])


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "controller"):
        raise HTTPException(status_code=403, detail="Controller/Admin access required")
    return current_user


# ── Rule schemas ──────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    code: str
    title: str
    description: Optional[str] = None
    legal_reference: Optional[str] = None
    category_scope: Optional[List[str]] = None
    is_mandatory: bool = True
    is_conduct_bucket: bool = False
    weight: int = Field(default=10, ge=1, le=100)


class RuleOut(BaseModel):
    id: int
    code: str
    title: str
    description: Optional[str]
    legal_reference: Optional[str]
    category_scope: Optional[List[str]]
    is_mandatory: bool
    is_conduct_bucket: bool
    weight: int
    is_active: bool
    retired_at: Optional[datetime]
    created_at: datetime
    relaxation_count: Optional[int] = 0
    class Config:
        from_attributes = True


# ── Relaxation schemas ────────────────────────────────────────────────────────

class RelaxationCreate(BaseModel):
    order_number: str
    rule_id: int
    title: str
    description: Optional[str] = None
    gazette_reference: Optional[str] = None
    applies_to_categories: Optional[List[str]] = None
    applies_to_states: Optional[List[str]] = None
    valid_from: datetime
    valid_until: Optional[datetime] = None


class RelaxationOut(BaseModel):
    id: int
    order_number: str
    rule_id: int
    title: str
    description: Optional[str]
    gazette_reference: Optional[str]
    applies_to_categories: Optional[List[str]]
    applies_to_states: Optional[List[str]]
    valid_from: datetime
    valid_until: Optional[datetime]
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True


# ── User schemas ──────────────────────────────────────────────────────────────

class UserAdminOut(BaseModel):
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


class UserRoleUpdate(BaseModel):
    role: str
    is_active: bool


# ── Rule endpoints ─────────────────────────────────────────────────────────────

@router.get("/rules", response_model=List[RuleOut])
def list_rules(
    include_retired: bool = Query(False),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Rule)
    if not include_retired:
        q = q.filter(Rule.is_active == True)
    if category:
        q = q.filter(Rule.category_scope.contains([category]))
    rules = q.order_by(Rule.code).all()
    # Annotate with relaxation count
    result = []
    for rule in rules:
        relaxation_count = db.query(func.count(RelaxationOrder.id)).filter(
            RelaxationOrder.rule_id == rule.id,
            RelaxationOrder.is_active == True,
        ).scalar() or 0
        r = RuleOut.model_validate(rule)
        r.relaxation_count = relaxation_count
        result.append(r)
    return result


@router.post("/rules", response_model=RuleOut, status_code=201)
def create_rule(
    payload: RuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    existing = db.query(Rule).filter(Rule.code == payload.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Rule code '{payload.code}' already exists")
    rule = Rule(**payload.model_dump(), created_by_id=current_user.id)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/rules/{rule_id}", response_model=RuleOut)
def get_rule(rule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rule = db.query(Rule).filter(Rule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    relaxation_count = db.query(func.count(RelaxationOrder.id)).filter(
        RelaxationOrder.rule_id == rule_id, RelaxationOrder.is_active == True
    ).scalar() or 0
    r = RuleOut.model_validate(rule)
    r.relaxation_count = relaxation_count
    return r


@router.patch("/rules/{rule_id}/retire")
def retire_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Retire (soft-delete) a rule. Warns if active relaxation orders reference it.
    Rules are never hard-deleted.
    """
    rule = db.query(Rule).filter(Rule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if not rule.is_active:
        raise HTTPException(status_code=400, detail="Rule is already retired")

    active_relaxations = db.query(func.count(RelaxationOrder.id)).filter(
        RelaxationOrder.rule_id == rule_id,
        RelaxationOrder.is_active == True,
    ).scalar() or 0

    rule.is_active = False
    rule.retired_at = datetime.utcnow()
    rule.retired_by_id = current_user.id
    db.commit()

    return {
        "detail": "Rule retired successfully",
        "rule_id": rule_id,
        "warning": (
            f"{active_relaxations} active relaxation order(s) reference this rule"
            if active_relaxations > 0 else None
        ),
    }


# ── Relaxation order endpoints ─────────────────────────────────────────────────

@router.get("/relaxations", response_model=List[RelaxationOut])
def list_relaxations(
    rule_id: Optional[int] = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(RelaxationOrder)
    if active_only:
        q = q.filter(RelaxationOrder.is_active == True)
    if rule_id:
        q = q.filter(RelaxationOrder.rule_id == rule_id)
    return q.order_by(RelaxationOrder.created_at.desc()).all()


@router.post("/relaxations", response_model=RelaxationOut, status_code=201)
def create_relaxation(
    payload: RelaxationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    existing = db.query(RelaxationOrder).filter(
        RelaxationOrder.order_number == payload.order_number
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Order number already exists")
    rule = db.query(Rule).filter(Rule.id == payload.rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    order = RelaxationOrder(**payload.model_dump(), created_by_id=current_user.id)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.patch("/relaxations/{order_id}/deactivate")
def deactivate_relaxation(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    order = db.query(RelaxationOrder).filter(RelaxationOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Relaxation order not found")
    order.is_active = False
    db.commit()
    return {"detail": "Relaxation order deactivated"}


# ── User management endpoints ──────────────────────────────────────────────────

@router.get("/users", response_model=List[UserAdminOut])
def list_users(
    role: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if state:
        q = q.filter(User.state == state)
    return q.order_by(User.name).all()


@router.patch("/users/{user_id}", response_model=UserAdminOut)
def update_user_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    valid_roles = ("inspector", "admin", "controller", "supervisor", "manufacturer")
    if payload.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Valid: {valid_roles}")
    user.role = payload.role
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user
