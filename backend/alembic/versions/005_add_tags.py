"""add tags and document_tags

Revision ID: 005
Revises: 004
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("idx_tags_user", "tags", ["user_id"])
    op.create_index("uq_tags_user_name", "tags", ["user_id", "name"], unique=True)

    op.create_table(
        "document_tags",
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", sa.Uuid(), sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("document_tags")
    op.drop_index("uq_tags_user_name", table_name="tags")
    op.drop_index("idx_tags_user", table_name="tags")
    op.drop_table("tags")
