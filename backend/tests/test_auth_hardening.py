"""Verification links expire and can be resent; reset links work once and sign out every session."""
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pyotp
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.config import settings
from app.dependencies import async_session
from app.main import app
from app.models.base import User
from app.rate_limit import limiter
from app.services import email_service
from app.services.auth_service import create_password_reset_token, hash_password

BASE = "http://test"
PASSWORD = "Pass123456!"
NEW_PASSWORD = "NewPass789!"
GENERIC_RESEND = "If that account still needs verifying, we've sent a new link."


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def sent(monkeypatch):
    """Record the emails the routes send instead of sending them."""
    outbox: dict[str, list] = {"verification": [], "reset": []}
    monkeypatch.setattr(email_service, "send_verification_email", lambda to, token: outbox["verification"].append((to, token)))
    monkeypatch.setattr(email_service, "send_password_reset_email", lambda to, token: outbox["reset"].append((to, token)))
    return outbox


async def _make_user(*, verified: bool, token: str | None = None, sent_at: datetime | None = None, totp: str | None = None):
    user = User(
        email=f"auth-hardening-{uuid.uuid4()}@example.com",
        hashed_password=hash_password(PASSWORD),
        is_verified=verified,
        verification_token=token,
        verification_sent_at=sent_at,
        totp_secret=totp,
    )
    async with async_session() as db:
        db.add(user)
        await db.commit()
        return user.id, user.email


async def _user(user_id) -> User:
    async with async_session() as db:
        return (await db.execute(select(User).where(User.id == user_id))).scalar_one()


@pytest.fixture
async def cleanup():
    ids: list = []
    yield ids
    async with async_session() as db:
        for user_id in ids:
            row = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
            if row:
                await db.delete(row)
        await db.commit()


def _now() -> datetime:
    # The users table stores naive UTC timestamps.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE)


def _ver(token: str) -> int:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])["ver"]


async def _login(client, email, password=PASSWORD):
    return await client.post("/api/v1/auth/login", json={"email": email, "password": password, "remember_me": True})


# --- Verification links ---------------------------------------------------


async def test_register_records_when_the_link_was_sent(sent, cleanup):
    email = f"auth-hardening-{uuid.uuid4()}@example.com"
    async with _client() as client:
        res = await client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})
    assert res.status_code == 201
    async with async_session() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one()
    cleanup.append(user.id)
    assert user.verification_sent_at is not None
    assert sent["verification"] == [(email, user.verification_token)]


async def test_a_fresh_verification_link_works(cleanup):
    user_id, _ = await _make_user(verified=False, token="fresh-token", sent_at=_now())
    cleanup.append(user_id)
    async with _client() as client:
        res = await client.get("/api/v1/auth/verify", params={"token": "fresh-token"})
    assert res.status_code == 200
    assert (await _user(user_id)).is_verified is True


async def test_an_expired_verification_link_is_refused(cleanup):
    old = _now() - timedelta(hours=settings.VERIFICATION_EXPIRY_HOURS, minutes=1)
    user_id, _ = await _make_user(verified=False, token="old-token", sent_at=old)
    cleanup.append(user_id)
    async with _client() as client:
        res = await client.get("/api/v1/auth/verify", params={"token": "old-token"})
    assert res.status_code == 400
    assert "expired" in res.json()["detail"]
    assert (await _user(user_id)).is_verified is False


async def test_resend_replaces_the_link_and_the_old_one_stops_working(sent, cleanup):
    old = _now() - timedelta(seconds=settings.VERIFICATION_RESEND_COOLDOWN_S + 5)
    user_id, email = await _make_user(verified=False, token="first-token", sent_at=old)
    cleanup.append(user_id)
    async with _client() as client:
        res = await client.post("/api/v1/auth/resend-verification", json={"email": email})
        assert res.status_code == 200
        assert res.json()["message"] == GENERIC_RESEND
        stale = await client.get("/api/v1/auth/verify", params={"token": "first-token"})
    assert stale.status_code == 400
    user = await _user(user_id)
    assert user.verification_token not in (None, "first-token")
    assert user.verification_sent_at > old
    assert sent["verification"] == [(email, user.verification_token)]


