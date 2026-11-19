"""Equal or by-days split of a confirmed bill among housemates, in integer cents.

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
from app.services.locking import lock_document


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


def _check_days(total_cents: int, days: list[int]) -> None:
    if type(total_cents) is not int or any(type(day) is not int for day in days):
        raise ValueError("Cents and days must be integers.")
    if total_cents < 0:
        raise ValueError("The total cannot be negative.")
    if len(days) < 2:
        raise ValueError("A split needs at least two people.")
    if any(day < 0 for day in days):
        raise ValueError("Days at home cannot be negative.")
    if not any(days):
        raise ValueError("At least one person must have been at home.")


def leftover_cents(total_cents: int, days: list[int]) -> int:
    """Whole cents left once everyone has the cents below their exact share (fewer than the people)."""
    _check_days(total_cents, days)
    all_days = sum(days)
    return total_cents - sum(total_cents * day // all_days for day in days)


def split_by_days(total_cents: int, days: list[int]) -> list[int]:
    """Divide whole cents in proportion to days at home, using integer arithmetic only.

    Everyone gets the whole cents below their exact share (total x days / all days). The leftover cents
    go one each to the people with the largest fractional remainder; ties go to the earlier person in the
    list. With equal days this gives the same result as `split_equally`.
    """
    _check_days(total_cents, days)
    all_days = sum(days)
    shares = [total_cents * day // all_days for day in days]
    remainders = [total_cents * day % all_days for day in days]
    leftover = total_cents - sum(shares)
    # A stable sort on the negated remainder keeps list order among ties.
    for index in sorted(range(len(days)), key=lambda i: -remainders[i])[:leftover]:
        shares[index] += 1
    return shares


class BillSplitInputError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


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
        BillShare(
            housemate_id=share["housemate_id"], label=share["label"],
            amount=from_cents(share["cents"]), days_home=share.get("days_home"),
        )
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
    return _to_out(row, used, stale=newest is None or newest.id != row.bill_revision_id)


def _period_days(revision: BillRevision | BillRevisionOut) -> int:
    return (revision.billing_period_end - revision.billing_period_start).days + 1


def _remainder(total: int, shares: list[dict], rule: str) -> int:
    if rule == "days_home":
        return leftover_cents(total, [share["days_home"] for share in shares])
    return total % len(shares)


def _to_out(row: BillSplit, revision: BillRevision | BillRevisionOut, stale: bool) -> BillSplitOut:
    return BillSplitOut(
        id=row.id,
        document_id=row.document_id,
        split_number=row.split_number,
        stale=stale,
        created_at=row.created_at,
        bill_revision=revision.revision_number,
        period_days=_period_days(revision),
        rule=row.rule,
        total=from_cents(row.total_cents),
        remainder_cents=_remainder(row.total_cents, row.shares, row.rule),
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
    days = request.days_home
    if days is None:
        cents = split_equally(total, len(request.housemate_ids))
    else:
        period = _period_days(revision)
        if any(day < 0 or day > period for day in days):
            raise BillSplitInputError("days_out_of_range", f"Enter days at home from 0 to {period} for this billing period.")
        if not any(days):
            raise BillSplitInputError("no_days_at_home", "At least one person must have been at home.")
        cents = split_by_days(total, days)
    if sum(cents) != total:
        raise RuntimeError("The shares do not add up to the confirmed total.")
    shares = [
        {"housemate_id": str(housemate_id), "label": by_id[housemate_id].label, "cents": amount}
        for housemate_id, amount in zip(request.housemate_ids, cents)
    ]
    if days is not None:
        for share, day in zip(shares, days):
            share["days_home"] = day
    return revision, total, shares


async def preview_split(
    db: AsyncSession, doc: Document, user_id: uuid.UUID, request: BillSplitRequest
) -> BillSplitPreview:
    revision, total, shares = await _compute(db, doc, user_id, request)
    return BillSplitPreview(
        bill_revision=revision.revision_number,
        rule=request.rule,
        total=from_cents(total),
        remainder_cents=_remainder(total, shares, request.rule),
        period_days=_period_days(revision),
        shares=_shares_out(shares),
    )


async def save_split(db: AsyncSession, doc: Document, user_id: uuid.UUID, request: BillSplitSave) -> BillSplitOut:
    # Lock the document row so a concurrent confirmation or split waits for this one.
    locked = await lock_document(db, doc.id)

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
        rule=request.rule,
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
    out = _to_out(row, revision, stale=False)
    await db.commit()
    return out
