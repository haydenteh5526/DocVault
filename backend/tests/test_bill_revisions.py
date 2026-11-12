"""Owner-confirmed bill revisions: cents conversion, saving, reopening and conflicts."""

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, update

from app.dependencies import async_session
from app.main import app
from app.models.base import BillRevision, Document
from app.services.auth_service import create_access_token
from app.services.bill_revisions import from_cents, to_cents
from tests.accounts import create_users_and_document, delete_users

BASE = "http://test"

BILL = ("Electricity bill\nTotal amount due: EUR 123.47\n"
        "Billing period: 1 October 2026 to 31 October 2026\nPayment due date: 23 November 2026")
UNCLEAR = BILL.replace("Payment due date: 23 November 2026", "Due date: 2026-11-23\nPay by: 2026-11-24")
VALUES = {"amount_due": "125.00", "due_date": "2026-11-23", "billing_period_start": "2026-10-01",
          "billing_period_end": "2026-10-31", "base_revision": 0}
EMPTY_REVIEW = {name: {"value": None, "sources": []} for name in ("amount_due", "due_date", "billing_period")}


def _headers(user_id):
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE)


async def _get(client, document_id, user_id):
    return await client.get(f"/api/v1/documents/{document_id}", headers=_headers(user_id))


async def _review(client, document_id, user_id):
    response = await _get(client, document_id, user_id)
    assert response.status_code == 200
    return response.json()["bill_review"]


async def _post(client, document_id, user_id, body):
    return await client.post(f"/api/v1/documents/{document_id}/bill-revisions", headers=_headers(user_id), json=body)


async def _rows(document_id):
    async with async_session() as db:
        result = await db.execute(
            select(BillRevision).where(BillRevision.document_id == document_id).order_by(BillRevision.revision_number)
        )
        return result.scalars().all()


async def _row_count(document_id):
    async with async_session() as db:
        return (
            await db.execute(select(func.count()).select_from(BillRevision).where(BillRevision.document_id == document_id))
        ).scalar_one()


async def _set_document(document_id, **values):
    async with async_session() as db:
        await db.execute(update(Document).where(Document.id == document_id).values(**values))
        await db.commit()


def _code(response):
    return response.json()["detail"]["code"]


def test_cents_round_trip():
    assert to_cents("123.47") == 12347
    assert to_cents("0.05") == 5
    assert from_cents(12347) == "123.47"
    assert from_cents(5) == "0.05"


