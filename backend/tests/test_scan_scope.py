"""Text is scanned for dates only on bills, policies, contracts and unclassified documents."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update

from app.dependencies import async_session
from app.main import app
from app.models.base import Document
from app.services.auth_service import create_access_token
from app.services.categorisation_service import KINDS
from app.services.key_dates import SCANNED_KINDS, scans_text
from tests.accounts import create_users_and_document, delete_users

# A manual whose sample page happens to look like a bill.
MANUAL_WITH_BILL_WORDS = (
    "Smart meter M3 user manual\nYour electricity invoice and statement show:\n"
    "Total amount due: EUR 45.00\nPayment due date: 20 November 2026"
)


@pytest.mark.parametrize("kind", ["Bill", "Insurance", "Contract", None, "", "Sales Receipt", "Utility statement"])
def test_scanned_kinds_and_unclassified_are_read(kind):
    assert scans_text(kind) is True


@pytest.mark.parametrize("kind", ["Manual", "Receipt", "Warranty", "Other"])
def test_other_kinds_are_never_read(kind):
    assert scans_text(kind) is False


def test_scanned_kinds_are_fixed_kinds():
    assert SCANNED_KINDS == {"Bill", "Insurance", "Contract"}
    assert SCANNED_KINDS <= set(KINDS)


async def _bill_review(document_id, owner_id, kind):
    async with async_session() as db:
        await db.execute(update(Document).where(Document.id == document_id).values(document_type=kind))
        await db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(owner_id)}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/v1/documents/{document_id}", headers=headers)
    assert response.status_code == 200
    return response.json()["bill_review"]


@pytest.mark.asyncio
async def test_a_manual_with_bill_words_has_no_bill_review_but_a_bill_does():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=MANUAL_WITH_BILL_WORDS)
    try:
        assert await _bill_review(document_id, owner_id, "Manual") is None
        review = await _bill_review(document_id, owner_id, "Bill")
        assert review["amount_due"]["value"] == "45.00"
        assert review["due_date"]["value"] == "2026-11-20"
    finally:
        await delete_users(owner_id, other_id)
