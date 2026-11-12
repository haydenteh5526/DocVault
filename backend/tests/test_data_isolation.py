"""Integration tests proving user-owned resources cannot cross account boundaries."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.dependencies import async_session
from app.main import app
from app.models.base import Document, User
from app.services.auth_service import create_access_token
from tests.accounts import create_users_and_document, delete_users

BASE = "http://test"


@pytest.mark.asyncio
async def test_document_endpoints_are_isolated_between_users():
    owner_id, other_id, document_id = await create_users_and_document()
    headers = {"Authorization": f"Bearer {create_access_token(other_id)}"}
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            responses = [
                await client.get(f"/api/v1/documents/{document_id}", headers=headers),
                await client.patch(f"/api/v1/documents/{document_id}", headers=headers, json={"title": "stolen"}),
                await client.get(f"/api/v1/documents/{document_id}/share", headers=headers),
                await client.delete(f"/api/v1/documents/{document_id}", headers=headers),
            ]
        assert [response.status_code for response in responses] == [404, 404, 404, 404]

        async with async_session() as db:
            document = (
                await db.execute(select(Document).where(Document.id == document_id))
            ).scalar_one_or_none()
            assert document is not None
            assert document.title == "Owner only"
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_similar_documents_requires_ownership_of_the_source_document():
    owner_id, other_id, document_id = await create_users_and_document()
    url = f"/api/v1/documents/{document_id}/similar"
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            owner_response = await client.get(
                url, headers={"Authorization": f"Bearer {create_access_token(owner_id)}"}
            )
            other_response = await client.get(
                url, headers={"Authorization": f"Bearer {create_access_token(other_id)}"}
            )
        assert owner_response.status_code == 200
        assert owner_response.json() == {"similar": []}
        assert other_response.status_code == 404
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_account_deletion_removes_object_prefix(monkeypatch):
    owner_id, other_id, _ = await create_users_and_document()
    deleted_prefixes = []
    monkeypatch.setattr(
        "app.services.storage_service.delete_user_files",
        lambda user_id: deleted_prefixes.append(user_id) or 1,
    )
    try:
        headers = {"Authorization": f"Bearer {create_access_token(owner_id)}"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            response = await client.delete("/api/v1/auth/account", headers=headers)
        assert response.status_code == 204
        assert deleted_prefixes == [str(owner_id)]

        async with async_session() as db:
            owner = (await db.execute(select(User).where(User.id == owner_id))).scalar_one_or_none()
            assert owner is None
    finally:
        await delete_users(owner_id, other_id)
