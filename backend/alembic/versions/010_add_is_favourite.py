"""add is_favourite to documents

Revision ID: 010
Revises: 009
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("is_favourite", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("documents", "is_favourite")
