"""
Phase 1 Integration Tests: RBAC Route × Role Matrix
Covers §4.3 of IMPLEMENTATION_PLAN_V2.md

Test matrix:
  - Unauthenticated requests to protected endpoints → 401
  - Inspector hitting admin write routes → 403
  - Analyst hitting scan upload → 403
  - Controller successfully hitting /admin/users → 201
  - POST /auth/register always assigns Inspector role regardless of payload
  - ManufacturerSelfCheck cannot access admin routes → 403
  - Product create/update role restrictions
"""
import base64
import io
import pytest
from fastapi.testclient import TestClient

from app.models.user import User, UserRole
from tests.conftest import make_token


# Minimal 1×1 white PNG (valid image file for PIL)
_PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="
)


# ─── Helper ────────────────────────────────────────────────────────────────────

def auth_headers(user: User) -> dict:
    return {"Authorization": f"Bearer {make_token(user)}"}


def upload_file(client: TestClient, headers: dict) -> "Response":
    """POST /scan/upload with a valid 1×1 PNG and a non-existent product_id."""
    return client.post(
        "/scan/upload",
        files={"file": ("test.png", io.BytesIO(_PNG_1X1), "image/png")},
        data={"product_id": "999999"},
        headers=headers,
    )


# ─── 1. Unauthenticated access ─────────────────────────────────────────────────

class TestUnauthenticated:
    def test_scan_status_requires_auth(self, client: TestClient):
        assert client.get("/scan/does-not-exist/status").status_code == 401

    def test_reports_require_auth(self, client: TestClient):
        assert client.get("/reports/scan/does-not-exist").status_code == 401

    def test_upload_requires_auth(self, client: TestClient):
        """POST /scan/upload without a token → 401."""
        resp = client.post(
            "/scan/upload",
            files={"file": ("test.png", io.BytesIO(_PNG_1X1), "image/png")},
            data={"product_id": "1"},
        )
        assert resp.status_code == 401

    def test_admin_rules_requires_auth(self, client: TestClient):
        """POST /admin/rules without a token → 401."""
        resp = client.post("/admin/rules", json={
            "code": "R001", "title": "Test Rule", "is_mandatory": True,
            "is_conduct_bucket": False, "weight": 10,
        })
        assert resp.status_code == 401

    def test_admin_users_requires_auth(self, client: TestClient):
        """GET /admin/users without a token → 401."""
        resp = client.get("/admin/users")
        assert resp.status_code == 401

    def test_dashboard_requires_auth(self, client: TestClient):
        """GET /dashboard/stats without a token → 401."""
        resp = client.get("/dashboard/stats")
        assert resp.status_code == 401


# ─── 2. Inspector role restrictions ───────────────────────────────────────────

class TestInspectorRestrictions:
    def test_inspector_cannot_create_rule(self, client: TestClient, inspector_user: User):
        """Inspector hitting POST /admin/rules → 403."""
        resp = client.post(
            "/admin/rules",
            json={"code": "R999", "title": "Unauthorized Rule",
                  "is_mandatory": True, "is_conduct_bucket": False, "weight": 5},
            headers=auth_headers(inspector_user),
        )
        assert resp.status_code == 403

    def test_inspector_cannot_list_admin_users(self, client: TestClient, inspector_user: User):
        """Inspector hitting GET /admin/users → 403."""
        resp = client.get("/admin/users", headers=auth_headers(inspector_user))
        assert resp.status_code == 403

    def test_inspector_cannot_create_admin_user(self, client: TestClient, inspector_user: User):
        """Inspector hitting POST /admin/users → 403."""
        resp = client.post(
            "/admin/users",
            json={
                "name": "New User", "email": "newuser@example.com",
                "password": "password123", "role": "Analyst",
            },
            headers=auth_headers(inspector_user),
        )
        assert resp.status_code == 403

    def test_inspector_upload_is_not_forbidden(self, client: TestClient, inspector_user: User):
        """Inspector CAN attempt scan upload — auth/role check passes (PIL/product error is fine)."""
        resp = upload_file(client, auth_headers(inspector_user))
        # Must NOT be 401 (unauthenticated) or 403 (forbidden by role)
        assert resp.status_code not in (401, 403)

    def test_inspector_can_list_rules(self, client: TestClient, inspector_user: User):
        """Inspector CAN read /admin/rules (read-only, authenticated-only)."""
        resp = client.get("/admin/rules", headers=auth_headers(inspector_user))
        assert resp.status_code == 200


# ─── 3. Analyst role restrictions ─────────────────────────────────────────────

class TestAnalystRestrictions:
    def test_analyst_cannot_upload_scan(self, client: TestClient, analyst_user: User):
        """Analyst hitting POST /scan/upload → 403."""
        resp = upload_file(client, auth_headers(analyst_user))
        assert resp.status_code == 403

    def test_analyst_cannot_create_admin_user(self, client: TestClient, analyst_user: User):
        """Analyst hitting POST /admin/users → 403."""
        resp = client.post(
            "/admin/users",
            json={
                "name": "Another User", "email": "another@example.com",
                "password": "password123", "role": "Inspector",
            },
            headers=auth_headers(analyst_user),
        )
        assert resp.status_code == 403

    def test_analyst_can_list_scans(self, client: TestClient, analyst_user: User):
        """Analyst CAN GET /scan/ (they see all scans, just can't upload)."""
        resp = client.get("/scan/", headers=auth_headers(analyst_user))
        assert resp.status_code == 200

    def test_analyst_status_route_is_authenticated(self, client: TestClient, analyst_user: User):
        resp = client.get("/scan/does-not-exist/status", headers=auth_headers(analyst_user))
        assert resp.status_code == 404


