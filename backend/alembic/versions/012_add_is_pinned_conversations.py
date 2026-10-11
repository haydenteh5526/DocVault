"""add is_pinned to conversations

Revision ID: 012
Revises: 011
Create Date: 2026-07-14
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("is_pinned", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("conversations", "is_pinned")
