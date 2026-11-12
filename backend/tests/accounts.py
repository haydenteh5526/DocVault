"""Two-account helpers shared by tests that check ownership boundaries."""

import uuid

from sqlalchemy import select

from app.dependencies import async_session
from app.models.base import Document, User
from app.services.auth_service import hash_password


async def create_users_and_document(
    raw_text: str | None = None, processing_status: str = "complete"
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Create an owner, another account and one document owned by the owner."""
    owner = User(
        email=f"owner-{uuid.uuid4()}@example.com",
        hashed_password=hash_password("testing123"),
        is_verified=True,
    )
    other = User(
        email=f"other-{uuid.uuid4()}@example.com",
        hashed_password=hash_password("testing123"),
        is_verified=True,
    )
    async with async_session() as db:
        db.add_all([owner, other])
        await db.flush()
        document = Document(
            user_id=owner.id,
            title="Owner only",
            s3_key_original=f"users/{owner.id}/private.pdf",
            raw_text=raw_text,
            processing_status=processing_status,
        )
        db.add(document)
        await db.commit()
        return owner.id, other.id, document.id


async def delete_users(*user_ids) -> None:
    async with async_session() as db:
        for user_id in user_ids:
            user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
            if user:
                await db.delete(user)
        await db.commit()
