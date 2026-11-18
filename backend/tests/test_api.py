"""
API tests. Run in CI with a dedicated database (not inside running container).
For local testing, stop the API first: docker compose stop api
Then run: docker compose run --rm api pytest tests/ -v
"""
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

BASE = "http://test"


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    from app.rate_limit import limiter

    limiter.reset()
    yield
    limiter.reset()


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_register_success():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/register", json={
            "email": "unique-ci-test@example.com", "password": "Pass123456!"
        })
    assert res.status_code in (201, 409)  # 409 if already exists from previous run


@pytest.mark.asyncio
async def test_register_invalid_email():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/register", json={
            "email": "not-an-email", "password": "Pass123456!"
        })
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_rejects_short_password():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/register", json={
            "email": "short-password@example.com", "password": "short"
        })
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_documents_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.get("/api/v1/documents")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_export_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.get("/api/v1/documents/export")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_search_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.get("/api/v1/search?q=test")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_ask_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/ai/ask", json={"question": "test"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_categories_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.get("/api/v1/categories")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_warranties_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.get("/api/v1/warranties")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_reset_password_requires_token():
    # New secure flow requires a token; posting without one is a validation error
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/reset-password", json={
            "new_password": "NewPass123!"
        })
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_reset_password_rejects_invalid_token():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/reset-password", json={
            "token": "not-a-valid-token", "new_password": "NewPass123!"
        })
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_forgot_password_is_generic():
    # Must not reveal whether an email is registered (no enumeration)
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/forgot-password", json={
            "email": "definitely-not-registered@example.com"
        })
    assert res.status_code == 200
    assert "reset link" in res.json()["message"].lower()


@pytest.mark.asyncio
async def test_delete_account_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.delete("/api/v1/auth/account")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_refresh_rejects_invalid_token():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/refresh", json={"refresh_token": "not-valid"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_oauth_google_unconfigured_returns_501():
    # No GOOGLE_CLIENT_ID in the test environment
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.get("/api/v1/auth/oauth/google")
    assert res.status_code == 501


@pytest.mark.asyncio
async def test_oauth_callback_bad_state_redirects_with_error():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.get("/api/v1/auth/oauth/google/callback?code=x&state=bad")
    assert res.status_code == 307
    assert "error=invalid_state" in res.headers["location"]


@pytest.mark.asyncio
async def test_ai_status_reports_providers():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.get("/api/v1/ai/status")
    assert res.status_code == 200
    body = res.json()
    for key in ("groq", "gemini", "ollama", "ocr_backend", "mode"):
        assert key in body


@pytest.mark.asyncio
async def test_auth_providers_reports_google_unset(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.get("/api/v1/auth/providers")
    assert res.status_code == 200
    assert res.json() == {"google": False}


@pytest.mark.asyncio
async def test_auth_providers_reports_google_only_when_fully_configured(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        half = await c.get("/api/v1/auth/providers")
        monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "client-secret")
        both = await c.get("/api/v1/auth/providers")
    assert half.json() == {"google": False}
    assert both.json() == {"google": True}


PASSWORD_MESSAGE = (
    "Use at least 8 characters with an uppercase letter, a lowercase letter, "
    "a number and a special character."
)

WEAK_PASSWORDS = [
    "Short1!",  # fewer than 8 characters
    "pass123456!",  # no uppercase letter
    "PASS123456!",  # no lowercase letter
    "Password!!!",  # no number
    "Pass123456",  # no special character
    "Aa1!" + "x" * 125,  # more than 128 characters
]


def _messages(res) -> str:
    return " ".join(item["msg"] for item in res.json()["detail"])


@pytest.mark.asyncio
@pytest.mark.parametrize("password", WEAK_PASSWORDS)
async def test_register_enforces_the_password_rules(password):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/register", json={
            "email": "weak-password@example.com", "password": password
        })
    assert res.status_code == 422
    assert PASSWORD_MESSAGE in _messages(res)


@pytest.mark.asyncio
async def test_register_accepts_a_compliant_password(monkeypatch):
    import uuid

    from app.services import email_service

    monkeypatch.setattr(email_service, "send_verification_email", lambda *args: None)
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/register", json={
            "email": f"compliant-{uuid.uuid4()}@example.com", "password": "Pass123456!"
        })
    assert res.status_code == 201


@pytest.mark.asyncio
@pytest.mark.parametrize("password", WEAK_PASSWORDS)
async def test_reset_enforces_the_password_rules(password):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/reset-password", json={
            "token": "not-a-valid-token", "new_password": password
        })
    assert res.status_code == 422
    assert PASSWORD_MESSAGE in _messages(res)


@pytest.mark.asyncio
async def test_reset_with_a_compliant_password_reaches_the_token_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/reset-password", json={
            "token": "not-a-valid-token", "new_password": "NewPass123!"
        })
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_login_still_accepts_an_older_weak_password():
    import uuid

    from app.dependencies import async_session
    from app.models.base import User
    from app.rate_limit import limiter
    from app.services.auth_service import hash_password

    limiter.reset()
    email = f"older-{uuid.uuid4()}@example.com"
    async with async_session() as db:
        db.add(User(email=email, hashed_password=hash_password("pass123456"), is_verified=True))
        await db.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/login", json={"email": email, "password": "pass123456"})
    assert res.status_code == 200
    assert res.json()["access_token"]


@pytest.mark.asyncio
async def test_a_blank_title_is_rejected_and_a_padded_one_is_trimmed():
    from sqlalchemy import select

    from app.dependencies import async_session
    from app.models.base import Document
    from app.services.auth_service import create_access_token
    from tests.accounts import create_users_and_document, delete_users

    owner_id, other_id, document_id = await create_users_and_document()
    headers = {"Authorization": f"Bearer {create_access_token(owner_id)}"}
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            blank = await c.patch(f"/api/v1/documents/{document_id}", headers=headers, json={"title": "   "})
            padded = await c.patch(
                f"/api/v1/documents/{document_id}", headers=headers, json={"title": "  October bill  "}
            )
            untouched = await c.patch(f"/api/v1/documents/{document_id}", headers=headers, json={"brand": "Acme"})
        assert blank.status_code == 422
        assert "Title cannot be blank." in _messages(blank)
        assert padded.status_code == 200
        assert padded.json()["title"] == "October bill"
        assert untouched.status_code == 200
        assert untouched.json()["title"] == "October bill"
        async with async_session() as db:
            row = (await db.execute(select(Document).where(Document.id == document_id))).scalar_one()
            assert row.title == "October bill"
    finally:
        await delete_users(owner_id, other_id)
