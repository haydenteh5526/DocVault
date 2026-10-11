"""add document_versions

Revision ID: 006
Revises: 005
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("idx_versions_document", "document_versions", ["document_id"])


def downgrade() -> None:
    op.drop_index("idx_versions_document", table_name="document_versions")
    op.drop_table("document_versions")
