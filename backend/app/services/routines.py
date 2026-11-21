"""DocBot's daily check: propose a reminder for each confirmed bill that is due soon.

The check only proposes. It calls the same `propose_reminder` service as the bill panel and the assistant,
with source "routine", so every proposal waits for the owner's approval of the exact details. Each
document is handled under its own `user_id`, and a proposal that fails for one bill never stops the rest.
"""
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.logging_config import get_logger
from app.models.base import BillRevision, Document, HouseholdPreferences, ReminderProposal, Warranty
from app.schemas.reminder import ReminderProposalRequest
from app.services.household import DEFAULT_LEAD_DAYS
from app.services.locking import DocumentGoneError
from app.services.reminders import ReminderConflict, current_request_numbers, propose_reminder

logger = get_logger("routines")

ROUTINE_WINDOW_DAYS = 14
WARRANTY_WINDOW_DAYS = 30
IRISH_TIME = "Europe/Dublin"


@dataclass(frozen=True)
class RoutineItem:
    document_id: uuid.UUID
    title: str
    outcome: Literal["proposed", "skipped"]
    reason: str | None  # "already_proposed", "past_due", "routines_off", "document_gone" or a ReminderConflict code
    proposal_number: int | None
    remind_on: date | None


@dataclass(frozen=True)
class RoutineReport:
    items: list[RoutineItem]
    # Document id, title and expiry date of warranties ending within 30 days (today included), soonest first.
    warranties_ending: list[tuple[uuid.UUID, str, date]]


def _in_scope(user_id: uuid.UUID | None):
    """Rows for one account, or for every account that has not switched the daily check off."""
    if user_id is not None:
        return Document.user_id == user_id
    return or_(HouseholdPreferences.user_id.is_(None), HouseholdPreferences.routines_enabled.is_(True))


def _skipped(document: Document, reason: str) -> RoutineItem:
    return RoutineItem(document.id, document.title, "skipped", reason, None, None)


async def _warranties_ending(db: AsyncSession, user_id: uuid.UUID | None, today: date):
    query = (
        select(Document.id, Document.title, Warranty.expiry_date)
        .select_from(Warranty)
        .join(Document, Document.id == Warranty.document_id)
        .outerjoin(HouseholdPreferences, HouseholdPreferences.user_id == Document.user_id)
        .where(_in_scope(user_id), Warranty.expiry_date >= today, Warranty.expiry_date <= today + timedelta(days=WARRANTY_WINDOW_DAYS))
        .order_by(Warranty.expiry_date, Document.title, Document.id)
    )
    return [(document_id, title, expiry) for document_id, title, expiry in (await db.execute(query)).all()]


async def run_bill_check(
    db: AsyncSession, *, user_id: uuid.UUID | None = None, today: date | None = None
) -> RoutineReport:
    """Propose reminders for bills due in the next 14 days. With `user_id`, only that account's documents."""
    today = today or datetime.now(ZoneInfo(IRISH_TIME)).date()
    latest = (
        select(BillRevision.document_id, func.max(BillRevision.revision_number).label("revision_number"))
        .group_by(BillRevision.document_id)
        .subquery()
    )
    query = (
        select(Document, BillRevision, HouseholdPreferences)
        .join(latest, latest.c.document_id == Document.id)
        .join(
            BillRevision,
            (BillRevision.document_id == latest.c.document_id)
            & (BillRevision.revision_number == latest.c.revision_number),
        )
        .outerjoin(HouseholdPreferences, HouseholdPreferences.user_id == Document.user_id)
        .where(_in_scope(user_id), BillRevision.due_date <= today + timedelta(days=ROUTINE_WINDOW_DAYS))
        .order_by(BillRevision.due_date, Document.title, Document.id)
    )
    candidates = [
        (document, revision, preferences) for document, revision, preferences in (await db.execute(query)).all()
    ]
    # A conflict rolls the session back, which would expire these rows; detached rows keep their values.
    db.expunge_all()

    items: list[RoutineItem] = []
    for document, revision, preferences in candidates:
        if preferences is not None and not preferences.routines_enabled:
            items.append(_skipped(document, "routines_off"))
            continue
        if revision.due_date < today:
            items.append(_skipped(document, "past_due"))
            continue
        # Read the numbers the request will carry first. A proposal made before this read is then seen by the
        # check below; one made after it fails the request's base proposal with "proposal_changed".
        numbers = await current_request_numbers(db, document.id)
        if numbers is None:
            continue
        already = await db.execute(
            select(exists().where(ReminderProposal.bill_revision_id == revision.id))
        )
        if already.scalar_one():
            items.append(_skipped(document, "already_proposed"))
            continue
        lead = preferences.reminder_days_before_due if preferences is not None else DEFAULT_LEAD_DAYS
        days_left = (revision.due_date - today).days
        # The request carries the revision this check looked at, so a bill re-confirmed meanwhile conflicts.
        request = ReminderProposalRequest(
            action="bill_reminder",
            days_before_due=min(lead, days_left),
            bill_revision=revision.revision_number,
            bill_split=numbers[1],
            base_proposal=numbers[2],
        )
        try:
            proposal = await propose_reminder(db, document, document.user_id, request, source="routine")
        except ReminderConflict as conflict:
            items.append(_skipped(document, conflict.code))
        except DocumentGoneError:
            items.append(_skipped(document, "document_gone"))
        else:
            items.append(
                RoutineItem(
                    document.id,
                    document.title,
                    "proposed",
                    None,
                    proposal.proposal_number,
                    proposal.details.remind_on,
                )
            )

    report = RoutineReport(items=items, warranties_ending=await _warranties_ending(db, user_id, today))
    logger.info(
        "Bill check for %s: %d proposed, %d skipped, %d warranties ending",
        "one account" if user_id else "all accounts",
        sum(item.outcome == "proposed" for item in items),
        sum(item.outcome == "skipped" for item in items),
        len(report.warranties_ending),
    )
    return report
