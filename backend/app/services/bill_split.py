"""Equal split of a confirmed bill among housemates, in integer cents.

A split is previewed (nothing written) and then saved as an append-only row bound to the confirmed
revision, the housemates and the shares the owner reviewed. A saved split is never recalculated.
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import BillRevision, BillSplit, Document, Housemate
from app.schemas.bill_split import (
    BillShare,
    BillSplitOut,
    BillSplitPreview,
    BillSplitRequest,
    BillSplitSave,
)
from app.schemas.document import BillRevisionOut
from app.services.bill_revisions import from_cents, latest_revision, to_cents


def split_equally(total_cents: int, count: int) -> list[int]:
    """Divide whole cents among `count` people; the first `total % count` people get one extra cent."""
    for value in (total_cents, count):
        if type(value) is not int:
            raise ValueError("Cents and the number of people must be integers.")
    if total_cents < 0:
        raise ValueError("The total cannot be negative.")
    if count < 2:
        raise ValueError("A split needs at least two people.")
    base, remainder = divmod(total_cents, count)
    return [base + (1 if index < remainder else 0) for index in range(count)]


class BillSplitConflict(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


async def _conflict(db: AsyncSession, code: str, message: str) -> BillSplitConflict:
    await db.rollback()
    return BillSplitConflict(code, message)


def _shares_out(shares: list[dict]) -> list[BillShare]:
    return [
        BillShare(housemate_id=share["housemate_id"], label=share["label"], amount=from_cents(share["cents"]))
        for share in shares
    ]


async def _current_split_number(db: AsyncSession, document_id: uuid.UUID) -> int:
    query = select(func.coalesce(func.max(BillSplit.split_number), 0)).where(BillSplit.document_id == document_id)
    return (await db.execute(query)).scalar_one()


async def latest_split(db: AsyncSession, document_id: uuid.UUID) -> BillSplitOut | None:
    row = (
        await db.execute(
            select(BillSplit)
            .where(BillSplit.document_id == document_id)
            .order_by(BillSplit.split_number.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    used = (await db.execute(select(BillRevision).where(BillRevision.id == row.bill_revision_id))).scalar_one()
    newest = await latest_revision(db, document_id)
    return _to_out(row, used.revision_number, stale=newest is None or newest.id != row.bill_revision_id)


def _to_out(row: BillSplit, revision_number: int, stale: bool) -> BillSplitOut:
    return BillSplitOut(
        id=row.id,
        document_id=row.document_id,
        split_number=row.split_number,
        stale=stale,
        created_at=row.created_at,
        bill_revision=revision_number,
        rule=row.rule,
        total=from_cents(row.total_cents),
        remainder_cents=row.total_cents % len(row.shares),
        shares=_shares_out(row.shares),
    )


async def _compute(
    db: AsyncSession, doc: Document, user_id: uuid.UUID, request: BillSplitRequest
) -> tuple[BillRevisionOut, int, list[dict]]:
    revision = await latest_revision(db, doc.id)
    if revision is None:
        raise await _conflict(db, "no_confirmed_bill", "Confirm the bill before splitting it.")
    if revision.revision_number != request.bill_revision:
        raise await _conflict(db, "revision_changed", "The confirmed bill changed while you were splitting it.")

    rows = (
        await db.execute(
            select(Housemate).where(Housemate.user_id == user_id, Housemate.id.in_(request.housemate_ids))
        )
    ).scalars()
    by_id = {row.id: row for row in rows}
    if any(housemate_id not in by_id for housemate_id in request.housemate_ids):
        raise await _conflict(db, "unknown_housemate", "A selected housemate is not in your list.")

    total = to_cents(revision.amount_due)
    cents = split_equally(total, len(request.housemate_ids))
    if sum(cents) != total:
        raise RuntimeError("The shares do not add up to the confirmed total.")
    shares = [
        {"housemate_id": str(housemate_id), "label": by_id[housemate_id].label, "cents": amount}
        for housemate_id, amount in zip(request.housemate_ids, cents)
    ]
    return revision, total, shares


async def preview_split(
    db: AsyncSession, doc: Document, user_id: uuid.UUID, request: BillSplitRequest
) -> BillSplitPreview:
    revision, total, shares = await _compute(db, doc, user_id, request)
    return BillSplitPreview(
        bill_revision=revision.revision_number,
        rule="equal",
        total=from_cents(total),
        remainder_cents=total % len(shares),
        shares=_shares_out(shares),
    )


async def save_split(db: AsyncSession, doc: Document, user_id: uuid.UUID, request: BillSplitSave) -> BillSplitOut:
    # Lock the document row so a concurrent confirmation or split waits for this one.
    locked = (
        await db.execute(
            select(Document).where(Document.id == doc.id).with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one()

    revision = await latest_revision(db, locked.id)
    if revision is None:
        raise await _conflict(db, "no_confirmed_bill", "Confirm the bill before splitting it.")
    if revision.revision_number != request.bill_revision:
        raise await _conflict(db, "revision_changed", "The confirmed bill changed while you were splitting it.")
    if await _current_split_number(db, locked.id) != request.base_split:
        raise await _conflict(db, "split_changed", "Another split was saved while you were reviewing.")

    revision, total, shares = await _compute(db, locked, user_id, request)
    if _shares_out(shares) != request.reviewed:
        raise await _conflict(db, "shares_changed", "The shares no longer match what you reviewed.")

    row = BillSplit(
        document_id=locked.id,
        bill_revision_id=revision.id,
        split_number=request.base_split + 1,
        rule="equal",
        total_cents=total,
        shares=shares,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        # Backstop for the lock: the split number was taken by another save.
        raise await _conflict(db, "split_changed", "Another split was saved while you were reviewing.")
    await db.refresh(row)
    out = _to_out(row, revision.revision_number, stale=False)
    await db.commit()
    return out
