"""role enum: migrate users.role to user_role_enum

Revision ID: b3f8a1c2d4e5
Revises: ac732dc0c569
Create Date: 2026-08-28 20:30:00.000000

Mapping:
  admin       -> Controller
  controller  -> Controller
  supervisor  -> Controller
  inspector   -> Inspector
  manufacturer -> ManufacturerSelfCheck
  analyst     -> Analyst
  (any unknown) -> Inspector  (safe default)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b3f8a1c2d4e5'
down_revision: Union[str, None] = 'ac732dc0c569'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# New enum values (match UserRole enum in user.py)
new_enum_values = ('Inspector', 'Controller', 'Analyst', 'ManufacturerSelfCheck')

user_role_enum = postgresql.ENUM(
    *new_enum_values,
    name='user_role_enum',
    create_type=False,
)


def upgrade() -> None:
    # 1. Create the PostgreSQL enum type
    op.execute("CREATE TYPE user_role_enum AS ENUM ('Inspector', 'Controller', 'Analyst', 'ManufacturerSelfCheck')")

    # 2. Add a temporary column with the new enum type
    op.add_column('users', sa.Column('role_new', user_role_enum, nullable=True))

    # 3. Migrate data: map old string values → new enum labels
    op.execute("""
        UPDATE users
        SET role_new = CASE
            WHEN LOWER(role) IN ('admin', 'controller', 'supervisor') THEN 'Controller'::user_role_enum
            WHEN LOWER(role) = 'inspector'                            THEN 'Inspector'::user_role_enum
            WHEN LOWER(role) IN ('manufacturer', 'manufacturerselfcheck') THEN 'ManufacturerSelfCheck'::user_role_enum
            WHEN LOWER(role) = 'analyst'                              THEN 'Analyst'::user_role_enum
            ELSE 'Inspector'::user_role_enum
        END
    """)

    # 4. Make it non-nullable now that all rows have a value
    op.alter_column('users', 'role_new', nullable=False)

    # 5. Drop the old varchar column and rename the new one
    op.drop_column('users', 'role')
    op.alter_column('users', 'role_new', new_column_name='role')


def downgrade() -> None:
    # 1. Add a temporary VARCHAR column
    op.add_column('users', sa.Column('role_old', sa.String(), nullable=True))

    # 2. Convert enum back to lowercase strings
    op.execute("""
        UPDATE users
        SET role_old = CASE
            WHEN role = 'Controller'           THEN 'admin'
            WHEN role = 'Inspector'            THEN 'inspector'
            WHEN role = 'ManufacturerSelfCheck' THEN 'manufacturer'
            WHEN role = 'Analyst'              THEN 'analyst'
            ELSE 'inspector'
        END
    """)

    op.alter_column('users', 'role_old', nullable=False)
    op.drop_column('users', 'role')
    op.alter_column('users', 'role_old', new_column_name='role')

    # 3. Drop the enum type
    op.execute("DROP TYPE user_role_enum")
