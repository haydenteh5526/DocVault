"""Row locking shared by the services that save against a document."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Document


class DocumentGoneError(Exception):
    """The document was deleted while a save was waiting for its lock."""


async def lock_document(db: AsyncSession, document_id: uuid.UUID) -> Document:
    """Lock the document row so a concurrent save, edit or deletion waits for this one.

    If the row disappeared while this call waited for the lock, roll back and
    raise DocumentGoneError, which the API reports as "Document not found".
    """
    locked = (
        await db.execute(
            select(Document).where(Document.id == document_id).with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if locked is None:
        await db.rollback()
        raise DocumentGoneError(str(document_id))
    return locked
