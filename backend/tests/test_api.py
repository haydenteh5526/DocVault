"""
API tests. Run in CI with a dedicated database (not inside running container).
For local testing, stop the API first: docker compose stop api
Then run: docker compose run --rm api pytest tests/ -v
"""
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

BASE = "http://test"


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
            "email": "unique-ci-test@example.com", "password": "pass123456"
        })
    assert res.status_code in (201, 409)  # 409 if already exists from previous run


@pytest.mark.asyncio
async def test_register_invalid_email():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/register", json={
            "email": "not-an-email", "password": "pass123456"
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
            "new_password": "newpass123"
        })
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_reset_password_rejects_invalid_token():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.post("/api/v1/auth/reset-password", json={
            "token": "not-a-valid-token", "new_password": "newpass123"
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