@pytest.mark.asyncio
async def test_owner_confirms_a_correction_and_reopens_it():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    try:
        async with _client() as client:
            review = await _review(client, document_id, owner_id)
            response = await _post(client, document_id, owner_id, {**VALUES, "reviewed": review})
            assert response.status_code == 201
            body = response.json()
            assert body["revision_number"] == 1
            assert body["amount_due"] == "125.00"
            assert body["document_id"] == str(document_id)
            assert body["evidence"] == review

            rows = await _rows(document_id)
            assert [row.amount_due_cents for row in rows] == [12500]

            detail = (await _get(client, document_id, owner_id)).json()
            assert detail["confirmed_bill"] == body
            assert detail["bill_review"]["amount_due"]["value"] == "123.47"
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_a_later_edit_adds_a_revision_and_keeps_the_first():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    try:
        async with _client() as client:
            review = await _review(client, document_id, owner_id)
            first = await _post(client, document_id, owner_id, {**VALUES, "reviewed": review})
            assert first.status_code == 201
            second = await _post(
                client, document_id, owner_id,
                {**VALUES, "amount_due": "126.50", "base_revision": 1, "reviewed": review},
            )
            assert second.status_code == 201
            assert second.json()["revision_number"] == 2

            rows = await _rows(document_id)
            assert [(row.revision_number, row.amount_due_cents) for row in rows] == [(1, 12500), (2, 12650)]

            detail = (await _get(client, document_id, owner_id)).json()
            assert detail["confirmed_bill"]["revision_number"] == 2
            assert detail["confirmed_bill"] == second.json()
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_a_stale_tab_cannot_append_after_another_save():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    try:
        async with _client() as client:
            review = await _review(client, document_id, owner_id)
            first = await _post(client, document_id, owner_id, {**VALUES, "reviewed": review})
            assert first.status_code == 201
            stale = await _post(client, document_id, owner_id, {**VALUES, "reviewed": review})
            assert stale.status_code == 409
            assert _code(stale) == "revision_changed"
        assert await _row_count(document_id) == 1
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_concurrent_confirmations_save_exactly_one():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    try:
        async with _client() as client:
            review = await _review(client, document_id, owner_id)
            body = {**VALUES, "reviewed": review}
            responses = await asyncio.gather(
                _post(client, document_id, owner_id, body),
                _post(client, document_id, owner_id, body),
            )
        assert sorted(response.status_code for response in responses) == [201, 409]
        conflict = next(response for response in responses if response.status_code == 409)
        assert _code(conflict) == "revision_changed"
        assert await _row_count(document_id) == 1
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_another_account_cannot_save_or_read_a_revision():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    try:
        async with _client() as client:
            review = await _review(client, document_id, owner_id)
            body = {**VALUES, "reviewed": review}
            stolen = await _post(client, document_id, other_id, body)
            assert stolen.status_code == 404
            assert await _row_count(document_id) == 0

            assert (await _post(client, document_id, owner_id, body)).status_code == 201
            assert (await _get(client, document_id, other_id)).status_code == 404
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_unclear_due_date_needs_an_owner_decision():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=UNCLEAR)
    try:
        async with _client() as client:
            review = await _review(client, document_id, owner_id)
            assert review["due_date"]["value"] is None
            assert len(review["due_date"]["sources"]) == 2

            without_date = {key: value for key, value in VALUES.items() if key != "due_date"}
            missing = await _post(client, document_id, owner_id, {**without_date, "reviewed": review})
            assert missing.status_code == 422
            assert await _row_count(document_id) == 0

            decided = await _post(client, document_id, owner_id, {**VALUES, "due_date": "2026-11-24", "reviewed": review})
            assert decided.status_code == 201
            assert decided.json()["evidence"]["due_date"]["sources"] == review["due_date"]["sources"]
            assert [source["text"] for source in decided.json()["evidence"]["due_date"]["sources"]] == [
                "Due date: 2026-11-23",
                "Pay by: 2026-11-24",
            ]
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_changed_transcript_is_rejected():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    try:
        async with _client() as client:
            review = await _review(client, document_id, owner_id)
            await _set_document(document_id, raw_text=BILL.replace("EUR 123.47", "EUR 130.00"))
            response = await _post(client, document_id, owner_id, {**VALUES, "reviewed": review})
            assert response.status_code == 409
            assert _code(response) == "transcript_changed"
        assert await _row_count(document_id) == 0
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_a_transcript_edit_in_progress_blocks_the_save():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    try:
        async with _client() as client:
            review = await _review(client, document_id, owner_id)
            async with async_session() as editor:
                await editor.execute(
                    update(Document)
                    .where(Document.id == document_id)
                    .values(raw_text=BILL.replace("EUR 123.47", "EUR 130.00"))
                )
                save = asyncio.create_task(_post(client, document_id, owner_id, {**VALUES, "reviewed": review}))
                try:
                    await asyncio.sleep(0.5)
                    assert not save.done()
                    await editor.commit()
                finally:
                    if not save.done():
                        await editor.rollback()
                    response = await save
        assert response.status_code == 409
        assert _code(response) == "transcript_changed"
        assert await _row_count(document_id) == 0
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field,value",
    [
        ("amount_due", "123.4"),
        ("amount_due", "1,234.05"),
        ("amount_due", "-5.00"),
        ("amount_due", "€12.00"),
        ("amount_due", ""),
        ("amount_due", "١٢٣.٤٧"),
        ("billing_period_end", "2026-09-30"),
        ("due_date", "2026-02-31"),
        ("base_revision", -1),
    ],
)
async def test_invalid_values_are_rejected(field, value):
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    try:
        async with _client() as client:
            review = await _review(client, document_id, owner_id)
            response = await _post(client, document_id, owner_id, {**VALUES, field: value, "reviewed": review})
            assert response.status_code == 422
        assert await _row_count(document_id) == 0
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "raw_text,processing_status",
    [("User manual", "complete"), (BILL, "processing")],
)
async def test_documents_without_a_bill_review_cannot_be_confirmed(raw_text, processing_status):
    owner_id, other_id, document_id = await create_users_and_document(
        raw_text=raw_text, processing_status=processing_status
    )
    try:
        async with _client() as client:
            response = await _post(client, document_id, owner_id, {**VALUES, "reviewed": EMPTY_REVIEW})
            assert response.status_code == 409
            assert _code(response) == "no_bill_review"
        assert await _row_count(document_id) == 0
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change",
    [{"raw_text": "User manual"}, {"processing_status": "processing"}],
)
async def test_confirmed_bill_reopens_after_candidates_disappear(change):
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    try:
        async with _client() as client:
            review = await _review(client, document_id, owner_id)
            confirmed = await _post(client, document_id, owner_id, {**VALUES, "reviewed": review})
            assert confirmed.status_code == 201

            await _set_document(document_id, **change)
            detail = (await _get(client, document_id, owner_id)).json()
            assert detail["bill_review"] is None
            assert detail["confirmed_bill"] == confirmed.json()
            assert detail["confirmed_bill"]["evidence"] == review
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_a_duplicate_revision_number_is_a_conflict(monkeypatch):
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    try:
        async with _client() as client:
            review = await _review(client, document_id, owner_id)
            body = {**VALUES, "reviewed": review}
            assert (await _post(client, document_id, owner_id, body)).status_code == 201

            async def _stale_revision_number(db, document_id):
                return 0

            monkeypatch.setattr("app.services.bill_revisions._current_revision_number", _stale_revision_number)
            response = await _post(client, document_id, owner_id, body)
            assert response.status_code == 409
            assert _code(response) == "revision_changed"
        assert await _row_count(document_id) == 1
    finally:
        await delete_users(owner_id, other_id)
