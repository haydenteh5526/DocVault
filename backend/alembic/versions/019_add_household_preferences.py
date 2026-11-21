"""add household preferences

Revision ID: 019
Revises: 018
Create Date: 2026-11-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "household_preferences",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("reminder_days_before_due", sa.Integer(), nullable=False, server_default=sa.text("3")),
        sa.Column("default_split_rule", sa.String(20), nullable=False, server_default="equal"),
        sa.Column("routines_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.CheckConstraint(
            "reminder_days_before_due >= 0 AND reminder_days_before_due <= 60",
            name="ck_household_preferences_lead_days",
        ),
        sa.CheckConstraint(
            "default_split_rule IN ('equal', 'days_home')", name="ck_household_preferences_split_rule"
        ),
    )


def downgrade() -> None:
    op.drop_table("household_preferences")
