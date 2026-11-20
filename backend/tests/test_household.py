"""Household preferences saved per account: defaults, saving, validation, isolation and database limits."""

import asyncio
from datetime import datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies import async_session
from app.main import app
from app.models.base import HouseholdPreferences
from app.services.auth_service import create_access_token
from tests.accounts import create_users_and_document, delete_users

BASE = "http://test"
URL = "/api/v1/household/preferences"
SAVED = {"reminder_days_before_due": 5, "default_split_rule": "days_home", "routines_enabled": False}


def _headers(user_id):
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE)


@pytest.fixture
async def accounts():
    owner_id, other_id, _ = await create_users_and_document()
    yield owner_id, other_id
    await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_defaults_before_saving(accounts):
    owner_id, _ = accounts
    async with _client() as client:
        response = await client.get(URL, headers=_headers(owner_id))
    assert response.status_code == 200
    assert response.json() == {
        "reminder_days_before_due": 3,
        "default_split_rule": "equal",
        "routines_enabled": True,
        "saved": False,
    }
    async with async_session() as db:
        rows = (await db.execute(select(HouseholdPreferences).where(HouseholdPreferences.user_id == owner_id))).all()
    assert rows == []  # reading the defaults must not create a row


@pytest.mark.asyncio
async def test_saving_and_reading_back(accounts):
    owner_id, _ = accounts
    async with _client() as client:
        saved = await client.put(URL, headers=_headers(owner_id), json=SAVED)
        assert saved.status_code == 200
        assert saved.json() == {**SAVED, "saved": True}

        read = await client.get(URL, headers=_headers(owner_id))
        assert read.json() == {**SAVED, "saved": True}

        # A second save replaces the row rather than adding another.
        again = {"reminder_days_before_due": 0, "default_split_rule": "equal", "routines_enabled": True}
        assert (await client.put(URL, headers=_headers(owner_id), json=again)).json() == {**again, "saved": True}
        assert (await client.get(URL, headers=_headers(owner_id))).json() == {**again, "saved": True}

    async with async_session() as db:
        rows = (await db.execute(select(HouseholdPreferences).where(HouseholdPreferences.user_id == owner_id))).all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_a_second_save_moves_updated_at(accounts):
    owner_id, _ = accounts

    async def stored() -> datetime:
        async with async_session() as db:
            return (
                await db.execute(
                    select(HouseholdPreferences.updated_at).where(HouseholdPreferences.user_id == owner_id)
                )
            ).scalar_one()

    async with _client() as client:
        await client.put(URL, headers=_headers(owner_id), json=SAVED)
        first = await stored()
        await asyncio.sleep(0.05)
        await client.put(URL, headers=_headers(owner_id), json={**SAVED, "reminder_days_before_due": 6})
    assert await stored() > first


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        {**SAVED, "reminder_days_before_due": -1},
        {**SAVED, "reminder_days_before_due": 61},
        {**SAVED, "reminder_days_before_due": "5"},
        {**SAVED, "reminder_days_before_due": 2.5},
        {**SAVED, "reminder_days_before_due": True},
        {**SAVED, "default_split_rule": "by_income"},
        {**SAVED, "routines_enabled": None},
        {**SAVED, "saved": True},
        {"default_split_rule": "equal", "routines_enabled": True},
    ],
)
async def test_preferences_validation(accounts, body):
    owner_id, _ = accounts
    async with _client() as client:
        response = await client.put(URL, headers=_headers(owner_id), json=body)
        assert response.status_code == 422
        assert (await client.get(URL, headers=_headers(owner_id))).json()["saved"] is False


@pytest.mark.asyncio
async def test_the_limits_are_accepted(accounts):
    owner_id, _ = accounts
    async with _client() as client:
        for days in (0, 60):
            body = {**SAVED, "reminder_days_before_due": days}
            assert (await client.put(URL, headers=_headers(owner_id), json=body)).status_code == 200


@pytest.mark.asyncio
async def test_a_rejected_save_keeps_the_earlier_preferences(accounts):
    owner_id, _ = accounts
    async with _client() as client:
        await client.put(URL, headers=_headers(owner_id), json=SAVED)
        bad = await client.put(URL, headers=_headers(owner_id), json={**SAVED, "reminder_days_before_due": 99})
        assert bad.status_code == 422
        assert (await client.get(URL, headers=_headers(owner_id))).json() == {**SAVED, "saved": True}


@pytest.mark.asyncio
async def test_another_users_preferences_are_never_returned(accounts):
    owner_id, other_id = accounts
    async with _client() as client:
        await client.put(URL, headers=_headers(owner_id), json=SAVED)
        other = await client.get(URL, headers=_headers(other_id))
        assert other.json() == {
            "reminder_days_before_due": 3,
            "default_split_rule": "equal",
            "routines_enabled": True,
            "saved": False,
        }
        # Saving as the other account never changes the owner's row.
        await client.put(
            URL,
            headers=_headers(other_id),
            json={"reminder_days_before_due": 9, "default_split_rule": "equal", "routines_enabled": True},
        )
        assert (await client.get(URL, headers=_headers(owner_id))).json() == {**SAVED, "saved": True}


@pytest.mark.asyncio
async def test_preferences_need_a_session():
    async with _client() as client:
        assert (await client.get(URL)).status_code in (401, 403)
        assert (await client.put(URL, json=SAVED)).status_code in (401, 403)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "values",
    [
        {"reminder_days_before_due": -1, "default_split_rule": "equal"},
        {"reminder_days_before_due": 61, "default_split_rule": "equal"},
        {"reminder_days_before_due": 3, "default_split_rule": "by_income"},
    ],
)
async def test_the_database_enforces_the_limits(accounts, values):
    owner_id, _ = accounts
    async with async_session() as db:
        db.add(HouseholdPreferences(user_id=owner_id, routines_enabled=True, **values))
        with pytest.raises(IntegrityError):
            await db.commit()


@pytest.mark.asyncio
async def test_deleting_the_account_deletes_its_preferences():
    owner_id, other_id, _ = await create_users_and_document()
    async with _client() as client:
        await client.put(URL, headers=_headers(owner_id), json=SAVED)
    await delete_users(owner_id, other_id)
    async with async_session() as db:
        rows = (await db.execute(select(HouseholdPreferences).where(HouseholdPreferences.user_id == owner_id))).all()
    assert rows == []
