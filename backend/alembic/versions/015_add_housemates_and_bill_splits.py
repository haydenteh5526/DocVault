"""add housemates and bill splits

Revision ID: 015
Revises: 014
Create Date: 2026-11-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "housemates",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(40), nullable=False),
        sa.Column("label_key", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "label_key", name="uq_housemates_user_label_key"),
    )
    op.create_table(
        "bill_splits",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "bill_revision_id", sa.Uuid(), sa.ForeignKey("bill_revisions.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("split_number", sa.Integer(), nullable=False),
        sa.Column("rule", sa.String(20), nullable=False),
        sa.Column("total_cents", sa.Integer(), nullable=False),
        sa.Column("shares", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("document_id", "split_number", name="uq_bill_splits_document_split"),
    )


def downgrade() -> None:
    op.drop_table("bill_splits")
    op.drop_table("housemates")
