"""add push_tokens

Revision ID: 008
Revises: 007
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String(255), nullable=False, unique=True),
        sa.Column("platform", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("idx_push_tokens_user", "push_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_push_tokens_user", table_name="push_tokens")
    op.drop_table("push_tokens")
