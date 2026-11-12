"""add bill revisions

Revision ID: 014
Revises: 013
Create Date: 2026-11-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bill_revisions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("amount_due_cents", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("billing_period_start", sa.Date(), nullable=False),
        sa.Column("billing_period_end", sa.Date(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("document_id", "revision_number", name="uq_bill_revisions_document_revision"),
    )


def downgrade() -> None:
    op.drop_table("bill_revisions")
