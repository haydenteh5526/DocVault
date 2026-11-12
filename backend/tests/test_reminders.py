"""Approve and save a bill reminder exactly once: proposal, approval, cancellation and history."""

import asyncio
import copy
import uuid
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.dependencies import async_session
from app.main import app
from app.models.base import Document, Reminder, ReminderEvent, ReminderProposal
from app.schemas.reminder import ReminderProposalRequest
from app.services.auth_service import create_access_token
from app.services.reminders import propose_reminder
from tests.accounts import create_users_and_document, delete_users

BASE = "http://test"
BILL = ("Electricity bill\nTotal amount due: EUR 123.47\n"
        "Billing period: 1 October 2026 to 31 October 2026\nPayment due date: 23 November 2026")
VALUES = {"amount_due": "125.00", "due_date": "2026-11-23", "billing_period_start": "2026-10-01",
          "billing_period_end": "2026-10-31", "base_revision": 0}
FOUR = ("Aoife", "Ben", "Chidi", "Dara")
MISSING = object()


def _headers(user_id):
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE)


def _code(response):
    return response.json()["detail"]["code"]


async def _confirm(client, document_id, owner_id, amount="123.47", base_revision=0, due_date="2026-11-23"):
    detail = (await client.get(f"/api/v1/documents/{document_id}", headers=_headers(owner_id))).json()
    response = await client.post(
        f"/api/v1/documents/{document_id}/bill-revisions",
        headers=_headers(owner_id),
        json={**VALUES, "amount_due": amount, "due_date": due_date, "base_revision": base_revision,
              "reviewed": detail["bill_review"]},
    )
    assert response.status_code == 201
    return response.json()


async def _housemates(client, user_id, *labels):
    ids = []
    for label in labels:
        response = await client.post("/api/v1/housemates", headers=_headers(user_id), json={"label": label})
        assert response.status_code == 201
        ids.append(response.json()["id"])
    return ids


async def _split(client, document_id, user_id, ids, base_split=0, bill_revision=1):
    request = {"bill_revision": bill_revision, "rule": "equal", "housemate_ids": ids}
    preview = await client.post(
        f"/api/v1/documents/{document_id}/bill-splits/preview", headers=_headers(user_id), json=request
    )
    assert preview.status_code == 200
    response = await client.post(
        f"/api/v1/documents/{document_id}/bill-splits",
        headers=_headers(user_id),
        json={**request, "base_split": base_split, "reviewed": preview.json()["shares"]},
    )
    assert response.status_code == 201
    return response.json()


def _body(**overrides):
    body = {"action": "bill_reminder", "days_before_due": 2, "bill_revision": 1, "bill_split": 0, "base_proposal": 0}
    for key, value in overrides.items():
        if value is MISSING:
            body.pop(key, None)
        else:
            body[key] = value
    return body


async def _propose(client, document_id, user_id, **overrides):
    return await client.post(
        f"/api/v1/documents/{document_id}/reminder-proposals", headers=_headers(user_id), json=_body(**overrides)
    )


async def _get(client, document_id, user_id):
    return await client.get(f"/api/v1/documents/{document_id}", headers=_headers(user_id))


async def _rows(model, document_id):
    async with async_session() as db:
        if model is ReminderEvent:
            query = (
                select(ReminderEvent)
                .join(ReminderProposal, ReminderProposal.id == ReminderEvent.proposal_id)
                .where(ReminderProposal.document_id == document_id)
                .order_by(ReminderEvent.proposal_id, ReminderEvent.sequence)
            )
        else:
            query = select(model).where(model.document_id == document_id).order_by(model.created_at)
        return (await db.execute(query)).scalars().all()


