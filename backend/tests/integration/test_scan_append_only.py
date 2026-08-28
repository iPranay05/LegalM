import base64
import io
from unittest.mock import patch

from app.models.scan import Scan
from tests.conftest import make_token

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==")


def test_rescanning_creates_a_new_scan_without_mutating_original(client, db_session, inspector_user):
    headers = {"Authorization": f"Bearer {make_token(inspector_user)}"}
    with patch("app.services.pipeline_service.run_pipeline_task.delay"):
        first = client.post("/scan/upload", files={"file": ("one.png", io.BytesIO(PNG), "image/png")}, data={"category": "General"}, headers=headers)
        second = client.post("/scan/upload", files={"file": ("two.png", io.BytesIO(PNG), "image/png")}, data={"category": "General"}, headers=headers)
    assert first.status_code == second.status_code == 201
    first_id, second_id = first.json()["scan_id"], second.json()["scan_id"]
    assert first_id != second_id
    rows = db_session.query(Scan).filter(Scan.inspector_id == inspector_user.id).order_by(Scan.id).all()
    assert [row.scan_id for row in rows] == [first_id, second_id]
    assert rows[0].pipeline_status == "pending"

