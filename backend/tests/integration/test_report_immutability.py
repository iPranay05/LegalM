from unittest.mock import patch

from app.models.scan import Scan
from app.models.report import Report
from tests.conftest import make_token


def test_regenerating_report_supersedes_previous_report(client, db_session, inspector_user, tmp_path):
    scan = Scan(scan_id="immutable-report-scan", inspector_id=inspector_user.id, category="General", product_name="Demo", pipeline_status="complete")
    db_session.add(scan)
    db_session.commit()
    headers = {"Authorization": f"Bearer {make_token(inspector_user)}"}
    results = [
        {"report_id": "report-one", "format": "pdf", "file_path": str(tmp_path / "one.pdf"), "file_hash_sha256": "hash-one"},
        {"report_id": "report-two", "format": "pdf", "file_path": str(tmp_path / "two.pdf"), "file_hash_sha256": "hash-two"},
    ]
    with patch("app.routers.reports.generate_report", side_effect=results):
        assert client.post(f"/reports/generate/{scan.scan_id}", headers=headers).status_code == 201
        assert client.post(f"/reports/generate/{scan.scan_id}", headers=headers).status_code == 201
    reports = db_session.query(Report).filter(Report.scan_id == scan.scan_id).order_by(Report.id).all()
    assert len(reports) == 2
    assert reports[0].report_id == "report-one"
    assert reports[0].superseded_by_report_id == "report-two"
    assert reports[1].superseded_by_report_id is None

