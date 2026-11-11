"""Append-only, owner-confirmed bill revisions bound to the evidence the owner reviewed."""
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import BillRevision, Document
from app.schemas.document import BillConfirmation, BillReview, BillRevisionOut
from app.services.bill_review import extract_bill_review


def to_cents(amount: str) -> int:
    return int(Decimal(amount) * 100)


def from_cents(cents: int) -> str:
    return format(Decimal(cents) / 100, ".2f")


class BillReviewConflict(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _to_out(row: BillRevision) -> BillRevisionOut:
    return BillRevisionOut(
        id=row.id,
        document_id=row.document_id,
        revision_number=row.revision_number,
        amount_due=from_cents(row.amount_due_cents),
        due_date=row.due_date,
        billing_period_start=row.billing_period_start,
        billing_period_end=row.billing_period_end,
        evidence=BillReview.model_validate(row.evidence),
        created_at=row.created_at,
    )


async def latest_revision(db: AsyncSession, document_id: uuid.UUID) -> BillRevisionOut | None:
    query = (
        select(BillRevision)
        .where(BillRevision.document_id == document_id)
        .order_by(BillRevision.revision_number.desc())
        .limit(1)
    )
    row = (await db.execute(query)).scalar_one_or_none()
    return _to_out(row) if row else None


async def _current_revision_number(db: AsyncSession, document_id: uuid.UUID) -> int:
    query = select(func.coalesce(func.max(BillRevision.revision_number), 0)).where(
        BillRevision.document_id == document_id
    )
    return (await db.execute(query)).scalar_one()


async def _conflict(db: AsyncSession, code: str, message: str) -> BillReviewConflict:
    await db.rollback()
    return BillReviewConflict(code, message)


async def save_revision(db: AsyncSession, doc: Document, confirmation: BillConfirmation) -> BillRevisionOut:
    # Lock the document row so a concurrent confirmation or transcript edit waits for this one.
    locked = (
        await db.execute(
            select(Document).where(Document.id == doc.id).with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one()

    review = extract_bill_review(locked.raw_text) if locked.processing_status == "complete" else None
    if review is None:
        raise await _conflict(db, "no_bill_review", "This document no longer produces a bill review.")
    if await _current_revision_number(db, locked.id) != confirmation.base_revision:
        raise await _conflict(db, "revision_changed", "Another confirmation was saved while you were reviewing.")
    if review != confirmation.reviewed:
        raise await _conflict(db, "transcript_changed", "The bill text changed while you were reviewing.")

    row = BillRevision(
        document_id=locked.id,
        revision_number=confirmation.base_revision + 1,
        amount_due_cents=to_cents(confirmation.amount_due),
        due_date=confirmation.due_date,
        billing_period_start=confirmation.billing_period_start,
        billing_period_end=confirmation.billing_period_end,
        evidence=review.model_dump(),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        # Backstop for the lock: the revision number was taken by another save.
        raise await _conflict(db, "revision_changed", "Another confirmation was saved while you were reviewing.")
    await db.refresh(row)
    out = _to_out(row)
    await db.commit()
    return out
