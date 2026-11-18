"""Two-factor sign-in turns on only after the owner types a correct code."""
import uuid

import pyotp
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.dependencies import async_session
from app.main import app
from app.models.base import User
from app.rate_limit import limiter
from app.services.auth_service import create_access_token, hash_password

BASE = "http://test"
PASSWORD = "Pass123456!"


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
async def account():
    user = User(
        email=f"two-factor-{uuid.uuid4()}@example.com",
        hashed_password=hash_password(PASSWORD),
        is_verified=True,
    )
    async with async_session() as db:
        db.add(user)
        await db.commit()
        user_id, email = user.id, user.email
    headers = {"Authorization": f"Bearer {create_access_token(user_id)}"}
    yield {"id": user_id, "email": email, "headers": headers}
    async with async_session() as db:
        row = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if row:
            await db.delete(row)
            await db.commit()


async def _setup(client, account) -> str:
    res = await client.post("/api/v1/auth/2fa/setup", headers=account["headers"])
    assert res.status_code == 200
    return res.json()["secret"]


async def _login(client, account):
    return await client.post(
        "/api/v1/auth/login", json={"email": account["email"], "password": PASSWORD}
    )


async def _secrets(user_id):
    async with async_session() as db:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
        return user.totp_secret, user.totp_pending_secret


async def test_setup_without_confirming_leaves_sign_in_unchanged(account):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        pending = await _setup(client, account)
        res = await _login(client, account)

    assert res.status_code == 200
    body = res.json()
    assert body["requires_2fa"] is False
    assert body["access_token"] and body["refresh_token"]
    assert await _secrets(account["id"]) == (None, pending)


async def test_a_correct_code_turns_it_on(account):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        pending = await _setup(client, account)
        confirm = await client.post(
            "/api/v1/auth/2fa/confirm",
            json={"code": pyotp.TOTP(pending).now()},
            headers=account["headers"],
        )
        login = await _login(client, account)
        second = await client.post(
            "/api/v1/auth/login/2fa",
            json={"email": account["email"], "password": PASSWORD, "code": pyotp.TOTP(pending).now()},
        )

    assert confirm.status_code == 200
    assert confirm.json() == {"message": "Two-factor sign-in is on."}
    assert login.json()["requires_2fa"] is True
    assert login.json()["access_token"] is None
    assert second.status_code == 200
    assert second.json()["access_token"]
    assert await _secrets(account["id"]) == (pending, None)


async def test_a_wrong_code_changes_nothing(account):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        pending = await _setup(client, account)
        wrong = "000000" if pyotp.TOTP(pending).now() != "000000" else "111111"
        confirm = await client.post(
            "/api/v1/auth/2fa/confirm", json={"code": wrong}, headers=account["headers"]
        )
        login = await _login(client, account)

    assert confirm.status_code == 400
    assert confirm.json() == {
        "detail": "That code didn't match. Check the time on your phone and try again."
    }
    assert login.json()["requires_2fa"] is False
    assert login.json()["access_token"]
    assert await _secrets(account["id"]) == (None, pending)


async def test_confirm_without_setup_is_a_conflict(account):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        res = await client.post(
            "/api/v1/auth/2fa/confirm", json={"code": "123456"}, headers=account["headers"]
        )

    assert res.status_code == 409
    assert res.json() == {"detail": "Start two-factor setup first."}


async def test_confirm_needs_a_signed_in_account():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        res = await client.post("/api/v1/auth/2fa/confirm", json={"code": "123456"})

    assert res.status_code in (401, 403)


async def test_disable_clears_both_secrets(account):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        pending = await _setup(client, account)
        await client.post(
            "/api/v1/auth/2fa/confirm",
            json={"code": pyotp.TOTP(pending).now()},
            headers=account["headers"],
        )
        await _setup(client, account)  # a second, unconfirmed setup leaves a pending secret
        disabled = await client.post("/api/v1/auth/2fa/disable", headers=account["headers"])
        login = await _login(client, account)

    assert disabled.status_code == 200
    assert login.json()["requires_2fa"] is False
    assert login.json()["access_token"]
    assert await _secrets(account["id"]) == (None, None)


async def test_a_second_setup_does_not_replace_the_active_secret(account):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        first = await _setup(client, account)
        await client.post(
            "/api/v1/auth/2fa/confirm",
            json={"code": pyotp.TOTP(first).now()},
            headers=account["headers"],
        )
        second = await _setup(client, account)

    assert second != first
    assert await _secrets(account["id"]) == (first, second)
