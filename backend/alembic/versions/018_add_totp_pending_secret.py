"""add a pending two-factor secret that becomes active only after a correct code

Revision ID: 018
Revises: 017
Create Date: 2026-11-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_pending_secret", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "totp_pending_secret")
