import logging
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import create_tables, SessionLocal
from app.routers import auth, scan, dashboard
from app.routers import products, admin, reports, ecommerce

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "API for the Legal Metrology (Packaged Commodities) Rules 2011 "
        "Compliance Checker System — SIH 26034"
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS (Environment-configured allowlist) ───────────────────────────────────
cors_origins = [origin.strip() for origin in (settings.CORS_ORIGINS or "").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception Handler (Prevent leaking sensitive internals when DEBUG=False) ──
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server exception processing request %s: %s", request.url.path, exc)
    if settings.DEBUG:
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc), "type": type(exc).__name__},
        )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please contact the administrator."},
    )

# ── Static files ──────────────────────────────────────────────────────────────
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(os.path.dirname(settings.UPLOAD_DIR), "reports"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(scan.router)
app.include_router(dashboard.router)
app.include_router(products.router)
app.include_router(admin.router)
app.include_router(reports.router)
app.include_router(ecommerce.router)


@app.on_event("startup")
def startup():
    create_tables()
    _sync_compliance_rule_catalog()


def _sync_compliance_rule_catalog() -> None:
    """
    Keep the commodity-category / rule catalog in the database in sync with
    the source-of-truth definitions in app.services.seed_data, every time the
    API boots.

    Previously the rule catalog (which declarations/checks — e.g. FSSAI
    licence number, veg/non-veg symbol — actually get evaluated and shown in
    reports) was only populated by manually running `python seed.py` once.
    Any rule added to seed_data.py after that point silently never reached
    already-deployed databases, so a genuinely-visible declaration (like an
    FSSAI number on the label) could be detected by OCR/vision but never
    appear in the report at all, because no Rule row existed to evaluate it
    against. Running this idempotent upsert on every startup means a plain
    container restart / redeploy is enough to pick up new or changed rules —
    no separate manual step to remember.
    """
    from app.services.seed_data import seed_categories, seed_rules
    db = SessionLocal()
    try:
        seed_categories(db)
        seed_rules(db)
        logger.info("Compliance rule catalog synced with seed_data on startup.")
    except Exception:
        # Never let a seeding hiccup (e.g. a benign unique-constraint race
        # between multiple workers/replicas starting at once) block the API
        # from serving requests.
        logger.exception("Rule catalog sync failed on startup — continuing without it.")
        db.rollback()
    finally:
        db.close()


@app.get("/", tags=["Health"])
def root():
    return {
        "status": "online",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
