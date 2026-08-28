"""add evidence columns to compliance checks

Revision ID: e5f9a2b4c6d8
Revises: c4e8f2a1b9d7
Create Date: 2026-08-29 00:35:00.000000

Adds:
  - image_index (Integer) to compliance_checks
  - bounding_box (JSON) to compliance_checks
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f9a2b4c6d8'
down_revision: Union[str, None] = 'c4e8f2a1b9d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('compliance_checks', sa.Column('image_index', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('compliance_checks', sa.Column('bounding_box', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('compliance_checks', 'bounding_box')
    op.drop_column('compliance_checks', 'image_index')
