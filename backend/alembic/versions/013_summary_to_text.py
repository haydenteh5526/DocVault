"""change summary column to text for rich structured summaries

Revision ID: 013
Revises: 012
Create Date: 2026-07-14
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("documents", "summary", type_=sa.Text(), existing_type=sa.String(500))


def downgrade() -> None:
    op.alter_column("documents", "summary", type_=sa.String(500), existing_type=sa.Text())
