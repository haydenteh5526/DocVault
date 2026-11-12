"""Equal split of a confirmed bill in integer cents: calculator, preview, save and reopen."""

import asyncio
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.dependencies import async_session
from app.main import app
from app.models.base import BillRevision, BillSplit, Document
from app.services.auth_service import create_access_token
from app.services.bill_revisions import to_cents
from app.services.bill_split import split_equally
from tests.accounts import create_users_and_document, delete_users, wait_until_blocked


def test_the_issue_example_gives_the_remainder_to_the_first_three():
    assert split_equally(12347, 4) == [3087, 3087, 3087, 3086]


def test_exact_division_has_no_remainder():
    assert split_equally(12000, 4) == [3000, 3000, 3000, 3000]
    assert split_equally(12500, 4) == [3125] * 4


def test_two_and_five_people():
    assert split_equally(12347, 2) == [6174, 6173]
    assert split_equally(12347, 5) == [2470, 2470, 2469, 2469, 2469]


def test_totals_smaller_than_the_number_of_people():
    assert split_equally(3, 4) == [1, 1, 1, 0]
    assert split_equally(0, 4) == [0, 0, 0, 0]


def test_shares_always_sum_to_the_total():
    for total in (0, 1, 2, 99, 100, 101, 12347, 999999999):
        for count in range(2, 13):
            shares = split_equally(total, count)
            assert sum(shares) == total
            assert len(shares) == count
            assert max(shares) - min(shares) <= 1
            assert shares == sorted(shares, reverse=True)
            assert all(type(share) is int for share in shares)


@pytest.mark.parametrize(
    "total, count",
    [(12347, 0), (12347, 1), (12347, -1), (-1, 4), (123.47, 4), (12347, 4.0), ("12347", 4), (True, 4)],
)
def test_invalid_inputs_are_rejected(total, count):
    with pytest.raises(ValueError):
        split_equally(total, count)


# --- Preview, save and reopen ---------------------------------------------------------------

BASE = "http://test"
BILL = ("Electricity bill\nTotal amount due: EUR 123.47\n"
        "Billing period: 1 October 2026 to 31 October 2026\nPayment due date: 23 November 2026")
VALUES = {"amount_due": "125.00", "due_date": "2026-11-23", "billing_period_start": "2026-10-01",
          "billing_period_end": "2026-10-31", "base_revision": 0}
REQUEST = {"bill_revision": 1, "rule": "equal"}
FOUR = ("Aoife", "Ben", "Chidi", "Dara")


def _headers(user_id):
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE)


def _code(response):
    return response.json()["detail"]["code"]


