"""sync rule catalog (commodity categories + rules) with seed_data

Revision ID: c3a02866ed4e
Revises: e5f9a2b4c6d8
Create Date: 2026-08-30 05:00:00.000000

Data-only migration. Upserts the commodity categories and rules defined in
app.services.seed_data into the database.

Why this exists: rule catalog rows (e.g. the FSSAI licence number rule, and
the veg/non-veg symbol rule) were previously only inserted by manually
running `python seed.py` once. Any rule added to seed_data.py afterwards
never reached already-deployed databases on its own, so a declaration that
was genuinely visible on a label (and correctly extracted by OCR/vision)
could still be silently missing from the generated compliance report,
because no Rule row existed for the evaluator to check it against.

Running seed_categories()/seed_rules() here means `alembic upgrade head`
alone — the normal deploy step — brings any environment's rule catalog back
in sync, without a separate manual seeding step to remember. This is safe to
run against any existing database: both helpers upsert by unique key (name /
code) and never delete or duplicate rows.

This migration is intentionally a no-op on `downgrade()` — retiring rules
is a deliberate compliance/audit action (see app/routers/admin.py's
soft-delete "retire" endpoint), not something a schema rollback should do.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.orm import Session

# revision identifiers, used by Alembic.
revision: str = 'c3a02866ed4e'
down_revision: Union[str, None] = 'e5f9a2b4c6d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from app.services.seed_data import seed_categories, seed_rules

    bind = op.get_bind()
    session = Session(bind=bind)
    try:
        seed_categories(session)
        seed_rules(session)
    finally:
        session.close()


def downgrade() -> None:
    # Intentional no-op — see module docstring.
    pass
