"""
Regression test for the startup rule-catalog sync.

Previously, rules added to seed_data.py (e.g. fssai_number, veg_non_veg_symbol)
only reached a database when someone manually ran `python seed.py`. A
compliance report could then silently omit a declaration that was genuinely
extracted from the label, because no Rule row existed for the evaluator to
check it against.

main.py's startup event now calls seed_categories()/seed_rules() on every
boot, so a plain restart brings any database's rule catalog in sync with the
code with no manual step. This runs in a fresh subprocess (rather than
importing `main` directly) because app.database's engine is created at
import time from the DATABASE_URL already resolved for the rest of the test
suite; a subprocess lets this test point at its own throwaway SQLite file
without disturbing that.
"""
import os
import subprocess
import sys
import textwrap


def test_app_startup_seeds_missing_rules_into_an_out_of_sync_database(tmp_path):
    db_path = tmp_path / "startup_sync_test.db"
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

    script = textwrap.dedent(f"""
        import sys, os
        sys.path.insert(0, {backend_dir!r})
        os.environ["DATABASE_URL"] = "sqlite:///{db_path}"
        os.environ["SECRET_KEY"] = "test"

        from fastapi.testclient import TestClient
        import main as main_module

        with TestClient(main_module.app) as client:
            resp = client.get("/health")
            assert resp.status_code == 200

        from app.database import SessionLocal
        from app.models.rules import Rule
        db = SessionLocal()
        families = {{r.rule_family for r in db.query(Rule).all()}}
        db.close()

        assert "fssai_number" in families, f"fssai_number missing after startup: {{families}}"
        assert "veg_non_veg_symbol" in families, f"veg_non_veg_symbol missing after startup: {{families}}"
        print("OK")
    """)

    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True, text=True, timeout=60,
    )
    assert result.returncode == 0, (
        f"Startup rule sync failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    assert "OK" in result.stdout