@pytest.fixture
async def bill():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    yield owner_id, other_id, document_id
    await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_the_proposal_is_built_from_the_confirmed_bill(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id, "125.00")
        response = await _propose(client, document_id, owner_id)
        assert response.status_code == 201
        body = response.json()
        assert body["status"] == "pending"
        assert body["proposal_number"] == 1
        assert body["action"] == "bill_reminder"
        assert body["source"] == "owner"
        assert body["reminder"] is None
        assert body["inputs_changed"] is None
        assert body["details"] == {
            "bill_revision": 1, "amount_due": "125.00", "due_date": "2026-11-23",
            "billing_period_start": "2026-10-01", "billing_period_end": "2026-10-31",
            "days_before_due": 2, "remind_on": "2026-11-21", "split": None,
        }
        assert len(body["history"]) == 1
        assert body["history"][0]["event"] == "proposed"
        assert body["history"][0]["sequence"] == 1
        assert body["history"][0]["detail"] == body["details"]
        rows = await _rows(ReminderProposal, document_id)
        assert len(rows) == 1 and rows[0].bill_split_id is None
        assert await _rows(Reminder, document_id) == []
        detail = (await _get(client, document_id, owner_id)).json()
        assert detail["reminder_proposals"] == [body]


@pytest.mark.asyncio
async def test_the_current_split_is_included_with_its_shares(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id)
        ids = await _housemates(client, owner_id, *FOUR)
        split = await _split(client, document_id, owner_id, ids)
        response = await _propose(client, document_id, owner_id, bill_split=1)
        assert response.status_code == 201
        details = response.json()["details"]
        assert details["split"] == {"split_number": 1, "total": "123.47", "shares": split["shares"]}
        assert [share["amount"] for share in details["split"]["shares"]] == ["30.87", "30.87", "30.87", "30.86"]
        rows = await _rows(ReminderProposal, document_id)
        assert str(rows[0].bill_split_id) == split["id"]


@pytest.mark.asyncio
@pytest.mark.parametrize("sent_split, status", [(0, 201), (1, 409)])
async def test_a_stale_split_is_never_included(bill, sent_split, status):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id)
        ids = await _housemates(client, owner_id, *FOUR)
        await _split(client, document_id, owner_id, ids)
        await _confirm(client, document_id, owner_id, "126.50", base_revision=1)
        response = await _propose(client, document_id, owner_id, bill_revision=2, bill_split=sent_split)
        assert response.status_code == status
        if status == 201:
            assert response.json()["details"]["split"] is None
            assert response.json()["details"]["amount_due"] == "126.50"
        else:
            assert _code(response) == "split_changed"
            assert await _rows(ReminderProposal, document_id) == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "due, days, remind_on",
    [("2027-01-01", 2, "2026-12-30"), ("2028-03-01", 1, "2028-02-29"),
     ("2026-11-23", 0, "2026-11-23"), ("2026-11-23", 60, "2026-09-24")],
)
async def test_reminder_dates_at_boundaries(bill, due, days, remind_on):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id, due_date=due)
        response = await _propose(client, document_id, owner_id, days_before_due=days)
        assert response.status_code == 201
        assert response.json()["details"]["due_date"] == due
        assert response.json()["details"]["remind_on"] == remind_on


@pytest.mark.asyncio
async def test_a_reminder_date_in_the_past_is_accepted(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id, due_date="2020-01-10")
        response = await _propose(client, document_id, owner_id)
        assert response.status_code == 201
        assert response.json()["details"]["remind_on"] == "2020-01-08"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides",
    [
        {"days_before_due": MISSING}, {"days_before_due": None}, {"days_before_due": -1},
        {"days_before_due": 61}, {"days_before_due": 2.5}, {"days_before_due": "2"},
        {"days_before_due": True},
        {"action": MISSING}, {"action": "pay_bill"}, {"action": "send_email"}, {"action": "split_bill"},
        {"remind_on": "2026-11-01"}, {"amount_due": "1.00"}, {"status": "saved"}, {"source": "assistant"},
        {"bill_revision": 0}, {"bill_revision": MISSING},
        {"bill_split": -1}, {"bill_split": MISSING},
        {"base_proposal": -1}, {"base_proposal": MISSING},
    ],
)
async def test_missing_and_unverifiable_inputs_are_rejected(bill, overrides):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id)
        response = await _propose(client, document_id, owner_id, **overrides)
        assert response.status_code == 422
    assert await _rows(ReminderProposal, document_id) == []