@pytest.mark.parametrize("case", ["unknown", "verified", "cooldown"])
async def test_resend_gives_the_same_reply_and_sends_nothing(case, sent, cleanup):
    if case == "unknown":
        email = f"nobody-{uuid.uuid4()}@example.com"
    elif case == "verified":
        user_id, email = await _make_user(verified=True)
        cleanup.append(user_id)
    else:
        user_id, email = await _make_user(verified=False, token="recent-token", sent_at=_now() - timedelta(seconds=5))
        cleanup.append(user_id)
    async with _client() as client:
        res = await client.post("/api/v1/auth/resend-verification", json={"email": email})
    assert res.status_code == 200
    assert res.json()["message"] == GENERIC_RESEND
    assert sent["verification"] == []


# --- Reset links and sessions ---------------------------------------------


async def test_a_reset_link_works_once(sent, cleanup):
    user_id, email = await _make_user(verified=True)
    cleanup.append(user_id)
    async with _client() as client:
        await client.post("/api/v1/auth/forgot-password", json={"email": email})
        [(_, token)] = sent["reset"]
        first = await client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD})
        second = await client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Another123!"})
    assert first.status_code == 200
    assert second.status_code == 400
    assert second.json()["detail"] == "Invalid or expired reset link"
    assert (await _user(user_id)).token_version == 1


async def test_a_reset_signs_out_existing_sessions(cleanup):
    user_id, email = await _make_user(verified=True)
    cleanup.append(user_id)
    async with _client() as client:
        tokens = (await _login(client, email)).json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 200

        reset = create_password_reset_token(user_id, 0)
        assert (await client.post("/api/v1/auth/reset-password", json={"token": reset, "new_password": NEW_PASSWORD})).status_code == 200

        assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401
        assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 401


async def test_signing_in_after_a_reset_mints_working_version_one_tokens(cleanup):
    user_id, email = await _make_user(verified=True)
    cleanup.append(user_id)
    async with _client() as client:
        reset = create_password_reset_token(user_id, 0)
        assert (await client.post("/api/v1/auth/reset-password", json={"token": reset, "new_password": NEW_PASSWORD})).status_code == 200
        assert (await _login(client, email)).status_code == 401

        tokens = (await _login(client, email, NEW_PASSWORD)).json()
        assert _ver(tokens["access_token"]) == 1 and _ver(tokens["refresh_token"]) == 1
        assert (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})).status_code == 200

        refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert refreshed.status_code == 200
        body = refreshed.json()
        assert _ver(body["access_token"]) == 1 and _ver(body["refresh_token"]) == 1
        assert (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})).status_code == 200


async def test_two_factor_sign_in_carries_the_current_version(cleanup):
    secret = pyotp.random_base32()
    user_id, email = await _make_user(verified=True, totp=secret)
    cleanup.append(user_id)
    async with async_session() as db:
        await db.execute(update(User).where(User.id == user_id).values(token_version=3))
        await db.commit()
    async with _client() as client:
        res = await client.post(
            "/api/v1/auth/login/2fa",
            json={"email": email, "password": PASSWORD, "code": pyotp.TOTP(secret).now()},
        )
        assert res.status_code == 200
        access = res.json()["access_token"]
        assert _ver(access) == 3
        assert (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})).status_code == 200


async def test_forgot_password_link_carries_the_current_version(sent, cleanup):
    user_id, email = await _make_user(verified=True)
    cleanup.append(user_id)
    async with async_session() as db:
        await db.execute(update(User).where(User.id == user_id).values(token_version=2))
        await db.commit()
    async with _client() as client:
        await client.post("/api/v1/auth/forgot-password", json={"email": email})
    [(_, token)] = sent["reset"]
    assert _ver(token) == 2


async def test_a_token_without_a_version_still_works_for_a_version_zero_account(cleanup):
    user_id, _ = await _make_user(verified=True)
    cleanup.append(user_id)
    legacy = jwt.encode(
        {"sub": str(user_id), "exp": datetime.now(timezone.utc) + timedelta(minutes=5), "type": "access"},
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    async with _client() as client:
        res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {legacy}"})
    assert res.status_code == 200


async def test_a_short_new_password_is_still_refused(cleanup):
    user_id, _ = await _make_user(verified=True)
    cleanup.append(user_id)
    async with _client() as client:
        res = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": create_password_reset_token(user_id, 0), "new_password": "Ab1!"},
        )
    assert res.status_code == 422
    assert (await _user(user_id)).token_version == 0
