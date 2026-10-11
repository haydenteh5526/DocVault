"""add email verification fields

Revision ID: 003
Revises: 002
Create Date: 2026-06-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_verified", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("verification_token", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "verification_token")
    op.drop_column("users", "is_verified")
