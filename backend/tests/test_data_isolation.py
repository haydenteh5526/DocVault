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
                await client.post(f"/api/v1/documents/{document_id}/refresh-details", headers=headers),
                await client.delete(f"/api/v1/documents/{document_id}", headers=headers),
            ]
        assert [response.status_code for response in responses] == [404, 404, 404, 404, 404]

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
async def test_overview_shows_another_account_nothing():
    bill = "Electricity bill\nTotal amount due: EUR 123.47\nPayment due date: 23 November 2026"
    owner_id, other_id, bill_id = await create_users_and_document(raw_text=bill)
    async with async_session() as db:
        failed = Document(user_id=owner_id, title="Owner failed", s3_key_original=f"users/{owner_id}/f.pdf",
                          processing_status="failed", document_type="Receipt")
        mine = Document(user_id=other_id, title="Other's manual", s3_key_original=f"users/{other_id}/m.pdf",
                        processing_status="complete", document_type="Manual")
        db.add_all([failed, mine])
        await db.commit()
        failed_id, mine_id = failed.id, mine.id
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            owner = await client.get(
                "/api/v1/overview", headers={"Authorization": f"Bearer {create_access_token(owner_id)}"}
            )
            other = await client.get(
                "/api/v1/overview", headers={"Authorization": f"Bearer {create_access_token(other_id)}"}
            )
        assert owner.status_code == other.status_code == 200
        assert owner.json()["attention_count"] == 2
        body = other.json()
        assert set(body["statuses"]) == {str(mine_id)}
        assert body["attention"] == [] and body["attention_count"] == 0
        assert body["upcoming"] == [] and body["next_after_window"] is None
        assert [doc["id"] for doc in body["recent"]] == [str(mine_id)]
        assert body["counts"] == {"total": 1, "Manual": 1}
        assert body["processing"] == 0
        assert str(bill_id) not in other.text and str(failed_id) not in other.text
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
