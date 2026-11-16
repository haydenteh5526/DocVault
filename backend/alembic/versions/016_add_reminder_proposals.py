"""add reminder proposals, reminders and reminder events

Revision ID: 016
Revises: 015
Create Date: 2026-11-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reminder_proposals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("proposal_number", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column(
            "bill_revision_id", sa.Uuid(), sa.ForeignKey("bill_revisions.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("bill_split_id", sa.Uuid(), sa.ForeignKey("bill_splits.id", ondelete="CASCADE"), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("status_reason", sa.String(30), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("document_id", "proposal_number", name="uq_reminder_proposals_document_number"),
    )
    op.create_table(
        "reminders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "proposal_id", sa.Uuid(), sa.ForeignKey("reminder_proposals.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("remind_on", sa.Date(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("proposal_id", name="uq_reminders_proposal"),
    )
    op.create_table(
        "reminder_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "proposal_id", sa.Uuid(), sa.ForeignKey("reminder_proposals.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event", sa.String(20), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("proposal_id", "sequence", name="uq_reminder_events_proposal_sequence"),
    )


def downgrade() -> None:
    op.drop_table("reminder_events")
    op.drop_table("reminders")
    op.drop_table("reminder_proposals")
