"""commodity categories and versioned rules

Revision ID: c4e8f2a1b9d7
Revises: b3f8a1c2d4e5
Create Date: 2026-08-28 22:45:00.000000

Adds:
  - commodity_categories table
  - commodity_category_id FK to products and scans
  - rule_family, effective_from, effective_to, has_transitional_clause,
    commodity_category_id, check_type to rules
  - manufacturer_id, product_id, non-nullable valid_until to relaxation_orders
"""
from typing import Sequence, Union
from datetime import date
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c4e8f2a1b9d7'
down_revision: Union[str, None] = 'b3f8a1c2d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create commodity_categories table
    op.create_table(
        'commodity_categories',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('is_food', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_medical_device', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('requires_standard_size', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('font_rule_exempted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_commodity_categories_id'), 'commodity_categories', ['id'], unique=False)
    op.create_index(op.f('ix_commodity_categories_name'), 'commodity_categories', ['name'], unique=True)

    # 2. Add commodity_category_id to products and scans
    op.add_column('products', sa.Column('commodity_category_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_products_commodity_category_id', 'products', 'commodity_categories', ['commodity_category_id'], ['id'])

    op.add_column('scans', sa.Column('commodity_category_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_scans_commodity_category_id', 'scans', 'commodity_categories', ['commodity_category_id'], ['id'])

    # 3. Create RuleCheckType enum
    check_type_enum = postgresql.ENUM(
        'Presence', 'Format', 'Placement', 'FontSize', 'Symbol', 'StandardSize', 'Exemption',
        name='rule_check_type_enum'
    )
    check_type_enum.create(op.get_bind(), checkfirst=True)

    # 4. Add versioning columns to rules
    op.add_column('rules', sa.Column('rule_family', sa.String(), nullable=False, server_default='general'))
    op.create_index(op.f('ix_rules_rule_family'), 'rules', ['rule_family'], unique=False)
    op.add_column('rules', sa.Column('effective_from', sa.Date(), nullable=False, server_default='2011-04-01'))
    op.add_column('rules', sa.Column('effective_to', sa.Date(), nullable=True))
    op.add_column('rules', sa.Column('has_transitional_clause', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('rules', sa.Column('commodity_category_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_rules_commodity_category_id', 'rules', 'commodity_categories', ['commodity_category_id'], ['id'])
    op.add_column('rules', sa.Column(
        'check_type',
        sa.Enum('Presence', 'Format', 'Placement', 'FontSize', 'Symbol', 'StandardSize', 'Exemption', name='rule_check_type_enum'),
        nullable=False,
        server_default='Presence'
    ))

    # 5. Extend relaxation_orders table
    # Check if existing relaxation_orders exist without a manufacturer
    bind = op.get_bind()
    conn = bind.engine if hasattr(bind, 'engine') else bind
    
    op.add_column('relaxation_orders', sa.Column('manufacturer_id', sa.Integer(), nullable=True))
    op.add_column('relaxation_orders', sa.Column('product_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_relaxation_orders_manufacturer_id', 'relaxation_orders', 'manufacturers', ['manufacturer_id'], ['id'])
    op.create_foreign_key('fk_relaxation_orders_product_id', 'relaxation_orders', 'products', ['product_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_relaxation_orders_product_id', 'relaxation_orders', type_='foreignkey')
    op.drop_constraint('fk_relaxation_orders_manufacturer_id', 'relaxation_orders', type_='foreignkey')
    op.drop_column('relaxation_orders', 'product_id')
    op.drop_column('relaxation_orders', 'manufacturer_id')

    op.drop_constraint('fk_rules_commodity_category_id', 'rules', type_='foreignkey')
    op.drop_column('rules', 'check_type')
    op.drop_column('rules', 'commodity_category_id')
    op.drop_column('rules', 'has_transitional_clause')
    op.drop_column('rules', 'effective_to')
    op.drop_column('rules', 'effective_from')
    op.drop_index(op.f('ix_rules_rule_family'), table_name='rules')
    op.drop_column('rules', 'rule_family')

    check_type_enum = postgresql.ENUM(name='rule_check_type_enum')
    check_type_enum.drop(op.get_bind(), checkfirst=True)

    op.drop_constraint('fk_scans_commodity_category_id', 'scans', type_='foreignkey')
    op.drop_column('scans', 'commodity_category_id')

    op.drop_constraint('fk_products_commodity_category_id', 'products', type_='foreignkey')
    op.drop_column('products', 'commodity_category_id')

    op.drop_index(op.f('ix_commodity_categories_name'), table_name='commodity_categories')
    op.drop_index(op.f('ix_commodity_categories_id'), table_name='commodity_categories')
    op.drop_table('commodity_categories')