@pytest.mark.asyncio
async def test_a_bill_without_a_confirmed_revision_cannot_have_a_reminder(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        response = await _propose(client, document_id, owner_id)
        assert response.status_code == 409
        assert _code(response) == "no_confirmed_bill"
        assert await _rows(ReminderProposal, document_id) == []
        assert (await _get(client, document_id, owner_id)).json()["reminder_proposals"] == []


@pytest.mark.asyncio
async def test_a_proposal_made_against_changed_inputs_is_rejected(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id)
        await _confirm(client, document_id, owner_id, "126.50", base_revision=1)
        response = await _propose(client, document_id, owner_id, bill_revision=1)
        assert response.status_code == 409
        assert _code(response) == "revision_changed"
        ids = await _housemates(client, owner_id, *FOUR)
        await _split(client, document_id, owner_id, ids, bill_revision=2)
        response = await _propose(client, document_id, owner_id, bill_revision=2, bill_split=0)
        assert response.status_code == 409
        assert _code(response) == "split_changed"
        assert (await _propose(client, document_id, owner_id, bill_revision=2, bill_split=1)).status_code == 201
        response = await _propose(client, document_id, owner_id, bill_revision=2, bill_split=1)
        assert response.status_code == 409
        assert _code(response) == "proposal_changed"
    assert len(await _rows(ReminderProposal, document_id)) == 1


@pytest.mark.asyncio
async def test_only_one_proposal_waits_at_a_time(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id)
        assert (await _propose(client, document_id, owner_id)).status_code == 201
        response = await _propose(client, document_id, owner_id, base_proposal=1)
        assert response.status_code == 409
        assert _code(response) == "proposal_pending"
    rows = await _rows(ReminderProposal, document_id)
    assert len(rows) == 1 and rows[0].status == "pending"


@pytest.mark.asyncio
async def test_a_new_proposal_retires_an_out_of_date_pending_one(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id)
        assert (await _propose(client, document_id, owner_id)).status_code == 201
        await _confirm(client, document_id, owner_id, "126.50", base_revision=1)
        detail = (await _get(client, document_id, owner_id)).json()
        first = detail["reminder_proposals"][0]
        assert first["status"] == "stale"
        assert first["inputs_changed"] == "revision_changed"
        assert (await _rows(ReminderProposal, document_id))[0].status == "pending"
        response = await _propose(client, document_id, owner_id, bill_revision=2, base_proposal=1)
        assert response.status_code == 201
        assert response.json()["proposal_number"] == 2
        rows = await _rows(ReminderProposal, document_id)
        assert rows[0].status == "stale"
        assert rows[0].status_reason == "revision_changed"
        assert rows[0].decided_at is not None
        events = [e for e in await _rows(ReminderEvent, document_id) if e.proposal_id == rows[0].id]
        assert events[-1].event == "stale" and events[-1].detail == {"reason": "revision_changed"}
        detail = (await _get(client, document_id, owner_id)).json()
        assert [p["proposal_number"] for p in detail["reminder_proposals"]] == [2, 1]


@pytest.mark.asyncio
async def test_concurrent_proposals_store_exactly_one(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id)
        responses = await asyncio.gather(
            _propose(client, document_id, owner_id), _propose(client, document_id, owner_id)
        )
        assert sorted(r.status_code for r in responses) == [201, 409]
        loser = next(r for r in responses if r.status_code == 409)
        assert _code(loser) in ("proposal_changed", "proposal_pending")
    assert len(await _rows(ReminderProposal, document_id)) == 1


@pytest.mark.asyncio
async def test_a_proposal_waits_for_the_document_lock(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id)
        async with async_session() as locker:
            await locker.execute(select(Document).where(Document.id == document_id).with_for_update())
            proposal = asyncio.create_task(_propose(client, document_id, owner_id))
            try:
                await asyncio.sleep(0.5)
                assert not proposal.done()
                await locker.commit()
            finally:
                if not proposal.done():
                    await locker.rollback()
                response = await proposal
        assert response.status_code == 201


@pytest.mark.asyncio
async def test_the_assistant_source_is_set_by_the_server(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id)
    async with async_session() as db:
        doc = await db.get(Document, document_id)
        out = await propose_reminder(
            db, doc, owner_id, ReminderProposalRequest(**_body()), source="assistant"
        )
    assert out.source == "assistant"
    assert out.status == "pending"
    assert await _rows(Reminder, document_id) == []


@pytest.mark.asyncio
async def test_another_account_cannot_propose_or_read_a_reminder(bill):
    owner_id, other_id, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id)
        response = await _propose(client, document_id, other_id)
        assert response.status_code == 404
        assert await _rows(ReminderProposal, document_id) == []
        assert (await _propose(client, document_id, owner_id)).status_code == 201
        assert (await _get(client, document_id, other_id)).status_code == 404


