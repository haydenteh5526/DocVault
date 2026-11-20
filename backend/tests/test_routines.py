"""Pip's daily check: which bills get a reminder proposal, how often, and for whom."""

import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.dependencies import async_session
from app.main import app
from app.models.base import Document, HouseholdPreferences, Reminder, ReminderProposal, Warranty
from app.services import routines
from app.services.auth_service import create_access_token
from app.services.reminders import ReminderConflict
from app.services.routines import run_bill_check
from tests.accounts import create_users_and_document, delete_users
from tests.test_reminders import BILL, FOUR, _body, _confirm, _housemates, _split

TODAY = date(2026, 11, 10)
BASE = "http://test"


def _headers(user_id):
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE)


async def _add_document(user_id, title="Gas bill") -> uuid.UUID:
    async with async_session() as db:
        document = Document(
            user_id=user_id,
            title=title,
            s3_key_original=f"users/{user_id}/{uuid.uuid4()}.pdf",
            raw_text=BILL,
            processing_status="complete",
        )
        db.add(document)
        await db.commit()
        return document.id


async def _save_preferences(user_id, days=3, rule="equal", enabled=True):
    async with async_session() as db:
        db.add(
            HouseholdPreferences(
                user_id=user_id, reminder_days_before_due=days, default_split_rule=rule, routines_enabled=enabled
            )
        )
        await db.commit()


async def _check(**kwargs):
    async with async_session() as db:
        return await run_bill_check(db, today=TODAY, **kwargs)


async def _proposals(document_id):
    async with async_session() as db:
        query = select(ReminderProposal).where(ReminderProposal.document_id == document_id)
        return (await db.execute(query.order_by(ReminderProposal.proposal_number))).scalars().all()


def _item(report, document_id):
    matches = [item for item in report.items if item.document_id == document_id]
    assert len(matches) <= 1
    return matches[0] if matches else None


@pytest.fixture
async def bill():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    yield owner_id, other_id, document_id
    await delete_users(owner_id, other_id)


async def _confirmed(owner_id, document_id, due_date="2026-11-23", base_revision=0):
    async with _client() as client:
        return await _confirm(client, document_id, owner_id, due_date=due_date, base_revision=base_revision)


@pytest.mark.asyncio
async def test_a_bill_due_soon_gets_a_pending_proposal_with_the_default_lead(bill):
    owner_id, _, document_id = bill
    await _confirmed(owner_id, document_id)

    report = await _check(user_id=owner_id)

    item = _item(report, document_id)
    assert (item.outcome, item.reason, item.proposal_number, item.remind_on) == (
        "proposed", None, 1, date(2026, 11, 20)
    )
    assert item.title == "Owner only"
    [proposal] = await _proposals(document_id)
    assert proposal.status == "pending"
    assert proposal.details["days_before_due"] == 3
    assert proposal.details["remind_on"] == "2026-11-20"
    # Pip proposes; it never saves.
    async with async_session() as db:
        assert (await db.execute(select(Reminder).where(Reminder.document_id == document_id))).first() is None


@pytest.mark.asyncio
async def test_routine_proposal_has_routine_source(bill):
    owner_id, _, document_id = bill
    await _confirmed(owner_id, document_id)
    await _check(user_id=owner_id)

    async with _client() as client:
        detail = (await client.get(f"/api/v1/documents/{document_id}", headers=_headers(owner_id))).json()
    [proposal] = detail["reminder_proposals"]
    assert proposal["source"] == "routine"
    assert proposal["status"] == "pending"
    assert proposal["history"][0]["event"] == "proposed"


@pytest.mark.asyncio
async def test_the_saved_lead_days_are_used(bill):
    owner_id, _, document_id = bill
    await _save_preferences(owner_id, days=5)
    await _confirmed(owner_id, document_id)

    await _check(user_id=owner_id)

    [proposal] = await _proposals(document_id)
    assert (proposal.details["days_before_due"], proposal.details["remind_on"]) == (5, "2026-11-18")


@pytest.mark.asyncio
async def test_routine_is_idempotent(bill):
    owner_id, _, document_id = bill
    await _confirmed(owner_id, document_id)

    first = await _check(user_id=owner_id)
    second = await _check(user_id=owner_id)

    assert _item(first, document_id).outcome == "proposed"
    again = _item(second, document_id)
    assert (again.outcome, again.reason, again.proposal_number) == ("skipped", "already_proposed", None)
    assert len(await _proposals(document_id)) == 1


@pytest.mark.asyncio
async def test_routine_respects_cancelled_proposal(bill):
    owner_id, _, document_id = bill
    await _confirmed(owner_id, document_id)
    await _check(user_id=owner_id)
    [proposal] = await _proposals(document_id)
    async with _client() as client:
        cancelled = await client.post(
            f"/api/v1/documents/{document_id}/reminder-proposals/{proposal.id}/cancel", headers=_headers(owner_id)
        )
        assert cancelled.status_code == 200

    report = await _check(user_id=owner_id)

    assert _item(report, document_id).reason == "already_proposed"
    assert len(await _proposals(document_id)) == 1


