"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-06-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("display_name", sa.String(100)),
        sa.Column("cognito_id", sa.String(255), unique=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("parent_id", sa.Uuid(), sa.ForeignKey("categories.id")),
        sa.Column("icon", sa.String(50)),
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", sa.Uuid(), sa.ForeignKey("categories.id", ondelete="SET NULL")),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("brand", sa.String(100)),
        sa.Column("model", sa.String(100)),
        sa.Column("document_type", sa.String(50)),
        sa.Column("raw_text", sa.Text()),
        sa.Column("s3_key_original", sa.String(500), nullable=False),
        sa.Column("s3_key_thumbnail", sa.String(500)),
        sa.Column("file_size", sa.Integer()),
        sa.Column("page_count", sa.Integer(), server_default="1"),
        sa.Column("ocr_confidence", sa.Float()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("idx_documents_user", "documents", ["user_id"])
    op.create_index("idx_documents_category", "documents", ["category_id"])

    op.create_table(
        "doc_chunks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("chunk_text", sa.Text(), nullable=False),
        sa.Column("section_title", sa.String(255)),
        sa.Column("embedding", Vector(1536)),
    )
    op.create_index("idx_chunks_document", "doc_chunks", ["document_id"])

    op.create_table(
        "warranties",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("purchase_date", sa.Date()),
        sa.Column("expiry_date", sa.Date()),
        sa.Column("notes", sa.Text()),
    )


def downgrade() -> None:
    op.drop_table("warranties")
    op.drop_table("doc_chunks")
    op.drop_table("documents")
    op.drop_table("categories")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS vector")