@pytest.mark.asyncio
async def test_proposals_reopen_while_the_document_is_reprocessed(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id)
        proposed = (await _propose(client, document_id, owner_id)).json()
        async with async_session() as db:
            await db.execute(update(Document).where(Document.id == document_id).values(processing_status="processing"))
            await db.commit()
        detail = (await _get(client, document_id, owner_id)).json()
        assert detail["bill_review"] is None
        assert detail["reminder_proposals"] == [proposed]



# --- Approve, cancel and the recorded outcome -----------------------------------------------


async def _approve(client, document_id, user_id, proposal, reviewed=None, proposal_id=None):
    return await client.post(
        f"/api/v1/documents/{document_id}/reminder-proposals/{proposal_id or proposal['id']}/approve",
        headers=_headers(user_id),
        json={"reviewed": reviewed or proposal["details"]},
    )


async def _cancel(client, document_id, user_id, proposal, proposal_id=None):
    return await client.post(
        f"/api/v1/documents/{document_id}/reminder-proposals/{proposal_id or proposal['id']}/cancel",
        headers=_headers(user_id),
    )


def _events(body):
    return [event["event"] for event in body["history"]]


async def _proposed(client, owner_id, document_id, with_split=False, amount="123.47", **overrides):
    await _confirm(client, document_id, owner_id, amount)
    if with_split:
        ids = await _housemates(client, owner_id, *FOUR)
        await _split(client, document_id, owner_id, ids)
        overrides.setdefault("bill_split", 1)
    response = await _propose(client, document_id, owner_id, **overrides)
    assert response.status_code == 201
    return response.json()


async def _stored(document_id, number=1):
    return next(row for row in await _rows(ReminderProposal, document_id) if row.proposal_number == number)


@pytest.mark.asyncio
async def test_owner_approves_the_exact_proposal_and_the_reminder_is_saved(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id, with_split=True)
        response = await _approve(client, document_id, owner_id, proposal)
        assert response.status_code == 201
        body = response.json()
        assert body["status"] == "saved"
        assert body["decided_at"] is not None
        assert body["reminder"]["remind_on"] == "2026-11-21"
        assert body["reminder"]["proposal_id"] == proposal["id"]
        assert body["details"] == proposal["details"]
        assert _events(body) == ["proposed", "approved", "saved"]
        assert body["history"][1]["detail"]["reviewed"] == body["details"]
        assert body["history"][2]["detail"]["reminder_id"] == body["reminder"]["id"]
        rows = await _rows(Reminder, document_id)
        assert len(rows) == 1
        assert rows[0].remind_on == date(2026, 11, 21)
        assert rows[0].user_id == owner_id
        assert rows[0].details == proposal["details"]
        detail = (await _get(client, document_id, owner_id)).json()
        assert detail["reminder_proposals"][0] == body