@pytest.mark.asyncio
async def test_routine_respects_a_saved_proposal(bill):
    owner_id, _, document_id = bill
    await _confirmed(owner_id, document_id)
    await _check(user_id=owner_id)
    [proposal] = await _proposals(document_id)
    async with _client() as client:
        approved = await client.post(
            f"/api/v1/documents/{document_id}/reminder-proposals/{proposal.id}/approve",
            headers=_headers(owner_id),
            json={"reviewed": proposal.details},
        )
        assert approved.status_code == 201

    report = await _check(user_id=owner_id)

    assert _item(report, document_id).reason == "already_proposed"
    assert len(await _proposals(document_id)) == 1


@pytest.mark.asyncio
async def test_routine_proposes_for_new_revision(bill):
    owner_id, _, document_id = bill
    await _confirmed(owner_id, document_id)
    await _check(user_id=owner_id)
    await _confirmed(owner_id, document_id, due_date="2026-11-24", base_revision=1)

    report = await _check(user_id=owner_id)

    item = _item(report, document_id)
    assert (item.outcome, item.proposal_number, item.remind_on) == ("proposed", 2, date(2026, 11, 21))
    first, second = await _proposals(document_id)
    assert (first.status, first.status_reason) == ("stale", "revision_changed")
    assert second.status == "pending"


@pytest.mark.asyncio
async def test_routine_includes_the_current_split(bill):
    owner_id, _, document_id = bill
    await _confirmed(owner_id, document_id)
    async with _client() as client:
        ids = await _housemates(client, owner_id, *FOUR)
        await _split(client, document_id, owner_id, ids)

    await _check(user_id=owner_id)

    [proposal] = await _proposals(document_id)
    assert proposal.details["split"]["split_number"] == 1
    assert len(proposal.details["split"]["shares"]) == 4
    assert proposal.bill_split_id is not None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "due, outcome, reason, days, remind_on",
    [
        ("2026-11-12", "proposed", None, 2, date(2026, 11, 10)),  # due in 2 days, preference 3: capped at 2
        ("2026-11-10", "proposed", None, 0, date(2026, 11, 10)),  # due today
        ("2026-11-13", "proposed", None, 3, date(2026, 11, 10)),  # exactly the preference
        ("2026-11-24", "proposed", None, 3, date(2026, 11, 21)),  # last day of the window (14 days)
        ("2026-11-09", "skipped", "past_due", None, None),  # due yesterday
    ],
)
async def test_routine_caps_lead_days(bill, due, outcome, reason, days, remind_on):
    owner_id, _, document_id = bill
    await _confirmed(owner_id, document_id, due_date=due)

    report = await _check(user_id=owner_id)

    item = _item(report, document_id)
    assert (item.outcome, item.reason, item.remind_on) == (outcome, reason, remind_on)
    proposals = await _proposals(document_id)
    if outcome == "proposed":
        assert proposals[0].details["days_before_due"] == days
    else:
        assert proposals == []


@pytest.mark.asyncio
async def test_a_bill_beyond_the_window_is_not_listed(bill):
    owner_id, _, document_id = bill
    await _confirmed(owner_id, document_id, due_date="2026-11-25")  # 15 days ahead

    report = await _check(user_id=owner_id)

    assert _item(report, document_id) is None
    assert await _proposals(document_id) == []


@pytest.mark.asyncio
async def test_an_unconfirmed_document_is_ignored(bill):
    owner_id, _, document_id = bill

    report = await _check(user_id=owner_id)

    assert _item(report, document_id) is None
    assert await _proposals(document_id) == []


@pytest.mark.asyncio
async def test_routine_survives_conflict(bill, monkeypatch):
    owner_id, _, first_id = bill
    second_id = await _add_document(owner_id, "Gas bill")
    await _confirmed(owner_id, first_id)
    await _confirmed(owner_id, second_id)

    real = routines.propose_reminder
    interfered = []

    async def propose_after_someone_else(db, doc, user_id, request, source):
        if not interfered:
            # Someone proposes from the bill panel between the check's read and its write.
            interfered.append(doc.id)
            async with _client() as client:
                response = await client.post(
                    f"/api/v1/documents/{doc.id}/reminder-proposals",
                    headers=_headers(owner_id),
                    json=_body(),
                )
                assert response.status_code == 201
        return await real(db, doc, user_id, request, source)

    monkeypatch.setattr(routines, "propose_reminder", propose_after_someone_else)

    report = await _check(user_id=owner_id)

    [hit] = interfered
    skipped = _item(report, hit)
    assert (skipped.outcome, skipped.reason) == ("skipped", "proposal_changed")
    other = second_id if hit == first_id else first_id
    assert _item(report, other).outcome == "proposed"
    # The panel's proposal stands and the check added nothing for that bill.
    [panel_proposal] = await _proposals(hit)
    assert panel_proposal.source == "owner"


