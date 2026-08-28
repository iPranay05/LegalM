import os
import sys
from collections.abc import Callable, Generator

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.config import settings
from app.database import Base, get_db
from app.models.user import User, UserRole
import app.models  # noqa: F401
from app.routers import admin, auth, dashboard, ecommerce, products, reports, scan
from app.services.auth_service import hash_password, create_access_token


@pytest.fixture()
def db_session(tmp_path) -> Generator[Session, None, None]:
    database_url = f"sqlite:///{tmp_path / 'test_compliance.db'}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def test_app(db_session: Session, tmp_path) -> Generator[FastAPI, None, None]:
    app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.include_router(auth.router)
    app.include_router(scan.router)
    app.include_router(dashboard.router)
    app.include_router(products.router)
    app.include_router(admin.router)
    app.include_router(reports.router)
    app.include_router(ecommerce.router)

    @app.get("/health", tags=["Health"])
    def health():
        return {"status": "ok"}

    yield app
    app.dependency_overrides.clear()


@pytest.fixture()
def client(test_app: FastAPI) -> Generator[TestClient, None, None]:
    with TestClient(test_app) as test_client:
        yield test_client


@pytest.fixture()
def user_factory(db_session: Session) -> Callable[[UserRole], User]:
    def create_user(role: UserRole, email_suffix: str = "") -> User:
        role_enum = UserRole(role) if isinstance(role, str) else role
        suffix = email_suffix or role_enum.value.lower()
        user = User(
            name=f"{role_enum.value} User",
            email=f"{suffix}@example.com",
            hashed_password=hash_password("password123"),
            role=role_enum,
            district="Test District",
            state="Test State",
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return create_user


@pytest.fixture()
def inspector_user(user_factory: Callable) -> User:
    return user_factory(UserRole.Inspector)


@pytest.fixture()
def controller_user(user_factory: Callable) -> User:
    return user_factory(UserRole.Controller)


@pytest.fixture()
def analyst_user(user_factory: Callable) -> User:
    return user_factory(UserRole.Analyst)


@pytest.fixture()
def manufacturer_self_check_user(user_factory: Callable) -> User:
    return user_factory(UserRole.ManufacturerSelfCheck)


def make_token(user: User) -> str:
    """Helper: create a JWT for the given user (mirrors auth.py login logic)."""
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    return create_access_token({"sub": str(user.id), "role": role_val})


@pytest.fixture()
def inspector_token(inspector_user: User) -> str:
    return make_token(inspector_user)


@pytest.fixture()
def controller_token(controller_user: User) -> str:
    return make_token(controller_user)


@pytest.fixture()
def analyst_token(analyst_user: User) -> str:
    return make_token(analyst_user)


@pytest.fixture()
def manufacturer_token(manufacturer_self_check_user: User) -> str:
    return make_token(manufacturer_self_check_user)
