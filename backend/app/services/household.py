"""An account's household preferences: typed fields only, one row per account."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import HouseholdPreferences
from app.schemas.household import HouseholdPreferencesIn, HouseholdPreferencesOut

DEFAULT_LEAD_DAYS = 3
DEFAULT_SPLIT_RULE = "equal"


def _to_out(row: HouseholdPreferences) -> HouseholdPreferencesOut:
    return HouseholdPreferencesOut(
        reminder_days_before_due=row.reminder_days_before_due,
        default_split_rule=row.default_split_rule,  # type: ignore[arg-type]
        routines_enabled=row.routines_enabled,
        saved=True,
    )


async def get_preferences_row(db: AsyncSession, user_id: uuid.UUID) -> HouseholdPreferences | None:
    return (
        await db.execute(select(HouseholdPreferences).where(HouseholdPreferences.user_id == user_id))
    ).scalar_one_or_none()


async def get_preferences(db: AsyncSession, user_id: uuid.UUID) -> HouseholdPreferencesOut:
    row = await get_preferences_row(db, user_id)
    if row is None:
        return HouseholdPreferencesOut(
            reminder_days_before_due=DEFAULT_LEAD_DAYS,
            default_split_rule=DEFAULT_SPLIT_RULE,
            routines_enabled=True,
            saved=False,
        )
    return _to_out(row)


async def save_preferences(
    db: AsyncSession, user_id: uuid.UUID, preferences: HouseholdPreferencesIn
) -> HouseholdPreferencesOut:
    values = preferences.model_dump()
    # An upsert, so two saves at once cannot collide on the primary key.
    statement = insert(HouseholdPreferences).values(user_id=user_id, **values)
    await db.execute(
        statement.on_conflict_do_update(
            index_elements=[HouseholdPreferences.user_id],
            # An ON CONFLICT update skips the column's onupdate, so the time is set here.
            set_={**values, "updated_at": func.now()},
        )
    )
    await db.commit()
    row = await get_preferences_row(db, user_id)
    assert row is not None
    await db.refresh(row)
    return _to_out(row)