@pytest.mark.asyncio
async def test_a_repeated_approval_returns_the_recorded_outcome(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        first = await _approve(client, document_id, owner_id, proposal)
        again = await _approve(client, document_id, owner_id, proposal)
        assert (first.status_code, again.status_code) == (201, 200)
        assert again.json() == first.json()
    assert len(await _rows(Reminder, document_id)) == 1
    assert len(await _rows(ReminderEvent, document_id)) == 3


@pytest.mark.asyncio
async def test_concurrent_approvals_save_exactly_one_reminder(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        responses = await asyncio.gather(
            _approve(client, document_id, owner_id, proposal), _approve(client, document_id, owner_id, proposal)
        )
        assert sorted(r.status_code for r in responses) == [200, 201]
        assert responses[0].json() == responses[1].json()
    assert len(await _rows(Reminder, document_id)) == 1
    assert len(await _rows(ReminderEvent, document_id)) == 3


@pytest.mark.asyncio
async def test_a_duplicate_reminder_is_returned_not_saved_twice(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        first = (await _approve(client, document_id, owner_id, proposal)).json()
        async with async_session() as db:
            await db.execute(
                update(ReminderProposal).where(ReminderProposal.id == uuid.UUID(proposal["id"])).values(status="pending")
            )
            await db.commit()
        response = await _approve(client, document_id, owner_id, proposal)
        assert response.status_code == 200
        assert response.json()["reminder"]["id"] == first["reminder"]["id"]
    assert len(await _rows(Reminder, document_id)) == 1
    assert len(await _rows(ReminderEvent, document_id)) == 3


@pytest.mark.asyncio
async def test_cancellation_leaves_no_reminder(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        response = await _cancel(client, document_id, owner_id, proposal)
        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"
        assert _events(response.json()) == ["proposed", "cancelled"]
        again = await _cancel(client, document_id, owner_id, proposal)
        assert again.status_code == 200 and again.json() == response.json()
        assert len(again.json()["history"]) == 2
        approve = await _approve(client, document_id, owner_id, proposal)
        assert approve.status_code == 409
        assert _code(approve) == "proposal_cancelled"
    assert await _rows(Reminder, document_id) == []


@pytest.mark.asyncio
async def test_a_saved_reminder_cannot_be_cancelled(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        assert (await _approve(client, document_id, owner_id, proposal)).status_code == 201
        response = await _cancel(client, document_id, owner_id, proposal)
        assert response.status_code == 409
        assert _code(response) == "already_saved"
    assert (await _stored(document_id)).status == "saved"
    assert len(await _rows(Reminder, document_id)) == 1


@pytest.mark.asyncio
async def test_approve_and_cancel_together_leave_one_consistent_outcome(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        approve, cancel = await asyncio.gather(
            _approve(client, document_id, owner_id, proposal), _cancel(client, document_id, owner_id, proposal)
        )
    status = (await _stored(document_id)).status
    reminders = await _rows(Reminder, document_id)
    if (approve.status_code, cancel.status_code) == (201, 409):
        assert _code(cancel) == "already_saved"
    else:
        assert (approve.status_code, cancel.status_code) == (409, 200)
        assert _code(approve) == "proposal_cancelled"
    assert len(reminders) == (1 if status == "saved" else 0)
    assert status in ("saved", "cancelled")


@pytest.mark.asyncio
async def test_a_changed_bill_revision_makes_approval_stale(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        await _confirm(client, document_id, owner_id, "126.50", base_revision=1)
        response = await _approve(client, document_id, owner_id, proposal)
        assert response.status_code == 409
        assert _code(response) == "proposal_stale"
        assert await _rows(Reminder, document_id) == []
        row = await _stored(document_id)
        assert row.status == "stale" and row.status_reason == "revision_changed" and row.decided_at is not None
        body = (await _get(client, document_id, owner_id)).json()["reminder_proposals"][0]
        assert body["status"] == "stale"
        assert body["inputs_changed"] == "revision_changed"
        assert _events(body) == ["proposed", "stale"]
        assert body["details"]["amount_due"] == "123.47"
        again = await _approve(client, document_id, owner_id, proposal)
        assert again.status_code == 409 and _code(again) == "proposal_stale"
        cancel = await _cancel(client, document_id, owner_id, proposal)
        assert cancel.status_code == 409 and _code(cancel) == "proposal_stale"
    assert len(await _rows(ReminderEvent, document_id)) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("first_split_exists", [True, False])
async def test_a_changed_split_makes_approval_stale(bill, first_split_exists):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id, with_split=first_split_exists)
        if first_split_exists:
            ids = [share["housemate_id"] for share in proposal["details"]["split"]["shares"]]
            await _split(client, document_id, owner_id, ids[:3], base_split=1)
        else:
            ids = await _housemates(client, owner_id, *FOUR)
            await _split(client, document_id, owner_id, ids)
        response = await _approve(client, document_id, owner_id, proposal)
        assert response.status_code == 409
        assert _code(response) == "proposal_stale"
        body = (await _get(client, document_id, owner_id)).json()["reminder_proposals"][0]
        assert body["inputs_changed"] == "split_changed"
    assert await _rows(Reminder, document_id) == []


def _altered(details, how):
    changed = copy.deepcopy(details)
    if how == "remind_on":
        changed["remind_on"] = "2026-11-22"
    elif how == "amount_due":
        changed["amount_due"] = "1.00"
    elif how == "days_before_due":
        changed["days_before_due"] = 3
    elif how == "split_removed":
        changed["split"] = None
    elif how == "share_amount":
        changed["split"]["shares"][0]["amount"] = "30.88"
    return changed


@pytest.mark.asyncio
@pytest.mark.parametrize("how", ["remind_on", "amount_due", "days_before_due", "split_removed", "share_amount"])
async def test_details_that_differ_from_the_stored_proposal_are_rejected(bill, how):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id, with_split=True)
        altered = _altered(proposal["details"], how)
        response = await _approve(client, document_id, owner_id, proposal, reviewed=altered)
        assert response.status_code == 409
        assert _code(response) == "details_mismatch"
        assert await _rows(Reminder, document_id) == []
        row = await _stored(document_id)
        assert row.status == "pending"
        assert len(await _rows(ReminderEvent, document_id)) == 1
        assert (await _approve(client, document_id, owner_id, proposal)).status_code == 201
        response = await _approve(client, document_id, owner_id, proposal, reviewed=altered)
        assert response.status_code == 409 and _code(response) == "details_mismatch"
    assert len(await _rows(Reminder, document_id)) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["no_body", "reviewed_missing", "extra_field", "bad_date"])
async def test_invalid_approval_bodies_are_rejected(bill, kind):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        url = f"/api/v1/documents/{document_id}/reminder-proposals/{proposal['id']}/approve"
        kwargs = {}
        if kind == "reviewed_missing":
            kwargs = {"json": {}}
        elif kind == "extra_field":
            kwargs = {"json": {"reviewed": proposal["details"], "status": "saved"}}
        elif kind == "bad_date":
            kwargs = {"json": {"reviewed": {**proposal["details"], "remind_on": "not-a-date"}}}
        response = await client.post(url, headers=_headers(owner_id), **kwargs)
        assert response.status_code == 422
    assert await _rows(Reminder, document_id) == []


async def _second_document(user_id):
    async with async_session() as db:
        document = Document(
            user_id=user_id, title="Second", s3_key_original=f"users/{user_id}/second.pdf",
            raw_text=BILL, processing_status="complete",
        )
        db.add(document)
        await db.commit()
        return document.id


@pytest.mark.asyncio
async def test_a_proposal_from_elsewhere_is_not_found(bill):
    owner_id, other_id, document_id = bill
    other_document = await _second_document(other_id)
    owner_second = await _second_document(owner_id)
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        assert (await _approve(client, document_id, other_id, proposal)).status_code == 404
        assert (await _cancel(client, document_id, other_id, proposal)).status_code == 404
        assert (await _approve(client, other_document, other_id, proposal)).status_code == 404
        assert (await _approve(client, owner_second, owner_id, proposal)).status_code == 404
        assert (await _cancel(client, owner_second, owner_id, proposal)).status_code == 404
        random_id = str(uuid.uuid4())
        assert (await _approve(client, document_id, owner_id, proposal, proposal_id=random_id)).status_code == 404
        assert (await _cancel(client, document_id, owner_id, proposal, proposal_id=random_id)).status_code == 404
    assert await _rows(Reminder, document_id) == []
    assert (await _stored(document_id)).status == "pending"


@pytest.mark.asyncio
async def test_an_approval_waits_for_the_document_lock(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        async with async_session() as locker:
            await locker.execute(select(Document).where(Document.id == document_id).with_for_update())
            approval = asyncio.create_task(_approve(client, document_id, owner_id, proposal))
            try:
                await asyncio.sleep(0.5)
                assert not approval.done()
                await locker.commit()
            finally:
                if not approval.done():
                    await locker.rollback()
                response = await approval
        assert response.status_code == 201


@pytest.mark.asyncio
async def test_a_saved_reminder_keeps_its_values_when_the_bill_changes(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        assert (await _approve(client, document_id, owner_id, proposal)).status_code == 201
        await _confirm(client, document_id, owner_id, "126.50", base_revision=1)
        body = (await _get(client, document_id, owner_id)).json()["reminder_proposals"][0]
        assert body["status"] == "saved"
        assert body["inputs_changed"] == "revision_changed"
        assert body["details"]["amount_due"] == "123.47"
        assert body["reminder"]["remind_on"] == "2026-11-21"
    rows = await _rows(Reminder, document_id)
    assert len(rows) == 1 and rows[0].details == proposal["details"]


@pytest.mark.asyncio
async def test_a_later_reminder_adds_a_row_and_keeps_the_first(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        first = await _proposed(client, owner_id, document_id)
        assert (await _approve(client, document_id, owner_id, first)).status_code == 201
        before = [(r.id, r.remind_on, r.details) for r in await _rows(Reminder, document_id)]
        second = (await _propose(client, document_id, owner_id, days_before_due=5, base_proposal=1)).json()
        assert second["proposal_number"] == 2
        response = await _approve(client, document_id, owner_id, second)
        assert response.status_code == 201
        assert response.json()["reminder"]["remind_on"] == "2026-11-18"
        rows = await _rows(Reminder, document_id)
        assert len(rows) == 2
        assert [(r.id, r.remind_on, r.details) for r in rows[:1]] == before
        listed = (await _get(client, document_id, owner_id)).json()["reminder_proposals"]
        assert [(p["proposal_number"], p["status"]) for p in listed] == [(2, "saved"), (1, "saved")]


@pytest.mark.asyncio
async def test_reminders_are_removed_with_the_document(bill, monkeypatch):
    owner_id, _, document_id = bill
    monkeypatch.setattr("app.services.storage_service.delete_file", lambda key: None)
    async with _client() as client:
        proposal = await _proposed(client, owner_id, document_id)
        assert (await _approve(client, document_id, owner_id, proposal)).status_code == 201
        response = await client.delete(f"/api/v1/documents/{document_id}", headers=_headers(owner_id))
        assert response.status_code == 204
    assert await _rows(ReminderProposal, document_id) == []
    assert await _rows(Reminder, document_id) == []
    async with async_session() as db:
        events = (
            await db.execute(select(ReminderEvent).where(ReminderEvent.proposal_id == uuid.UUID(proposal["id"])))
        ).scalars().all()
    assert events == []

