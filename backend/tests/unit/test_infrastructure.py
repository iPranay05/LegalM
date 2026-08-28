import os
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from main import app


def test_production_environment_requires_explicit_database_url():
    with pytest.raises(ValueError, match="DATABASE_URL must be explicitly configured"):
        Settings(_env_file=None, ENVIRONMENT="production", DATABASE_URL=None, SECRET_KEY="valid-secret-key")


def test_production_environment_requires_explicit_secret_key():
    with pytest.raises(ValueError, match="SECRET_KEY must be explicitly set"):
        Settings(_env_file=None, ENVIRONMENT="production", DATABASE_URL="postgresql://user:pass@localhost:5432/db", SECRET_KEY=None)


def test_non_development_requires_explicit_cors_allowlist():
    with pytest.raises(ValueError, match="CORS_ORIGINS must be explicitly configured"):
        Settings(_env_file=None, ENVIRONMENT="production", DATABASE_URL="postgresql://user:pass@localhost:5432/db", SECRET_KEY="valid-secret-key", CORS_ORIGINS="")


def test_wildcard_cors_is_rejected_with_credentials():
    with pytest.raises(ValueError, match="wildcard origins"):
        Settings(_env_file=None, ENVIRONMENT="development", CORS_ORIGINS="*", DATABASE_URL="sqlite:///./test.db", SECRET_KEY="test-secret")


def test_development_environment_provides_safe_defaults():
    s = Settings(_env_file=None, ENVIRONMENT="development", DATABASE_URL=None, SECRET_KEY=None)
    assert s.DATABASE_URL.startswith("sqlite://")
    assert s.SECRET_KEY is not None
    assert s.DEBUG is False  # Default DEBUG is False per Plan §8.4


def test_unhandled_exception_does_not_leak_internals_when_debug_false():
    # Trigger an endpoint or test unhandled exception with client
    client = TestClient(app, raise_server_exceptions=False)
    
    # Define temporary route that raises an internal error with sensitive SQL/path info
    @app.get("/test-error-leak")
    def trigger_error():
        raise RuntimeError("SELECT * FROM users WHERE password_hash = 'secret_token_123' at /var/app/secret.py")

    response = client.get("/test-error-leak")
    assert response.status_code == 500
    data = response.json()
    assert "detail" in data
    # Assert sensitive SQL and file paths are not leaked in the response
    assert "password_hash" not in data["detail"]
    assert "/var/app/secret.py" not in data["detail"]
    assert "SELECT" not in data["detail"]
    assert data["detail"] == "Internal server error. Please contact the administrator."
