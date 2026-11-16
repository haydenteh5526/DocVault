"""Owner-approved bill reminders: propose, approve once, cancel, and an append-only history.

A proposal is built by the server from the owner's confirmed revision and current saved split and is
stored as an immutable snapshot. Approval is bound to the details the owner reviewed and is checked in
the transaction that saves the reminder, under the document row lock. Nothing is delivered anywhere.
"""
import uuid
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Document, Reminder, ReminderEvent, ReminderProposal
from app.schemas.bill_split import BillSplitOut
from app.schemas.document import BillRevisionOut
from app.schemas.reminder import (
    ReminderApproval,
    ReminderDetails,
    ReminderEventOut,
    ReminderOut,
    ReminderProposalOut,
    ReminderProposalRequest,
    ReminderSplit,
)
from app.services.bill_revisions import latest_revision
from app.services.bill_split import latest_split

STALE_MESSAGE = "The bill or its split changed after this was proposed."


class ReminderConflict(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class ReminderNotFound(Exception):
    pass


async def _conflict(db: AsyncSession, code: str, message: str) -> ReminderConflict:
    await db.rollback()
    return ReminderConflict(code, message)


async def _lock_document(db: AsyncSession, doc: Document) -> Document:
    # Lock the document row so a concurrent confirmation, split, proposal, approval or cancellation waits.
    return (
        await db.execute(
            select(Document).where(Document.id == doc.id).with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _current_inputs(
    db: AsyncSession, document_id: uuid.UUID
) -> tuple[BillRevisionOut | None, BillSplitOut | None]:
    revision = await latest_revision(db, document_id)
    split = await latest_split(db, document_id)
    return revision, (split if split is not None and not split.stale else None)


async def _current_proposal_number(db: AsyncSession, document_id: uuid.UUID) -> int:
    query = select(func.coalesce(func.max(ReminderProposal.proposal_number), 0)).where(
        ReminderProposal.document_id == document_id
    )
    return (await db.execute(query)).scalar_one()


def _changed(row: ReminderProposal, revision: BillRevisionOut | None, split: BillSplitOut | None) -> str | None:
    if revision is None or revision.id != row.bill_revision_id:
        return "revision_changed"
    if (split.id if split else None) != row.bill_split_id:
        return "split_changed"
    return None


async def _append_event(db: AsyncSession, proposal_id: uuid.UUID, event: str, detail: dict) -> None:
    highest = (
        await db.execute(
            select(func.coalesce(func.max(ReminderEvent.sequence), 0)).where(ReminderEvent.proposal_id == proposal_id)
        )
    ).scalar_one()
    db.add(ReminderEvent(proposal_id=proposal_id, sequence=highest + 1, event=event, detail=detail))
    await db.flush()


async def _build(db: AsyncSession, rows: list[ReminderProposal]) -> list[ReminderProposalOut]:
    if not rows:
        return []
    revision, split = await _current_inputs(db, rows[0].document_id)
    ids = [row.id for row in rows]
    reminders = {
        reminder.proposal_id: reminder
        for reminder in (await db.execute(select(Reminder).where(Reminder.proposal_id.in_(ids)))).scalars()
    }
    events: dict[uuid.UUID, list[ReminderEvent]] = {row.id: [] for row in rows}
    query = select(ReminderEvent).where(ReminderEvent.proposal_id.in_(ids)).order_by(ReminderEvent.sequence)
    for event in (await db.execute(query)).scalars():
        events[event.proposal_id].append(event)

    out = []
    for row in rows:
        if row.status == "stale":
            inputs_changed = row.status_reason
        elif row.status in ("pending", "saved"):
            inputs_changed = _changed(row, revision, split)
        else:
            inputs_changed = None
        status = "stale" if row.status == "pending" and inputs_changed else row.status
        reminder = reminders.get(row.id)
        out.append(
            ReminderProposalOut(
                id=row.id,
                document_id=row.document_id,
                proposal_number=row.proposal_number,
                action=row.action,
                source=row.source,
                status=status,
                inputs_changed=inputs_changed,
                details=ReminderDetails.model_validate(row.details),
                reminder=(
                    ReminderOut(
                        id=reminder.id,
                        proposal_id=reminder.proposal_id,
                        remind_on=reminder.remind_on,
                        created_at=reminder.created_at,
                    )
                    if reminder
                    else None
                ),
                history=[
                    ReminderEventOut(
                        sequence=event.sequence, event=event.event, detail=event.detail, created_at=event.created_at
                    )
                    for event in events[row.id]
                ],
                created_at=row.created_at,
                decided_at=row.decided_at,
            )
        )
    return out


async def list_proposals(db: AsyncSession, document_id: uuid.UUID) -> list[ReminderProposalOut]:
    rows = (
        (
            await db.execute(
                select(ReminderProposal)
                .where(ReminderProposal.document_id == document_id)
                .order_by(ReminderProposal.proposal_number.desc())
            )
        )
        .scalars()
        .all()
    )
    return await _build(db, list(rows))


async def _one(db: AsyncSession, proposal_id: uuid.UUID) -> ReminderProposalOut:
    # Reload by id: the row may have been expired by a commit or rollback.
    fresh = (await db.execute(select(ReminderProposal).where(ReminderProposal.id == proposal_id))).scalar_one()
    return (await _build(db, [fresh]))[0]


async def propose_reminder(
    db: AsyncSession,
    doc: Document,
    user_id: uuid.UUID,
    request: ReminderProposalRequest,
    source: Literal["owner", "assistant"],
) -> ReminderProposalOut:
    locked = await _lock_document(db, doc)

    revision, split = await _current_inputs(db, locked.id)
    if revision is None:
        raise await _conflict(db, "no_confirmed_bill", "Confirm the bill before proposing a reminder.")
    if revision.revision_number != request.bill_revision:
        raise await _conflict(db, "revision_changed", "The confirmed bill changed while you were setting the reminder.")
    if (split.split_number if split else 0) != request.bill_split:
        raise await _conflict(db, "split_changed", "The saved split changed while you were setting the reminder.")
    if await _current_proposal_number(db, locked.id) != request.base_proposal:
        raise await _conflict(db, "proposal_changed", "Another proposal was made while you were setting the reminder.")

    latest = (
        await db.execute(
            select(ReminderProposal)
            .where(ReminderProposal.document_id == locked.id)
            .order_by(ReminderProposal.proposal_number.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest is not None and latest.status == "pending":
        reason = _changed(latest, revision, split)
        if reason is None:
            raise await _conflict(db, "proposal_pending", "A proposal is already waiting for your decision.")
        latest.status = "stale"
        latest.status_reason = reason
        latest.decided_at = datetime.utcnow()
        await _append_event(db, latest.id, "stale", {"reason": reason})

    details = ReminderDetails(
        bill_revision=revision.revision_number,
        amount_due=revision.amount_due,
        due_date=revision.due_date,
        billing_period_start=revision.billing_period_start,
        billing_period_end=revision.billing_period_end,
        days_before_due=request.days_before_due,
        remind_on=revision.due_date - timedelta(days=request.days_before_due),
        split=(
            ReminderSplit(split_number=split.split_number, total=split.total, shares=split.shares) if split else None
        ),
    )
    dump = details.model_dump(mode="json")
    row = ReminderProposal(
        id=uuid.uuid4(),
        document_id=locked.id,
        user_id=user_id,
        proposal_number=request.base_proposal + 1,
        action=request.action,
        source=source,
        bill_revision_id=revision.id,
        bill_split_id=split.id if split else None,
        details=dump,
        status="pending",
    )
    row_id = row.id
    db.add(row)
    try:
        await db.flush()
        await _append_event(db, row_id, "proposed", dump)
    except IntegrityError:
        # Backstop for the lock: the proposal number was taken by another request.
        raise await _conflict(db, "proposal_changed", "Another proposal was made while you were setting the reminder.")
    await db.commit()
    return await _one(db, row_id)


async def _find(db: AsyncSession, doc: Document, user_id: uuid.UUID, proposal_id: uuid.UUID) -> ReminderProposal:
    row = (
        await db.execute(
            select(ReminderProposal).where(
                ReminderProposal.id == proposal_id,
                ReminderProposal.document_id == doc.id,
                ReminderProposal.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        await db.rollback()
        raise ReminderNotFound()
    return row


async def approve_proposal(
    db: AsyncSession, doc: Document, user_id: uuid.UUID, proposal_id: uuid.UUID, approval: ReminderApproval
) -> tuple[ReminderProposalOut, bool]:
    locked = await _lock_document(db, doc)
    row = await _find(db, locked, user_id, proposal_id)
    row_id = row.id

    if approval.reviewed != ReminderDetails.model_validate(row.details):
        raise await _conflict(db, "details_mismatch", "The proposal no longer matches what you reviewed.")
    if row.status == "saved":
        out = await _one(db, row_id)
        await db.rollback()
        return out, False
    if row.status == "cancelled":
        raise await _conflict(db, "proposal_cancelled", "This proposal was cancelled.")
    if row.status == "stale":
        raise await _conflict(db, "proposal_stale", STALE_MESSAGE)

    reason = _changed(row, *await _current_inputs(db, locked.id))
    if reason:
        row.status = "stale"
        row.status_reason = reason
        row.decided_at = datetime.utcnow()
        await _append_event(db, row_id, "stale", {"reason": reason})
        await db.commit()
        raise ReminderConflict("proposal_stale", STALE_MESSAGE)

    details = ReminderDetails.model_validate(row.details)
    reminder = Reminder(
        id=uuid.uuid4(),
        user_id=user_id,
        document_id=locked.id,
        proposal_id=row_id,
        remind_on=details.remind_on,
        details=row.details,
    )
    reminder_id = reminder.id
    try:
        db.add(reminder)
        await db.flush()
        row.status = "saved"
        row.decided_at = datetime.utcnow()
        await _append_event(db, row_id, "approved", {"reviewed": approval.reviewed.model_dump(mode="json")})
        await _append_event(
            db, row_id, "saved", {"reminder_id": str(reminder_id), "remind_on": details.remind_on.isoformat()}
        )
    except IntegrityError:
        # Backstop for the lock: this proposal already has a reminder. Return the recorded outcome.
        await db.rollback()
        out = await _one(db, row_id)
        await db.rollback()
        return out, False
    await db.commit()
    return await _one(db, row_id), True


async def cancel_proposal(
    db: AsyncSession, doc: Document, user_id: uuid.UUID, proposal_id: uuid.UUID
) -> ReminderProposalOut:
    locked = await _lock_document(db, doc)
    row = await _find(db, locked, user_id, proposal_id)
    row_id = row.id

    if row.status == "cancelled":
        out = await _one(db, row_id)
        await db.rollback()
        return out
    if row.status == "saved":
        raise await _conflict(db, "already_saved", "This reminder was already saved.")
    if row.status == "stale":
        raise await _conflict(db, "proposal_stale", STALE_MESSAGE)

    row.status = "cancelled"
    row.decided_at = datetime.utcnow()
    await _append_event(db, row_id, "cancelled", {})
    await db.commit()
    return await _one(db, row_id)
