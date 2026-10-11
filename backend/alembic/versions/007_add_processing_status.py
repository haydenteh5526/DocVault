"""add processing_status to documents

Revision ID: 007
Revises: 006
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Default existing rows to 'complete' so already-uploaded docs are unaffected
    op.add_column(
        "documents",
        sa.Column("processing_status", sa.String(20), server_default="complete", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("documents", "processing_status")
