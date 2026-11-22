"""add a token version that a password reset bumps, and when the verification link was sent

Revision ID: 020
Revises: 019
Create Date: 2026-11-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("verification_sent_at", sa.DateTime(), nullable=True))
    # Links already sent keep working for the full expiry window from now. The column holds naive UTC,
    # like the app's comparisons, so store UTC whatever the database server's time zone is.
    op.execute("UPDATE users SET verification_sent_at = timezone('utc', now()) WHERE verification_token IS NOT NULL")


def downgrade() -> None:
    op.drop_column("users", "verification_sent_at")
    op.drop_column("users", "token_version")