@pytest.mark.asyncio
async def test_routine_records_a_conflict_code_and_continues(bill, monkeypatch):
    owner_id, _, first_id = bill
    second_id = await _add_document(owner_id, "Gas bill")
    await _confirmed(owner_id, first_id)
    await _confirmed(owner_id, second_id)
    real = routines.propose_reminder
    calls = []

    async def conflict_once(db, doc, user_id, request, source):
        calls.append(doc.id)
        if len(calls) == 1:
            raise ReminderConflict("split_changed", "The saved split changed while you were setting the reminder.")
        return await real(db, doc, user_id, request, source)

    monkeypatch.setattr(routines, "propose_reminder", conflict_once)

    report = await _check(user_id=owner_id)

    outcomes = sorted((item.outcome, item.reason) for item in report.items if item.document_id in (first_id, second_id))
    assert outcomes == [("proposed", None), ("skipped", "split_changed")]


@pytest.mark.asyncio
async def test_routine_respects_switch(bill):
    owner_id, other_id, owner_doc = bill
    other_doc = await _add_document(other_id, "Other bill")
    await _save_preferences(owner_id, enabled=False)
    await _confirmed(owner_id, owner_doc)
    async with _client() as client:
        await _confirm(client, other_doc, other_id)

    # The daily run skips an account whose switch is off, and still serves everyone else.
    everyone = await _check()
    assert _item(everyone, owner_doc) is None
    assert _item(everyone, other_doc).outcome == "proposed"
    assert await _proposals(owner_doc) == []

    # Asking for that account directly never proposes either.
    direct = await _check(user_id=owner_id)
    assert (_item(direct, owner_doc).outcome, _item(direct, owner_doc).reason) == ("skipped", "routines_off")
    assert await _proposals(owner_doc) == []


@pytest.mark.asyncio
async def test_an_account_with_no_preferences_row_is_included(bill):
    owner_id, _, document_id = bill
    await _confirmed(owner_id, document_id)

    report = await _check()

    assert _item(report, document_id).outcome == "proposed"


@pytest.mark.asyncio
async def test_check_now_is_owner_scoped(bill):
    owner_id, other_id, owner_doc = bill
    other_doc = await _add_document(other_id, "Other bill")
    await _confirmed(owner_id, owner_doc)
    async with _client() as client:
        await _confirm(client, other_doc, other_id)

    report = await _check(user_id=owner_id)

    assert {item.document_id for item in report.items} == {owner_doc}
    assert await _proposals(other_doc) == []


@pytest.mark.asyncio
async def test_routine_report_lists_warranties_ending(bill):
    owner_id, other_id, _ = bill
    soon = await _add_document(owner_id, "Washing machine")
    today_doc = await _add_document(owner_id, "Kettle")
    edge = await _add_document(owner_id, "Fridge")
    past = await _add_document(owner_id, "Old toaster")
    far = await _add_document(owner_id, "New sofa")
    others = await _add_document(other_id, "Other TV")
    async with async_session() as db:
        for document_id, expiry in (
            (soon, date(2026, 11, 25)),
            (today_doc, date(2026, 11, 10)),
            (edge, date(2026, 12, 10)),  # 30 days ahead
            (past, date(2026, 11, 9)),
            (far, date(2026, 12, 11)),  # 31 days ahead
            (others, date(2026, 11, 25)),
        ):
            db.add(Warranty(document_id=document_id, expiry_date=expiry))
        await db.commit()

    report = await _check(user_id=owner_id)

    assert report.warranties_ending == [
        (today_doc, "Kettle", date(2026, 11, 10)),
        (soon, "Washing machine", date(2026, 11, 25)),
        (edge, "Fridge", date(2026, 12, 10)),
    ]


@pytest.mark.asyncio
async def test_warranties_ignore_the_bill_window_and_other_accounts(bill):
    owner_id, other_id, _ = bill
    others = await _add_document(other_id, "Other TV")
    async with async_session() as db:
        db.add(Warranty(document_id=others, expiry_date=date(2026, 11, 25)))
        await db.commit()

    scoped = await _check(user_id=owner_id)

    assert scoped.warranties_ending == []


@pytest.mark.asyncio
async def test_today_defaults_to_the_irish_date(bill, monkeypatch):
    try:
        ZoneInfo("Europe/Dublin")
    except ZoneInfoNotFoundError:
        pytest.skip("no time zone data on this machine; CI and the API image have it")
    owner_id, _, document_id = bill
    seen = []

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            seen.append(tz)
            # 23:30 UTC on 9 June is already 10 June in Dublin (UTC+1).
            return datetime(2026, 6, 9, 23, 30, tzinfo=ZoneInfo("UTC")).astimezone(tz)

    monkeypatch.setattr(routines, "datetime", FrozenDateTime)
    await _confirmed(owner_id, document_id, due_date="2026-06-10")

    async with async_session() as db:
        report = await run_bill_check(db, user_id=owner_id)

    assert [str(tz) for tz in seen] == ["Europe/Dublin"]
    assert _item(report, document_id).remind_on == date(2026, 6, 10)
