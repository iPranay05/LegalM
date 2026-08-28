from datetime import datetime, timedelta, timezone
from typing import Optional, Any
from jose import JWTError, jwt
# pyrefly: ignore [missing-import]
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from app.config import settings
from app.models.user import User, UserRole
from app.models.scan import Scan
from app.models.product import Product
from app.models.manufacturer import Manufacturer

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    # bcrypt has a hard 72-byte limit; truncate to stay within it
    return pwd_context.hash(password[:72])


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain[:72], hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


def scope_scans_for_user(query: Any, user: User, db: Session):
    """
    Scopes a Scan query to the user's role permissions:
    - Inspector: sees only scans where inspector_id == user.id
    - Controller / Analyst: sees all scans
    - ManufacturerSelfCheck: sees scans linked to their manufacturer account or uploaded by them
    """
    role_val = user.role.value if isinstance(user.role, UserRole) else str(user.role)

    if role_val == UserRole.Inspector.value:
        return query.filter(Scan.inspector_id == user.id)
    elif role_val == UserRole.ManufacturerSelfCheck.value:
        mfr = db.query(Manufacturer).filter(Manufacturer.contact_email == user.email).first()
        if not mfr:
            return query.filter(Scan.inspector_id == user.id)
        return query.outerjoin(Product, Scan.product_id == Product.id).filter(
            (Scan.inspector_id == user.id) | (Product.manufacturer_id == mfr.id)
        )
    elif role_val in (UserRole.Controller.value, UserRole.Analyst.value):
        return query
    # Fallback to own scans for safety
    return query.filter(Scan.inspector_id == user.id)
