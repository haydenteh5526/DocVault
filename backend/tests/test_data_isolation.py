"""Integration tests proving user-owned resources cannot cross account boundaries."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.dependencies import async_session
from app.main import app
from app.models.base import Document, User
from app.services.auth_service import create_access_token, hash_password

BASE = "http://test"


async def _create_users_and_document():
    owner = User(
        email=f"owner-{uuid.uuid4()}@example.com",
        hashed_password=hash_password("testing123"),
        is_verified=True,
    )
    other = User(
        email=f"other-{uuid.uuid4()}@example.com",
        hashed_password=hash_password("testing123"),
        is_verified=True,
    )
    async with async_session() as db:
        db.add_all([owner, other])
        await db.flush()
        document = Document(
            user_id=owner.id,
            title="Owner only",
            s3_key_original=f"users/{owner.id}/private.pdf",
        )
        db.add(document)
        await db.commit()
        return owner.id, other.id, document.id


async def _delete_users(*user_ids):
    async with async_session() as db:
        for user_id in user_ids:
            user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
            if user:
                await db.delete(user)
        await db.commit()


@pytest.mark.asyncio
async def test_document_endpoints_are_isolated_between_users():
    owner_id, other_id, document_id = await _create_users_and_document()
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
        await _delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_account_deletion_removes_object_prefix(monkeypatch):
    owner_id, other_id, _ = await _create_users_and_document()
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
        await _delete_users(owner_id, other_id)
