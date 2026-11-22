"""Text is scanned for dates only on bills, policies, contracts and unclassified documents."""

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.dependencies import async_session
from app.main import app
from app.models.base import Document
from app.schemas.document import BillConfirmation
from app.services.auth_service import create_access_token
from app.services.bill_review import extract_bill_review
from app.services.bill_revisions import save_revision
from app.services.categorisation_service import KINDS
from app.services.key_dates import LEGACY_GUESS_LABELS, SCANNED_KINDS, reviews_bills, scans_text
from tests.accounts import create_users_and_document, delete_users

# A manual whose sample page happens to look like a bill.
MANUAL_WITH_BILL_WORDS = (
    "Smart meter M3 user manual\nYour electricity invoice and statement show:\n"
    "Total amount due: EUR 45.00\nPayment due date: 20 November 2026"
)


@pytest.mark.parametrize("kind", ["Bill", "Insurance", "Contract", None, "", "  ", "Monthly bill", "Utility statement",
                                  "Car insurance policy", "Tenancy agreement"])
def test_scanned_kinds_and_unclassified_are_read(kind):
    assert scans_text(kind) is True


@pytest.mark.parametrize("kind", ["Manual", "Receipt", "Warranty", "Other", "Sales Receipt", "Instruction manual",
                                  "Warranty certificate", "Bin calendar"])
def test_other_kinds_are_never_read(kind):
    # Legacy free-text kinds are classified first (R2-a).
    assert scans_text(kind) is False


@pytest.mark.parametrize("kind", ["User Manual", "Warranty Card", "Quick Start Guide", "Specification Sheet"])
def test_old_keyword_guesses_count_as_unclassified(kind):
    # The pre-PR 1 fallback wrote these four from word fragments that real bills carry (R3-a).
    assert kind in LEGACY_GUESS_LABELS
    assert scans_text(kind) is True
    assert reviews_bills(kind) is True


@pytest.mark.parametrize("kind, expected", [
    ("Bill", True), ("Monthly bill", True), (None, True), ("", True),
    ("Insurance", False), ("Contract", False), ("Manual", False), ("Receipt", False), ("Warranty", False),
    ("Other", False), ("Sales Receipt", False), ("Car insurance policy", False),
])
def test_only_bills_and_unclassified_documents_get_a_bill_review(kind, expected):
    assert reviews_bills(kind) is expected


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


INSURANCE_RENEWAL_STATEMENT = (
    "EXAMPLE INSURANCE\nRenewal statement\nAmount payable: EUR 310.00\nRenewal date: 12 December 2026"
)


@pytest.mark.asyncio
async def test_an_insurance_renewal_statement_has_no_bill_review():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=INSURANCE_RENEWAL_STATEMENT)
    try:
        assert await _bill_review(document_id, owner_id, "Insurance") is None
        assert await _bill_review(document_id, owner_id, None) is not None
    finally:
        await delete_users(owner_id, other_id)


# A broadband bill the old keyword guesser stored as "User Manual" because of its direct debit line.
LEGACY_BROADBAND = (
    "LINKLINE BROADBAND\nBroadband bill\nTotal amount due: EUR 45.00\nPayment due date: 27 November 2026\n"
    "Direct Debit Instruction: your bank will collect the amount due."
)


@pytest.mark.asyncio
async def test_a_bill_stored_with_an_old_guess_label_gets_a_bill_review():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=LEGACY_BROADBAND)
    try:
        review = await _bill_review(document_id, owner_id, "User Manual")
        assert review["amount_due"]["value"] == "45.00"
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_a_confirmed_bill_keeps_its_review_whatever_its_kind_became():
    text = "Electricity bill\nTotal amount due: EUR 123.47\nPayment due date: 23 November 2026"
    owner_id, other_id, document_id = await create_users_and_document(raw_text=text)
    try:
        async with async_session() as db:
            doc = (await db.execute(select(Document).where(Document.id == document_id))).scalar_one()
            await save_revision(db, doc, BillConfirmation(
                amount_due="123.47", due_date=date(2026, 11, 23), billing_period_start=date(2026, 10, 1),
                billing_period_end=date(2026, 10, 31), reviewed=extract_bill_review(text), base_revision=0,
            ))
        review = await _bill_review(document_id, owner_id, "Other")
        assert review is not None and review["amount_due"]["value"] == "123.47"
    finally:
        await delete_users(owner_id, other_id)
