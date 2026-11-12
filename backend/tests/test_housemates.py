"""Housemate labels saved per owner: validation, ordering, limits and isolation."""

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.dependencies import async_session
from app.main import app
from app.models.base import Housemate
from app.services.auth_service import create_access_token
from tests.accounts import create_users_and_document, delete_users

BASE = "http://test"


def _headers(user_id):
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE)


async def _add(client, user_id, label):
    return await client.post("/api/v1/housemates", headers=_headers(user_id), json={"label": label})


async def _list(client, user_id):
    response = await client.get("/api/v1/housemates", headers=_headers(user_id))
    assert response.status_code == 200
    return response.json()


def _code(response):
    return response.json()["detail"]["code"]


@pytest.fixture
async def accounts():
    owner_id, other_id, _ = await create_users_and_document()
    yield owner_id, other_id
    await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_owner_adds_lists_and_removes_housemates(accounts):
    owner_id, _ = accounts
    async with _client() as client:
        for label in ("Aoife", "Ben", "Chidi", "Dara"):
            assert (await _add(client, owner_id, label)).status_code == 201
        listed = await _list(client, owner_id)
        assert [h["label"] for h in listed] == ["Aoife", "Ben", "Chidi", "Dara"]
        positions = [h["position"] for h in listed]
        assert positions == sorted(positions) and len(set(positions)) == 4

        ben = listed[1]["id"]
        assert (await client.delete(f"/api/v1/housemates/{ben}", headers=_headers(owner_id))).status_code == 204
        assert [h["label"] for h in await _list(client, owner_id)] == ["Aoife", "Chidi", "Dara"]

        assert (await _add(client, owner_id, "Ben")).status_code == 201
        assert [h["label"] for h in await _list(client, owner_id)][-1] == "Ben"


@pytest.mark.asyncio
async def test_labels_are_trimmed(accounts):
    owner_id, _ = accounts
    async with _client() as client:
        response = await _add(client, owner_id, "  Aoife  ")
        assert response.status_code == 201
        assert response.json()["label"] == "Aoife"
        assert (await _add(client, owner_id, "x" * 40)).status_code == 201


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", ["", "   ", "x" * 41, "ß" * 41, "Aoife\nBen", None, "MISSING"])
async def test_blank_long_and_unprintable_labels_are_rejected(accounts, payload):
    owner_id, _ = accounts
    body = {} if payload == "MISSING" else {"label": payload}
    async with _client() as client:
        response = await client.post("/api/v1/housemates", headers=_headers(owner_id), json=body)
        assert response.status_code == 422
        assert await _list(client, owner_id) == []


@pytest.mark.asyncio
async def test_duplicate_labels_are_rejected(accounts):
    owner_id, _ = accounts
    async with _client() as client:
        assert (await _add(client, owner_id, "Aoife")).status_code == 201
        for label in ("aoife ", "AOIFE"):
            response = await _add(client, owner_id, label)
            assert response.status_code == 409
            assert _code(response) == "duplicate_label"
        assert len(await _list(client, owner_id)) == 1


@pytest.mark.asyncio
async def test_a_forty_character_label_keeps_its_full_case_folded_key(accounts):
    owner_id, _ = accounts
    async with _client() as client:
        response = await _add(client, owner_id, "ß" * 40)
        assert response.status_code == 201
        assert response.json()["label"] == "ß" * 40
        assert len(response.json()["label"]) == 40
        async with async_session() as db:
            row = (await db.execute(select(Housemate).where(Housemate.user_id == owner_id))).scalar_one()
        assert row.label_key == "s" * 80

        duplicate = await _add(client, owner_id, "ẞ" * 40)
        assert duplicate.status_code == 409
        assert _code(duplicate) == "duplicate_label"

        assert (await _add(client, owner_id, "ß" * 39 + "x")).status_code == 201
        assert len(await _list(client, owner_id)) == 2


@pytest.mark.asyncio
async def test_no_more_than_twelve_housemates(accounts):
    owner_id, _ = accounts
    async with _client() as client:
        for number in range(12):
            assert (await _add(client, owner_id, f"Person {number}")).status_code == 201
        response = await _add(client, owner_id, "Person 12")
        assert response.status_code == 409
        assert _code(response) == "too_many_housemates"
        assert len(await _list(client, owner_id)) == 12


@pytest.mark.asyncio
async def test_concurrent_adds_of_one_label_save_exactly_one(accounts):
    owner_id, _ = accounts
    async with _client() as client:
        responses = await asyncio.gather(_add(client, owner_id, "Aoife"), _add(client, owner_id, "Aoife"))
        assert sorted(r.status_code for r in responses) == [201, 409]
        assert len(await _list(client, owner_id)) == 1


@pytest.mark.asyncio
async def test_another_account_cannot_see_or_remove_housemates(accounts):
    owner_id, other_id = accounts
    async with _client() as client:
        created = await _add(client, owner_id, "Aoife")
        assert created.status_code == 201
        assert await _list(client, other_id) == []
        response = await client.delete(f"/api/v1/housemates/{created.json()['id']}", headers=_headers(other_id))
        assert response.status_code == 404
        assert [h["label"] for h in await _list(client, owner_id)] == ["Aoife"]
        assert (await _add(client, other_id, "Aoife")).status_code == 201

        anonymous = await client.get("/api/v1/housemates")
        reference = await client.get("/api/v1/documents")
        assert anonymous.status_code == reference.status_code
