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
from app.models.user import User
import app.models  # noqa: F401
from app.routers import admin, auth, dashboard, ecommerce, products, reports, scan
from app.services.auth_service import hash_password


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
        allow_origins=["*"],
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
def user_factory(db_session: Session) -> Callable[[str], User]:
    def create_user(role: str) -> User:
        normalized = role.lower()
        user = User(
            name=f"{role} User",
            email=f"{normalized}@example.test",
            hashed_password=hash_password("password123"),
            role=role,
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
def inspector_user(user_factory: Callable[[str], User]) -> User:
    return user_factory("Inspector")


@pytest.fixture()
def controller_user(user_factory: Callable[[str], User]) -> User:
    return user_factory("Controller")


@pytest.fixture()
def analyst_user(user_factory: Callable[[str], User]) -> User:
    return user_factory("Analyst")


@pytest.fixture()
def manufacturer_self_check_user(user_factory: Callable[[str], User]) -> User:
    return user_factory("ManufacturerSelfCheck")
