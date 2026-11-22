"""The owner's bills, their chat references, and resolving which one a message means."""
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import BillRevision, Document
from app.services.bill_review import extract_bill_review
from app.services.key_dates import reviews_bills

RECENT_DOCUMENTS = 50
MAX_BILLS = 10


@dataclass
class BillRef:
    ref: str
    document: Document
    title: str


async def owner_bills(db: AsyncSession, user_id: uuid.UUID) -> list[BillRef]:
    """Of the owner's 50 newest finished documents, those with a confirmed revision or bill candidates, newest first."""
    documents = (
        (
            await db.execute(
                select(Document)
                .where(Document.user_id == user_id, Document.processing_status == "complete")
                .order_by(Document.created_at.desc(), Document.id)
                .limit(RECENT_DOCUMENTS)
            )
        )
        .scalars()
        .all()
    )
    if not documents:
        return []
    confirmed = set(
        (
            await db.execute(
                select(BillRevision.document_id).where(BillRevision.document_id.in_([d.id for d in documents]))
            )
        ).scalars()
    )
    # The same rule as the bill page and the overview; a confirmed bill stays whatever its kind became.
    found = [
        d for d in documents
        if d.id in confirmed or (reviews_bills(d.document_type) and extract_bill_review(d.raw_text) is not None)
    ]
    return [BillRef(ref=f"bill-{n}", document=d, title=d.title) for n, d in enumerate(found[:MAX_BILLS], start=1)]


def resolve_bill(
    bills: list[BillRef], document_ref: str | None, scope_id: uuid.UUID | None, focus_id: uuid.UUID | None
) -> BillRef | None:
    """A reference that is not one of the owner's bills is never guessed at."""
    if document_ref is not None:
        return next((bill for bill in bills if bill.ref == document_ref), None)
    if scope_id is not None and not any(bill.document.id == scope_id for bill in bills):
        # The request is scoped to a document that is not one of the offered bills: never fall through to another.
        return None
    for wanted in (scope_id, focus_id):
        if wanted is not None:
            match = next((bill for bill in bills if bill.document.id == wanted), None)
            if match:
                return match
    return bills[0] if len(bills) == 1 else None
