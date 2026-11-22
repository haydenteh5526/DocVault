"""Revision 4: old keyword-guess labels, receipts with "Billing", dates and term phrases."""

from datetime import date

from app.models.base import Warranty
from app.services import categorisation_service, document_processor
from app.services.key_dates import extract_key_dates, reviews_bills
from tests.fixtures import household_texts
from tests.test_document_processor import _document, _metadata, _owner_with_document, _process

LEGACY_BROADBAND = (
    "LINKLINE BROADBAND\nBroadband bill\nTotal amount due: EUR 45.00\nPayment due date: 27 November 2026\n"
    "Direct Debit Instruction: your bank will collect the amount due."
)
RECEIPT_WITH_BILLING = (
    "FERNHILL STORE\nReceipt: Fernhill FL14 laptop\nBilling address: 1 Main Street, Dublin\n"
    "Total: EUR 899.00\nDate: 8 January 2026\nWarranty expires: 8 January 2028"
)
GAS_BILL = "Gas bill\nBalance due: EUR 80.00\nPay by 5 December 2026"


# R4-a: a fallback kind replaces an old guess label only with Bill, Receipt, Insurance or Contract.
async def test_a_fallback_bill_replaces_an_old_guess_label(monkeypatch):
    document = _document("My doc", document_type="User Manual")
    await _process(monkeypatch, document, LEGACY_BROADBAND, _metadata(document_type="Bill", kind_source="fallback"))
    assert document.document_type == "Bill"


async def test_a_fallback_manual_or_other_keeps_an_old_guess_label(monkeypatch):
    for guess in ("Manual", "Other", "Warranty"):
        document = _document("My doc", document_type="User Manual")
        await _process(monkeypatch, document, LEGACY_BROADBAND, _metadata(document_type=guess, kind_source="fallback"))
        assert document.document_type == "User Manual"
        assert reviews_bills(document.document_type)


async def test_a_model_kind_still_replaces_an_old_guess_label(monkeypatch):
    document = _document("My doc", document_type="Warranty Card")
    await _process(monkeypatch, document, "text", _metadata(document_type="Manual", kind_source="model"))
    assert document.document_type == "Manual"


async def test_a_kept_old_guess_label_can_still_get_a_warranty(monkeypatch):
    document = _document("laptop.pdf", document_type="Warranty Card")
    database = await _process(
        monkeypatch, document, household_texts.LAPTOP_RECEIPT, _metadata(document_type="Other", kind_source="fallback")
    )
    assert document.document_type == "Warranty Card"
    assert len([item for item in database.added if isinstance(item, Warranty)]) == 1


async def test_an_old_label_bill_refreshed_without_a_key_stays_reviewable(monkeypatch):
    from app.dependencies import async_session
    from app.models.base import Document
    from tests.accounts import delete_users

    monkeypatch.setattr(
        document_processor.categorisation_service, "categorise_document",
        categorisation_service._fallback_categorise,
    )
    owner_id, other_id, document_id = await _owner_with_document(raw_text=LEGACY_BROADBAND, document_type="User Manual")
    try:
        await document_processor.refresh_details(document_id)
        async with async_session() as db:
            stored = (await db.get(Document, document_id)).document_type
        assert reviews_bills(stored)
    finally:
        await delete_users(owner_id, other_id)


# R4-b: a receipt is not typed Bill by the label rule.
def test_a_laptop_receipt_with_a_billing_address_stays_a_receipt():
    metadata = categorisation_service._fallback_categorise(RECEIPT_WITH_BILLING)
    assert metadata.document_type == "Receipt"


async def test_a_laptop_receipt_with_a_billing_address_keeps_its_warranty(monkeypatch):
    metadata = categorisation_service._fallback_categorise(RECEIPT_WITH_BILLING)
    document = _document("laptop.pdf")
    database = await _process(monkeypatch, document, RECEIPT_WITH_BILLING, metadata)
    warranties = [item for item in database.added if isinstance(item, Warranty)]
    assert document.document_type == "Receipt"
    assert len(warranties) == 1 and warranties[0].expiry_date == date(2028, 1, 8)


def test_the_gas_bill_is_still_a_bill():
    assert categorisation_service._fallback_categorise(GAS_BILL).document_type == "Bill"


# R4-c: a remainder that starts with a month name and cannot be read is a conflict.
def test_a_month_first_date_counts_as_a_conflict():
    text = "Car insurance\nRenewal date: 15 January 2027\nRenewal date: January 15, 2027"
    assert extract_key_dates(text, "Insurance") == []


def test_an_abbreviated_month_first_date_counts_as_a_conflict():
    text = "Car insurance\nRenewal date: 15 January 2027\nRenewal date: Feb. 1, 2027"
    assert extract_key_dates(text, "Insurance") == []


# R4-d: the term phrase reads its end date again.
def test_a_term_phrase_with_two_tos_gives_its_end_date():
    text = "TENANCY AGREEMENT\nTerm: Tenancy to run from 1 September 2026 to 31 August 2027"
    [found] = extract_key_dates(text, "Contract")
    assert (found.kind, found.date, found.line) == ("contract_end", date(2027, 8, 31), 2)


def test_the_task_2_term_case_still_reads():
    [found] = extract_key_dates(household_texts.TENANCY, "Contract")
    assert found.date == date(2027, 8, 31)