async def _confirm(client, document_id, owner_id, amount="123.47", base_revision=0):
    detail = (await client.get(f"/api/v1/documents/{document_id}", headers=_headers(owner_id))).json()
    response = await client.post(
        f"/api/v1/documents/{document_id}/bill-revisions",
        headers=_headers(owner_id),
        json={**VALUES, "amount_due": amount, "base_revision": base_revision, "reviewed": detail["bill_review"]},
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


async def _preview(client, document_id, user_id, body):
    return await client.post(
        f"/api/v1/documents/{document_id}/bill-splits/preview", headers=_headers(user_id), json=body
    )


async def _save(client, document_id, user_id, body):
    return await client.post(f"/api/v1/documents/{document_id}/bill-splits", headers=_headers(user_id), json=body)


async def _get(client, document_id, user_id):
    return await client.get(f"/api/v1/documents/{document_id}", headers=_headers(user_id))


async def _split_rows(document_id):
    async with async_session() as db:
        result = await db.execute(
            select(BillSplit).where(BillSplit.document_id == document_id).order_by(BillSplit.split_number)
        )
        return result.scalars().all()


async def _row_count(document_id):
    return len(await _split_rows(document_id))


def _full_save(ids, preview, base_split=0, bill_revision=1):
    return {"bill_revision": bill_revision, "rule": "equal", "housemate_ids": ids,
            "base_split": base_split, "reviewed": preview["shares"]}


@pytest.fixture
async def bill():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    yield owner_id, other_id, document_id
    await delete_users(owner_id, other_id)


async def _confirmed_with_four(client, owner_id, document_id, amount="123.47"):
    await _confirm(client, document_id, owner_id, amount)
    return await _housemates(client, owner_id, *FOUR)


async def _saved_first_split(client, owner_id, document_id, ids):
    preview = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})).json()
    response = await _save(client, document_id, owner_id, _full_save(ids, preview))
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_the_confirmed_amount_is_previewed_without_saving(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        response = await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})
        assert response.status_code == 200
        body = response.json()
        assert [share["amount"] for share in body["shares"]] == ["30.87", "30.87", "30.87", "30.86"]
        assert [share["label"] for share in body["shares"]] == list(FOUR)
        assert [share["housemate_id"] for share in body["shares"]] == ids
        assert body["total"] == "123.47"
        assert body["remainder_cents"] == 3
        assert body["bill_revision"] == 1
        assert body["rule"] == "equal"
    assert await _row_count(document_id) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "amount,labels,amounts,remainder",
    [
        ("120.00", FOUR, ["30.00"] * 4, 0),
        ("123.47", FOUR[:2], ["61.74", "61.73"], 1),
        ("123.47", FOUR + ("Eoin",), ["24.70", "24.70", "24.69", "24.69", "24.69"], 2),
    ],
)
async def test_exact_division_and_other_group_sizes(bill, amount, labels, amounts, remainder):
    owner_id, _, document_id = bill
    async with _client() as client:
        await _confirm(client, document_id, owner_id, amount)
        ids = await _housemates(client, owner_id, *labels)
        body = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})).json()
        assert [share["amount"] for share in body["shares"]] == amounts
        assert body["remainder_cents"] == remainder
        assert sum(to_cents(share["amount"]) for share in body["shares"]) == to_cents(amount)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "amount,amounts,remainder",
    [("0.03", ["0.01", "0.01", "0.01", "0.00"], 3), ("0.00", ["0.00"] * 4, 0)],
)
async def test_small_and_zero_totals(bill, amount, amounts, remainder):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id, amount)
        body = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})).json()
        assert [share["amount"] for share in body["shares"]] == amounts
        assert body["remainder_cents"] == remainder
        assert body["total"] == amount


@pytest.mark.asyncio
async def test_the_split_uses_the_confirmed_amount_not_the_ocr_candidate(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id, "125.00")
        body = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})).json()
        assert [share["amount"] for share in body["shares"]] == ["31.25"] * 4
        assert body["total"] == "125.00"


@pytest.mark.asyncio
async def test_the_order_sent_decides_who_gets_the_remainder(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        body = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids[::-1]})).json()
        assert [share["label"] for share in body["shares"]] == ["Dara", "Chidi", "Ben", "Aoife"]
        assert [share["amount"] for share in body["shares"]] == ["30.87", "30.87", "30.87", "30.86"]


@pytest.mark.asyncio
async def test_owner_saves_the_reviewed_split_and_reopens_it(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        preview = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})).json()
        response = await _save(client, document_id, owner_id, _full_save(ids, preview))
        assert response.status_code == 201
        body = response.json()
        assert body["split_number"] == 1
        assert body["stale"] is False
        assert body["document_id"] == str(document_id)
        assert body["shares"] == preview["shares"]
        assert body["total"] == "123.47"

        rows = await _split_rows(document_id)
        assert len(rows) == 1
        async with async_session() as db:
            revision = (
                await db.execute(select(BillRevision).where(BillRevision.document_id == document_id))
            ).scalar_one()
        assert rows[0].total_cents == 12347
        assert rows[0].rule == "equal"
        assert rows[0].bill_revision_id == revision.id
        assert [share["cents"] for share in rows[0].shares] == [3087, 3087, 3087, 3086]

        detail = (await _get(client, document_id, owner_id)).json()
        assert detail["bill_split"] == body


