# pyrefly: ignore [missing-import]
from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Legal Metrology Compliance API"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"  # "development" | "staging" | "production" | "testing"
    DEBUG: bool = False

    # Database
    DATABASE_URL: Optional[str] = None

    # Auth (JWT)
    SECRET_KEY: Optional[str] = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # CORS Allowlist (comma-separated list of allowed origins)
    CORS_ORIGINS: Optional[str] = None

    # Tesseract binary path (Windows default; change if on Linux/Mac)
    TESSERACT_CMD: Optional[str] = None

    # Upload directory
    UPLOAD_DIR: str = "uploads"

    # Groq LLM API key (optional — enables structured OCR extraction)
    GROQ_API_KEY: Optional[str] = None

    @model_validator(mode="after")
    def validate_environment_settings(self):
        is_dev = self.ENVIRONMENT.lower() in ("development", "dev", "test", "testing")

        if self.DEBUG and not is_dev:
            raise ValueError("DEBUG=True is only permitted in development or testing environments.")

        # Database URL requirement
        if not self.DATABASE_URL:
            if is_dev:
                self.DATABASE_URL = "sqlite:///./compliance.db"
            else:
                raise ValueError("DATABASE_URL must be explicitly configured via environment variable in non-development environments.")

        # Secret key requirement
        if not self.SECRET_KEY:
            if is_dev:
                self.SECRET_KEY = "dev-insecure-secret-key-for-local-testing-only"
            else:
                raise ValueError("SECRET_KEY must be explicitly set in the environment outside development mode.")

        if not self.CORS_ORIGINS:
            if is_dev:
                self.CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8081,http://127.0.0.1:8081"
            else:
                raise ValueError("CORS_ORIGINS must be explicitly configured outside development mode.")

        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        if "*" in origins:
            raise ValueError("CORS_ORIGINS must be a real allowlist; wildcard origins cannot be used with credentials.")

        return self

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
