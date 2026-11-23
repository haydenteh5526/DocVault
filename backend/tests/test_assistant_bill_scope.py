"""DocBot's bill list uses the same rule as the bill page and the overview (R2-b, R2-c)."""

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select, update

from app.dependencies import async_session
from app.models.base import Document
from app.schemas.document import BillConfirmation
from app.services.assistant.bills import MAX_BILLS, owner_bills
from app.services.bill_review import extract_bill_review
from app.services.bill_revisions import save_revision
from tests.accounts import create_users_and_document, delete_users

BILL = "Electricity bill\nTotal amount due: EUR 123.47\nPayment due date: 23 November 2026"
VAT_RECEIPT = "FERNHILL STORE\nVAT invoice\nAmount due: EUR 899.00"


async def _add(user_id, title, text, kind, minutes):
    async with async_session() as db:
        doc = Document(user_id=user_id, title=title, raw_text=text, document_type=kind,
                       processing_status="complete", s3_key_original=f"users/{user_id}/{uuid.uuid4()}.pdf",
                       created_at=datetime.utcnow() + timedelta(minutes=minutes))
        db.add(doc)
        await db.commit()
        return doc.id


async def _bills(user_id):
    async with async_session() as db:
        return [bill.document.id for bill in await owner_bills(db, user_id)]


async def test_a_receipt_with_bill_words_is_not_offered_and_takes_no_place():
    owner_id, other_id, _ = await create_users_and_document()
    try:
        bills = [await _add(owner_id, f"Bill {n}", BILL, "Bill", n) for n in range(MAX_BILLS)]
        receipt = await _add(owner_id, "Laptop receipt", VAT_RECEIPT, "Receipt", MAX_BILLS + 1)
        policy = await _add(owner_id, "Insurance renewal",
                            "Renewal statement\nAmount payable: EUR 310.00", "Insurance", MAX_BILLS + 2)

        offered = await _bills(owner_id)

        assert receipt not in offered and policy not in offered
        assert sorted(offered, key=str) == sorted(bills, key=str)
    finally:
        await delete_users(owner_id, other_id)


async def test_a_confirmed_bill_whose_kind_changed_is_still_offered():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    try:
        async with async_session() as db:
            doc = (await db.execute(select(Document).where(Document.id == document_id))).scalar_one()
            await save_revision(db, doc, BillConfirmation(
                amount_due="123.47", due_date=date(2026, 11, 23), billing_period_start=date(2026, 10, 1),
                billing_period_end=date(2026, 10, 31), reviewed=extract_bill_review(BILL), base_revision=0,
            ))
        async with async_session() as db:
            await db.execute(update(Document).where(Document.id == document_id).values(document_type="Other"))
            await db.commit()

        assert await _bills(owner_id) == [document_id]
    finally:
        await delete_users(owner_id, other_id)


async def test_a_bill_stored_with_an_old_guess_label_is_offered():
    owner_id, other_id, _ = await create_users_and_document()
    try:
        text = BILL + "\nDirect Debit Instruction: your bank collects the amount due."
        bill = await _add(owner_id, "Broadband bill", text, "User Manual", 1)
        assert await _bills(owner_id) == [bill]
    finally:
        await delete_users(owner_id, other_id)
