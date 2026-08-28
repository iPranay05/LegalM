from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, cast, Integer
from datetime import datetime, timedelta
from collections import Counter
from typing import Optional
from app.database import get_db
from app.models.scan import Scan, ManualFinding
from app.models.user import User
from app.routers.deps import get_current_user
from app.services.compliance_engine import get_field_definitions

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _base_scan_query(db: Session, current_user: User):
    """Returns a query scoped to the user's role."""
    q = db.query(Scan)
    # Inspectors see only their own scans; supervisors/admins see all
    if current_user.role == "inspector":
        q = q.filter(Scan.inspector_id == current_user.id)
    return q


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    base = _base_scan_query(db, current_user)

    total_scans = base.with_entities(func.count(Scan.id)).scalar() or 0
    compliant_count = base.filter(Scan.is_compliant == True).with_entities(func.count(Scan.id)).scalar() or 0
    non_compliant_count = base.filter(Scan.is_compliant == False).with_entities(func.count(Scan.id)).scalar() or 0
    scans_today = base.filter(Scan.created_at >= today_start).with_entities(func.count(Scan.id)).scalar() or 0
    scans_this_week = base.filter(Scan.created_at >= week_start).with_entities(func.count(Scan.id)).scalar() or 0
    pending_reviews = base.filter(Scan.pipeline_status == "review_needed").with_entities(func.count(Scan.id)).scalar() or 0

    avg_score = base.with_entities(func.avg(Scan.compliance_score)).scalar()
    avg_compliance_score = round(float(avg_score), 1) if avg_score else 0.0
    compliance_rate = round((compliant_count / total_scans * 100), 1) if total_scans else 0.0

    # Top missing fields
    all_missing = []
    scans_with_missing = base.with_entities(Scan.missing_fields).filter(Scan.missing_fields.isnot(None)).all()
    for (fields,) in scans_with_missing:
        if isinstance(fields, list):
            all_missing.extend(fields)
    missing_counter = Counter(all_missing)
    top_missing_fields = [
        {"field": f, "count": c} for f, c in missing_counter.most_common(5)
    ]

    # Trend: scans per day for last 7 days
    trend = []
    for i in range(6, -1, -1):
        day_start = today_start - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        count = base.filter(Scan.created_at >= day_start, Scan.created_at < day_end).with_entities(func.count(Scan.id)).scalar() or 0
        compliant_day = base.filter(
            Scan.created_at >= day_start, Scan.created_at < day_end,
            Scan.is_compliant == True,
        ).with_entities(func.count(Scan.id)).scalar() or 0
        trend.append({
            "date": day_start.strftime("%d %b"),
            "total": count,
            "compliant": compliant_day,
        })

    # Recent scans
    recent_scans = (
        base.order_by(desc(Scan.created_at)).limit(10).all()
    )

    return {
        "total_scans": total_scans,
        "compliant_count": compliant_count,
        "non_compliant_count": non_compliant_count,
        "compliance_rate": compliance_rate,
        "avg_compliance_score": avg_compliance_score,
        "scans_today": scans_today,
        "scans_this_week": scans_this_week,
        "pending_reviews": pending_reviews,
        "top_missing_fields": top_missing_fields,
        "trend": trend,
        "recent_scans": [_scan_brief(s) for s in recent_scans],
    }


def _scan_brief(scan: Scan) -> dict:
    return {
        "id": scan.id,
        "scan_id": scan.scan_id,
        "product_name": scan.product_name,
        "category": scan.category,
        "shop_name": scan.shop_name,
        "location": scan.location,
        "state": scan.state,
        "district": scan.district,
        "is_compliant": scan.is_compliant,
        "compliance_score": scan.compliance_score,
        "missing_fields": scan.missing_fields,
        "pipeline_status": scan.pipeline_status,
        "created_at": scan.created_at.isoformat() if scan.created_at else None,
        "inspector_id": scan.inspector_id,
    }


@router.get("/fields")
def get_compliance_fields():
    return get_field_definitions()


@router.get("/scans-by-state")
def scans_by_state(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = _base_scan_query(db, current_user)
    results = (
        base.with_entities(
            Scan.state,
            func.count(Scan.id).label("total"),
            func.sum(cast(Scan.is_compliant, Integer)).label("compliant"),
        )
        .filter(Scan.state.isnot(None))
        .group_by(Scan.state)
        .all()
    )
    return [
        {
            "state": row.state,
            "total": row.total,
            "compliant": row.compliant or 0,
            "non_compliant": row.total - (row.compliant or 0),
        }
        for row in results
    ]


@router.get("/scans-by-category")
def scans_by_category(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = _base_scan_query(db, current_user)
    results = (
        base.with_entities(Scan.category, func.count(Scan.id).label("total"))
        .filter(Scan.category.isnot(None))
        .group_by(Scan.category)
        .all()
    )
    return [{"category": row.category, "total": row.total} for row in results]


@router.get("/violations-by-manufacturer")
def violations_by_manufacturer(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Group violations by product/manufacturer for admin view."""
    from app.models.product import Product
    from app.models.manufacturer import Manufacturer
    results = (
        db.query(
            Manufacturer.name.label("manufacturer"),
            func.count(Scan.id).label("total_scans"),
            func.sum(cast(Scan.is_compliant == False, Integer)).label("violations"),
        )
        .join(Product, Product.manufacturer_id == Manufacturer.id, isouter=True)
        .join(Scan, Scan.product_id == Product.id, isouter=True)
        .group_by(Manufacturer.name)
        .order_by(desc("violations"))
        .limit(20)
        .all()
    )
    return [
        {
            "manufacturer": row.manufacturer,
            "total_scans": row.total_scans or 0,
            "violations": row.violations or 0,
        }
        for row in results
    ]


@router.get("/top-violations")
def top_violations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Most common violation rules from manual findings."""
    results = (
        db.query(ManualFinding.rule_code, func.count(ManualFinding.id).label("count"))
        .filter(ManualFinding.finding_type == "violation")
        .group_by(ManualFinding.rule_code)
        .order_by(desc("count"))
        .limit(10)
        .all()
    )
    return [{"rule_code": r.rule_code, "count": r.count} for r in results]
