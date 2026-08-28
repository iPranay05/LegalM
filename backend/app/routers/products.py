from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from app.database import get_db
from app.models.product import Product
from app.models.manufacturer import Manufacturer
from app.models.user import User
from app.routers.deps import get_current_user
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/products", tags=["Products"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ManufacturerCreate(BaseModel):
    name: str
    registration_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    is_importer: bool = False
    country_of_origin: Optional[str] = None


class ManufacturerOut(BaseModel):
    id: int
    name: str
    registration_number: Optional[str]
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    pincode: Optional[str]
    contact_email: Optional[str]
    contact_phone: Optional[str]
    is_importer: bool
    country_of_origin: Optional[str]
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    name: str
    brand_name: Optional[str] = None
    category: Optional[str] = "general"
    sku: Optional[str] = None
    barcode: Optional[str] = None
    description: Optional[str] = None
    manufacturer_id: Optional[int] = None
    registered_by_manufacturer: bool = False


class ProductOut(BaseModel):
    id: int
    name: str
    brand_name: Optional[str]
    category: Optional[str]
    sku: Optional[str]
    barcode: Optional[str]
    description: Optional[str]
    manufacturer_id: Optional[int]
    manufacturer: Optional[ManufacturerOut]
    is_compliant: Optional[bool]
    last_compliance_score: Optional[float]
    last_scan_id: Optional[str]
    registered_by_manufacturer: bool
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True


# ── Manufacturer endpoints ─────────────────────────────────────────────────────

@router.get("/manufacturers", response_model=List[ManufacturerOut])
def list_manufacturers(
    search: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Manufacturer).filter(Manufacturer.is_active == True)
    if search:
        q = q.filter(Manufacturer.name.ilike(f"%{search}%"))
    if state:
        q = q.filter(Manufacturer.state == state)
    return q.order_by(Manufacturer.name).offset(skip).limit(limit).all()


@router.post("/manufacturers", response_model=ManufacturerOut, status_code=201)
def create_manufacturer(
    payload: ManufacturerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "controller"):
        raise HTTPException(status_code=403, detail="Only admins can register manufacturers")
    mfr = Manufacturer(**payload.model_dump())
    db.add(mfr)
    db.commit()
    db.refresh(mfr)
    return mfr


@router.get("/manufacturers/{mfr_id}", response_model=ManufacturerOut)
def get_manufacturer(
    mfr_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    mfr = db.query(Manufacturer).filter(Manufacturer.id == mfr_id).first()
    if not mfr:
        raise HTTPException(status_code=404, detail="Manufacturer not found")
    return mfr


@router.put("/manufacturers/{mfr_id}", response_model=ManufacturerOut)
def update_manufacturer(
    mfr_id: int,
    payload: ManufacturerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "controller"):
        raise HTTPException(status_code=403, detail="Not authorised")
    mfr = db.query(Manufacturer).filter(Manufacturer.id == mfr_id).first()
    if not mfr:
        raise HTTPException(status_code=404, detail="Manufacturer not found")
    for k, v in payload.model_dump().items():
        setattr(mfr, k, v)
    db.commit()
    db.refresh(mfr)
    return mfr


# ── Product endpoints ──────────────────────────────────────────────────────────

@router.get("/", response_model=List[ProductOut])
def list_products(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    manufacturer_id: Optional[int] = Query(None),
    is_compliant: Optional[bool] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Product).filter(Product.is_active == True)

    # Self-check: manufacturers can only see their own products
    if current_user.role == "manufacturer":
        # Find the manufacturer record linked to this user email
        mfr = db.query(Manufacturer).filter(
            Manufacturer.contact_email == current_user.email
        ).first()
        if mfr:
            q = q.filter(Product.manufacturer_id == mfr.id)
        else:
            return []  # No products if no linked manufacturer

    if search:
        q = q.filter(Product.name.ilike(f"%{search}%"))
    if category:
        q = q.filter(Product.category == category)
    if manufacturer_id:
        q = q.filter(Product.manufacturer_id == manufacturer_id)
    if is_compliant is not None:
        q = q.filter(Product.is_compliant == is_compliant)

    return q.order_by(Product.name).offset(skip).limit(limit).all()


@router.post("/", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.sku:
        existing = db.query(Product).filter(Product.sku == payload.sku).first()
        if existing:
            raise HTTPException(status_code=400, detail="SKU already exists")
    product = Product(**payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Self-check enforcement
    if current_user.role == "manufacturer":
        mfr = db.query(Manufacturer).filter(
            Manufacturer.contact_email == current_user.email
        ).first()
        if not mfr or product.manufacturer_id != mfr.id:
            raise HTTPException(status_code=403, detail="Not authorised to view this product")

    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for k, v in payload.model_dump().items():
        setattr(product, k, v)
    db.commit()
    db.refresh(product)
    return product