@pytest.mark.asyncio
async def test_a_later_split_adds_a_row_and_keeps_the_first(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        await _saved_first_split(client, owner_id, document_id, ids)
        first_shares = (await _split_rows(document_id))[0].shares

        two = ids[:2]
        preview = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": two})).json()
        response = await _save(client, document_id, owner_id, _full_save(two, preview, base_split=1))
        assert response.status_code == 201
        assert response.json()["split_number"] == 2

        rows = await _split_rows(document_id)
        assert len(rows) == 2
        assert rows[0].shares == first_shares
        assert (await _get(client, document_id, owner_id)).json()["bill_split"]["split_number"] == 2


@pytest.mark.asyncio
async def test_a_bill_without_a_confirmed_revision_cannot_be_split(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _housemates(client, owner_id, *FOUR)
        body = {**REQUEST, "housemate_ids": ids}
        preview = await _preview(client, document_id, owner_id, body)
        assert preview.status_code == 409
        assert _code(preview) == "no_confirmed_bill"
        save = await _save(client, document_id, owner_id, {**body, "base_split": 0, "reviewed": []})
        assert save.status_code == 409
        assert _code(save) == "no_confirmed_bill"
        assert await _row_count(document_id) == 0
        assert (await _get(client, document_id, owner_id)).json()["bill_split"] is None


def _bad_bodies(ids):
    base = {**REQUEST, "housemate_ids": ids}
    return {
        "empty": {**base, "housemate_ids": []},
        "one": {**base, "housemate_ids": ids[:1]},
        "repeated": {**base, "housemate_ids": [ids[0], ids[0]]},
        "thirteen": {**base, "housemate_ids": [str(uuid.uuid4()) for _ in range(13)]},
        "missing_ids": {k: v for k, v in base.items() if k != "housemate_ids"},
        "label_for_id": {**base, "housemate_ids": ["Aoife", "Ben"]},
        "missing_rule": {k: v for k, v in base.items() if k != "rule"},
        "rule": {**base, "rule": "by_usage"},
        "revision_zero": {**base, "bill_revision": 0},
        "missing_revision": {k: v for k, v in base.items() if k != "bill_revision"},
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "name",
    ["empty", "one", "repeated", "thirteen", "missing_ids", "label_for_id", "missing_rule", "rule",
     "revision_zero", "missing_revision", "no_reviewed", "negative_base"],
)
async def test_incomplete_inputs_are_rejected(bill, name):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        bodies = _bad_bodies(ids)
        good = {**REQUEST, "housemate_ids": ids}
        if name in bodies:
            body = bodies[name]
            assert (await _preview(client, document_id, owner_id, body)).status_code == 422
            save_body = {"base_split": 0, "reviewed": [], **body}
        elif name == "no_reviewed":
            save_body = {**good, "base_split": 0}
        else:
            save_body = {**good, "base_split": -1, "reviewed": []}
        assert (await _save(client, document_id, owner_id, save_body)).status_code == 422
    assert await _row_count(document_id) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("stranger", ["random", "other_account"])
async def test_a_person_the_server_cannot_find_is_rejected(bill, stranger):
    owner_id, other_id, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        if stranger == "random":
            replacement = str(uuid.uuid4())
        else:
            replacement = (await _housemates(client, other_id, "Zed"))[0]
        body = {**REQUEST, "housemate_ids": [replacement, *ids[1:]]}
        preview = await _preview(client, document_id, owner_id, body)
        assert preview.status_code == 409
        assert _code(preview) == "unknown_housemate"
        save = await _save(client, document_id, owner_id, {**body, "base_split": 0, "reviewed": []})
        assert save.status_code == 409
        assert _code(save) == "unknown_housemate"
    assert await _row_count(document_id) == 0


@pytest.mark.asyncio
async def test_a_newer_revision_marks_the_saved_split_stale(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        saved = await _saved_first_split(client, owner_id, document_id, ids)
        await _confirm(client, document_id, owner_id, "126.50", base_revision=1)
        detail = (await _get(client, document_id, owner_id)).json()
        assert detail["confirmed_bill"]["revision_number"] == 2
        split = detail["bill_split"]
        assert split["stale"] is True
        assert split["bill_revision"] == 1
        assert split["total"] == "123.47"
        assert [share["amount"] for share in split["shares"]] == ["30.87", "30.87", "30.87", "30.86"]
        assert {**split, "stale": False} == saved
    assert await _row_count(document_id) == 1


@pytest.mark.asyncio
async def test_a_split_reviewed_against_an_older_revision_is_rejected(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        preview = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})).json()
        await _confirm(client, document_id, owner_id, "126.50", base_revision=1)
        save = await _save(client, document_id, owner_id, _full_save(ids, preview, bill_revision=1))
        assert save.status_code == 409
        assert _code(save) == "revision_changed"
        again = await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})
        assert again.status_code == 409
        assert _code(again) == "revision_changed"
    assert await _row_count(document_id) == 0


@pytest.mark.asyncio
async def test_a_stale_tab_cannot_save_over_another_split(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        preview = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})).json()
        body = _full_save(ids, preview)
        assert (await _save(client, document_id, owner_id, body)).status_code == 201
        stale = await _save(client, document_id, owner_id, body)
        assert stale.status_code == 409
        assert _code(stale) == "split_changed"
    assert await _row_count(document_id) == 1


