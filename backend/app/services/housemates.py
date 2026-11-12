"""An owner's saved housemate labels. A label is a name only; it is not linked to a user account."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Housemate, User
from app.schemas.bill_split import MAX_HOUSEMATES, HousemateOut


class HousemateConflict(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def label_key(label: str) -> str:
    return label.casefold()


def _to_out(row: Housemate) -> HousemateOut:
    return HousemateOut(id=row.id, label=row.label, position=row.position, created_at=row.created_at)


async def list_housemates(db: AsyncSession, user_id: uuid.UUID) -> list[HousemateOut]:
    rows = (
        await db.execute(select(Housemate).where(Housemate.user_id == user_id).order_by(Housemate.position))
    ).scalars()
    return [_to_out(row) for row in rows]


async def _conflict(db: AsyncSession, code: str, message: str) -> HousemateConflict:
    await db.rollback()
    return HousemateConflict(code, message)


async def add_housemate(db: AsyncSession, user_id: uuid.UUID, label: str) -> HousemateOut:
    # Lock the caller's account row so the count and the next position are consistent.
    await db.execute(select(User.id).where(User.id == user_id).with_for_update())
    count, highest = (
        await db.execute(
            select(func.count(), func.coalesce(func.max(Housemate.position), 0)).where(Housemate.user_id == user_id)
        )
    ).one()
    if count >= MAX_HOUSEMATES:
        raise await _conflict(db, "too_many_housemates", f"You can save up to {MAX_HOUSEMATES} housemates.")
    key = label_key(label)
    taken = (
        await db.execute(select(Housemate.id).where(Housemate.user_id == user_id, Housemate.label_key == key))
    ).first()
    if taken:
        raise await _conflict(db, "duplicate_label", "That name is already in your list.")
    row = Housemate(user_id=user_id, label=label, label_key=key, position=highest + 1)
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        raise await _conflict(db, "duplicate_label", "That name is already in your list.")
    await db.refresh(row)
    out = _to_out(row)
    await db.commit()
    return out


async def remove_housemate(db: AsyncSession, user_id: uuid.UUID, housemate_id: uuid.UUID) -> bool:
    row = (
        await db.execute(select(Housemate).where(Housemate.id == housemate_id, Housemate.user_id == user_id))
    ).scalar_one_or_none()
    if row is None:
        return False
    await db.delete(row)
    await db.commit()
    return True
