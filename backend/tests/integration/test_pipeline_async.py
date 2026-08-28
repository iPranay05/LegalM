"""
Integration tests for asynchronous perception pipeline.
Covers IMPLEMENTATION_PLAN_V2.md §5.3.
"""
import base64
import io
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.models.user import User
from tests.conftest import make_token


_PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="
)


def auth_headers(user: User) -> dict:
    return {"Authorization": f"Bearer {make_token(user)}"}


def test_upload_returns_before_pipeline_completes(client: TestClient, inspector_user: User):
    """
    Submitting a scan upload must return immediately with status_code=201
    and pipeline_status="pending", enqueuing the background Celery task
    without blocking on OCR or rule perception pipeline execution.
    """
    with patch("app.services.pipeline_service.run_pipeline_task.delay") as mock_delay:
        mock_delay.return_value = MagicMock(id="fake-task-id")

        response = client.post(
            "/scan/upload",
            files={"file": ("test.png", io.BytesIO(_PNG_1X1), "image/png")},
            data={"category": "General", "brand_name": "TestBrand"},
            headers=auth_headers(inspector_user),
        )

        assert response.status_code == 201
        data = response.json()
        assert "scan_id" in data
        assert data["pipeline_status"] == "pending"
        mock_delay.assert_called_once()


def test_get_scan_status_endpoint(client: TestClient, inspector_user: User):
    """GET /scan/{scan_id}/status returns lightweight status for polling."""
    with patch("app.services.pipeline_service.run_pipeline_task.delay") as mock_delay:
        mock_delay.return_value = MagicMock(id="fake-task-id")

        create_resp = client.post(
            "/scan/upload",
            files={"file": ("test.png", io.BytesIO(_PNG_1X1), "image/png")},
            data={"category": "General"},
            headers=auth_headers(inspector_user),
        )
        scan_id = create_resp.json()["scan_id"]

        status_resp = client.get(
            f"/scan/{scan_id}/status",
            headers=auth_headers(inspector_user),
        )
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["scan_id"] == scan_id
        assert "pipeline_status" in status_data
        assert "review_status" in status_data


def test_unreachable_celery_returns_503(client: TestClient, inspector_user: User):
    """If Celery/Redis queue fails to enqueue, upload returns 503 rather than silent fallback."""
    with patch("app.services.pipeline_service.run_pipeline_task.delay") as mock_delay:
        mock_delay.side_effect = Exception("Redis connection refused")

        response = client.post(
            "/scan/upload",
            files={"file": ("test.png", io.BytesIO(_PNG_1X1), "image/png")},
            data={"category": "General"},
            headers=auth_headers(inspector_user),
        )

        assert response.status_code == 503
        assert "Perception pipeline unavailable" in response.json()["detail"]