@pytest.mark.asyncio
async def test_concurrent_saves_store_exactly_one_split(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        preview = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})).json()
        body = _full_save(ids, preview)
        responses = await asyncio.gather(
            _save(client, document_id, owner_id, body), _save(client, document_id, owner_id, body)
        )
        assert sorted(response.status_code for response in responses) == [201, 409]
        conflict = next(response for response in responses if response.status_code == 409)
        assert _code(conflict) == "split_changed"
    assert await _row_count(document_id) == 1


def _alter_amount(reviewed):
    return [{**reviewed[0], "amount": "30.88"}, *reviewed[1:]]


def _alter_label(reviewed):
    return [{**reviewed[0], "label": "Zed"}, *reviewed[1:]]


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [_alter_amount, _alter_label, lambda r: r[::-1], lambda r: r[:-1]])
async def test_shares_that_differ_from_the_server_result_are_rejected(bill, change):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        preview = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})).json()
        body = {**_full_save(ids, preview), "reviewed": change(preview["shares"])}
        response = await _save(client, document_id, owner_id, body)
        assert response.status_code == 409
        assert _code(response) == "shares_changed"
    assert await _row_count(document_id) == 0


@pytest.mark.asyncio
async def test_a_split_save_waits_for_the_document_lock(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        preview = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})).json()
        async with async_session() as locker:
            await locker.execute(select(Document).where(Document.id == document_id).with_for_update(key_share=True))
            save = asyncio.create_task(_save(client, document_id, owner_id, _full_save(ids, preview)))
            try:
                assert await wait_until_blocked(save)
                assert not save.done()
                await locker.commit()
            finally:
                if not save.done():
                    await locker.rollback()
                response = await save
        assert response.status_code == 201
    assert await _row_count(document_id) == 1


@pytest.mark.asyncio
async def test_a_duplicate_split_number_is_a_conflict(bill, monkeypatch):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        preview = (await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})).json()
        body = _full_save(ids, preview)
        assert (await _save(client, document_id, owner_id, body)).status_code == 201

        async def _stale_split_number(db, document_id):
            return 0

        monkeypatch.setattr("app.services.bill_split._current_split_number", _stale_split_number)
        response = await _save(client, document_id, owner_id, body)
        assert response.status_code == 409
        assert _code(response) == "split_changed"
    assert await _row_count(document_id) == 1


@pytest.mark.asyncio
async def test_removing_a_housemate_keeps_the_saved_split(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        saved = await _saved_first_split(client, owner_id, document_id, ids)
        removed = await client.delete(f"/api/v1/housemates/{ids[1]}", headers=_headers(owner_id))
        assert removed.status_code == 204
        split = (await _get(client, document_id, owner_id)).json()["bill_split"]
        assert split == saved
        assert split["shares"][1]["label"] == "Ben"
        assert split["shares"][1]["amount"] == "30.87"
        assert split["stale"] is False
        again = await _preview(client, document_id, owner_id, {**REQUEST, "housemate_ids": ids})
        assert again.status_code == 409
        assert _code(again) == "unknown_housemate"


@pytest.mark.asyncio
async def test_a_saved_split_reopens_while_the_document_is_reprocessed(bill):
    owner_id, _, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        saved = await _saved_first_split(client, owner_id, document_id, ids)
        confirmed = (await _get(client, document_id, owner_id)).json()["confirmed_bill"]
        async with async_session() as db:
            await db.execute(update(Document).where(Document.id == document_id).values(processing_status="processing"))
            await db.commit()
        detail = (await _get(client, document_id, owner_id)).json()
        assert detail["bill_review"] is None
        assert detail["confirmed_bill"] == confirmed
        assert detail["bill_split"] == saved


@pytest.mark.asyncio
async def test_another_account_cannot_preview_save_or_read_a_split(bill):
    owner_id, other_id, document_id = bill
    async with _client() as client:
        ids = await _confirmed_with_four(client, owner_id, document_id)
        theirs = await _housemates(client, other_id, "Aoife", "Ben")
        body = {**REQUEST, "housemate_ids": theirs}
        assert (await _preview(client, document_id, other_id, body)).status_code == 404
        saved = await _save(client, document_id, other_id, {**body, "base_split": 0, "reviewed": []})
        assert saved.status_code == 404
        assert await _row_count(document_id) == 0

        await _saved_first_split(client, owner_id, document_id, ids)
        assert (await _get(client, document_id, other_id)).status_code == 404
