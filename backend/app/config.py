from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Legal Metrology Compliance API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite:///./compliance.db"

    # Auth (JWT)
    SECRET_KEY: str = "sih2026-legal-metrology-secret-key-change-in-prod"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Tesseract binary path (Windows default; change if on Linux/Mac)
    TESSERACT_CMD: Optional[str] = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

    # Upload directory
    UPLOAD_DIR: str = "uploads"

    # Groq LLM API key (optional — enables structured OCR extraction)
    GROQ_API_KEY: Optional[str] = None

    class Config:
        env_file = ".env"


settings = Settings()