# ─── 4. Controller permissions ────────────────────────────────────────────────

class TestControllerPermissions:
    def test_controller_can_create_rule(self, client: TestClient, controller_user: User):
        """Controller CAN POST /admin/rules → 201."""
        resp = client.post(
            "/admin/rules",
            json={"code": "R100", "title": "A Rule", "is_mandatory": True,
                  "is_conduct_bucket": False, "weight": 10},
            headers=auth_headers(controller_user),
        )
        assert resp.status_code == 201

    def test_controller_can_list_users(self, client: TestClient, controller_user: User):
        """Controller CAN GET /admin/users → 200."""
        resp = client.get("/admin/users", headers=auth_headers(controller_user))
        assert resp.status_code == 200

    def test_controller_can_create_analyst_user(
        self, client: TestClient, controller_user: User
    ):
        """Controller CAN POST /admin/users with Analyst role → 201."""
        resp = client.post(
            "/admin/users",
            json={
                "name": "New Analyst", "email": "analyst2@example.com",
                "password": "password123", "role": "Analyst",
                "district": "D", "state": "S",
            },
            headers=auth_headers(controller_user),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["role"] == "Analyst"

    def test_controller_can_create_manufacturer_user(
        self, client: TestClient, controller_user: User
    ):
        """Controller CAN create a ManufacturerSelfCheck user."""
        resp = client.post(
            "/admin/users",
            json={
                "name": "Mfr User", "email": "mfr2@example.com",
                "password": "password123", "role": "ManufacturerSelfCheck",
                "district": "D", "state": "S",
            },
            headers=auth_headers(controller_user),
        )
        assert resp.status_code == 201
        assert resp.json()["role"] == "ManufacturerSelfCheck"


# ─── 5. Public registration always assigns Inspector ──────────────────────────

class TestPublicRegistration:
    def test_register_assigns_inspector_regardless_of_role_field(
        self, client: TestClient
    ):
        """POST /auth/register with role=Controller in body → user still gets Inspector."""
        resp = client.post(
            "/auth/register",
            json={
                "name": "Self Reg", "email": "selfreg@example.com",
                "password": "password123", "role": "Controller",
                "district": "D", "state": "S",
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["role"] == "Inspector"

    def test_register_assigns_inspector_when_no_role_given(
        self, client: TestClient
    ):
        """POST /auth/register with no role field → Inspector assigned."""
        resp = client.post(
            "/auth/register",
            json={
                "name": "Self Reg2", "email": "selfreg2@example.com",
                "password": "password123",
                "district": "D", "state": "S",
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["role"] == "Inspector"

    def test_register_duplicate_email_rejected(self, client: TestClient, inspector_user: User):
        """Registering with an already-used email → 400."""
        resp = client.post(
            "/auth/register",
            json={
                "name": "Dup", "email": inspector_user.email,
                "password": "password123",
            },
        )
        assert resp.status_code == 400


# ─── 6. ManufacturerSelfCheck restrictions ────────────────────────────────────

class TestManufacturerSelfCheckRestrictions:
    def test_manufacturer_upload_is_not_forbidden(
        self, client: TestClient, manufacturer_self_check_user: User
    ):
        """ManufacturerSelfCheck CAN attempt upload (role check passes; PIL/product error is fine)."""
        resp = upload_file(client, auth_headers(manufacturer_self_check_user))
        assert resp.status_code not in (401, 403)

    def test_manufacturer_cannot_create_rule(
        self, client: TestClient, manufacturer_self_check_user: User
    ):
        """ManufacturerSelfCheck hitting POST /admin/rules → 403."""
        resp = client.post(
            "/admin/rules",
            json={"code": "R888", "title": "X", "is_mandatory": True,
                  "is_conduct_bucket": False, "weight": 5},
            headers=auth_headers(manufacturer_self_check_user),
        )
        assert resp.status_code == 403

    def test_manufacturer_cannot_list_admin_users(
        self, client: TestClient, manufacturer_self_check_user: User
    ):
        """ManufacturerSelfCheck hitting GET /admin/users → 403."""
        resp = client.get("/admin/users", headers=auth_headers(manufacturer_self_check_user))
        assert resp.status_code == 403

    def test_manufacturer_scan_list_is_scoped(
        self, client: TestClient, manufacturer_self_check_user: User
    ):
        """ManufacturerSelfCheck GET /scan/ returns empty (no linked manufacturer in test db)."""
        resp = client.get("/scan/", headers=auth_headers(manufacturer_self_check_user))
        assert resp.status_code == 200
        data = resp.json()
        # No manufacturer record linked → 0 scans visible
        assert isinstance(data, list)
        assert len(data) == 0
