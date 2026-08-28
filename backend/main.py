import logging
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import create_tables
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
