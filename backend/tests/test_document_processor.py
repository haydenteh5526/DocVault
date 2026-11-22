import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.config import settings
from app.models.base import DocChunk, Warranty
from app.services import document_processor, retry


class _Result:
    def __init__(self, *, scalar=None, rows=None):
        self.scalar = scalar
        self.rows = rows or []

    def scalar_one_or_none(self):
        return self.scalar

    def scalars(self):
        return self

    def all(self):
        return self.rows


class _Database:
    def __init__(self, *results):
        self.results = iter(results)
        self.added = []
        self.deleted = []
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, statement):
        return next(self.results)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1

    async def delete(self, value):
        self.deleted.append(value)

    def add(self, value):
        self.added.append(value)


class _SessionContext:
    def __init__(self, database):
        self.database = database

    async def __aenter__(self):
        return self.database

    async def __aexit__(self, exc_type, exc, traceback):
        return False


async def _inline_to_thread(function, *args):
    return function(*args)


def test_run_ocr_and_metadata_preprocesses_images(monkeypatch):
    calls = []
    metadata = SimpleNamespace(brand="Brand")
    monkeypatch.setattr(document_processor.image_processing, "preprocess_image", lambda value: b"processed")
    monkeypatch.setattr(
        document_processor.ocr_service,
        "extract_text",
        lambda value, mime: calls.append((value, mime)) or "text",
    )
    monkeypatch.setattr(document_processor.categorisation_service, "categorise_document", lambda text: metadata)

    assert document_processor._run_ocr_and_metadata(b"original", "image/png") == ("text", metadata)
    assert calls == [(b"processed", "image/png")]


def test_run_ocr_and_metadata_does_not_preprocess_pdf(monkeypatch):
    monkeypatch.setattr(
        document_processor.image_processing,
        "preprocess_image",
        lambda value: (_ for _ in ()).throw(AssertionError("PDF should not be preprocessed")),
    )
    monkeypatch.setattr(document_processor.ocr_service, "extract_text", lambda value, mime: value.decode())
    monkeypatch.setattr(
        document_processor.categorisation_service,
        "categorise_document",
        lambda text: SimpleNamespace(title=text),
    )
    raw_text, metadata = document_processor._run_ocr_and_metadata(b"pdf", "application/pdf")
    assert raw_text == "pdf"
    assert metadata.title == "pdf"


async def test_process_document_returns_when_record_is_missing(monkeypatch):
    database = _Database(_Result(scalar=None))
    monkeypatch.setattr(document_processor, "async_session", lambda: _SessionContext(database))
    await document_processor.process_document(uuid.uuid4())
    assert database.commits == 0


async def test_process_document_completes_full_pipeline(monkeypatch):
    document_id = uuid.uuid4()
    document = SimpleNamespace(
        id=document_id,
        s3_key_original="users/u/doc.png",
        title="Untitled",
        raw_text=None,
        brand=None,
        model=None,
        document_type=None,
        summary=None,
        processing_status="pending",
    )
    old_chunk = SimpleNamespace(id="old")
    database = _Database(
        _Result(scalar=document),
        _Result(rows=[old_chunk]),
        _Result(scalar=None),
    )
    metadata = SimpleNamespace(
        brand="Dreo",
        model="DR-1",
        document_type="Manual",
        title="Dreo DR-1 Manual",
        summary=None,
    )
    monkeypatch.setattr(document_processor, "async_session", lambda: _SessionContext(database))
    monkeypatch.setattr(document_processor.asyncio, "to_thread", _inline_to_thread)
    monkeypatch.setattr(document_processor.storage_service, "download_file", lambda key: (b"file", "image/png"))
    monkeypatch.setattr(document_processor, "_run_ocr_and_metadata", lambda *args: ("manual text", metadata))
    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "key")
    monkeypatch.setattr(document_processor, "_generate_summary", lambda text: "summary")
    monkeypatch.setattr(
        document_processor.chunking_service,
        "chunk_text",
        lambda text: [
            {"text": "first", "section_title": "A"},
            {"text": "second", "section_title": None},
        ],
    )
    monkeypatch.setattr(document_processor.embedding_service, "get_embeddings", lambda texts: [[0.1], [0.2]])
    monkeypatch.setattr(
        document_processor.warranty_extraction,
        "extract_warranty_dates",
        lambda text: {"purchase_date": "2025-01-01", "expiry_date": "2027-01-01"},
    )

    await document_processor.process_document(document_id)

    assert document.processing_status == "complete"
    assert (document.title, document.brand, document.model, document.document_type) == (
        "Dreo DR-1 Manual",
        "Dreo",
        "DR-1",
        "Manual",
    )
    assert document.raw_text == "manual text"
    assert document.summary == "summary"
    assert database.deleted == [old_chunk]
    assert len([item for item in database.added if isinstance(item, DocChunk)]) == 2
    assert len([item for item in database.added if isinstance(item, Warranty)]) == 1
    assert database.commits == 2


async def test_process_document_preserves_title_and_existing_warranty(monkeypatch):
    document = SimpleNamespace(
        id=uuid.uuid4(),
        s3_key_original="doc.pdf",
        title="Custom title",
        raw_text=None,
        brand=None,
        model=None,
        document_type=None,
        summary=None,
        processing_status="pending",
    )
    database = _Database(_Result(scalar=document), _Result(rows=[]), _Result(scalar=object()))
    metadata = SimpleNamespace(brand=None, model=None, document_type=None, title="Generated", summary=None)
    monkeypatch.setattr(document_processor, "async_session", lambda: _SessionContext(database))
    monkeypatch.setattr(document_processor.asyncio, "to_thread", _inline_to_thread)
    monkeypatch.setattr(document_processor.storage_service, "download_file", lambda key: (b"pdf", "application/pdf"))
    monkeypatch.setattr(document_processor, "_run_ocr_and_metadata", lambda *args: ("text", metadata))
    monkeypatch.setattr(document_processor, "_generate_summary", lambda text: None)
    monkeypatch.setattr(
        document_processor.chunking_service,
        "chunk_text",
        lambda text: [{"text": "chunk", "section_title": None}],
    )
    monkeypatch.setattr(document_processor.embedding_service, "get_embeddings", lambda texts: [[0.1]])
    monkeypatch.setattr(
        document_processor.warranty_extraction,
        "extract_warranty_dates",
        lambda text: {"purchase_date": None, "expiry_date": None},
    )

    await document_processor.process_document(document.id)

    assert document.title == "Custom title"
    assert not any(isinstance(item, Warranty) for item in database.added)


async def test_process_document_marks_failure_in_fresh_transaction(monkeypatch):
    document = SimpleNamespace(id=uuid.uuid4(), s3_key_original="missing", processing_status="pending")
    failed = SimpleNamespace(processing_status="processing")
    database = _Database(_Result(scalar=document), _Result(scalar=failed))
    monkeypatch.setattr(document_processor, "async_session", lambda: _SessionContext(database))
    monkeypatch.setattr(document_processor.asyncio, "to_thread", _inline_to_thread)
    monkeypatch.setattr(
        document_processor.storage_service,
        "download_file",
        lambda key: (_ for _ in ()).throw(RuntimeError("storage unavailable")),
    )

    with pytest.raises(RuntimeError, match="storage unavailable"):
        await document_processor.process_document(document.id)

    assert database.rollbacks == 1
    assert failed.processing_status == "failed"
    assert database.commits == 2


def test_no_key_stores_no_summary(monkeypatch):
    for key in ("MISTRAL_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.setattr(settings, key, "")
    assert document_processor._generate_summary("text") is None
    assert document_processor._generate_summary("x" * 250) is None


def test_generate_summary_accepts_fenced_mistral_json(monkeypatch):
    payload = '{"overview":"Useful","key_topics":[],"specifications":[],"safety_warnings":[],"quick_facts":[]}'

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": f"```json\n{payload}\n```"}}]}

    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "key")
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: Response())
    monkeypatch.setattr(retry, "with_retry", lambda fn, **kwargs: fn())
    assert document_processor._generate_summary("manual") == payload


def test_generate_summary_returns_none_on_invalid_provider_response(monkeypatch):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "not json"}}]}

    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "key")
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: Response())
    monkeypatch.setattr(retry, "with_retry", lambda fn, **kwargs: fn())
    assert document_processor._generate_summary("manual") is None


# --- Titles (Task 2) ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        (None, True),
        ("", True),
        ("   ", True),
        ("Untitled", True),
        ("synthetic-broadband-bill.pdf", True),
        ("Scan.JPG", True),
        ("photo.jpeg", True),
        ("receipt.png", True),
        ("receipt.WEBP", True),
        ("My broadband", False),
        ("Linkline Broadband bill — November 2026", False),
        ("notes.txt", False),
    ],
)
def test_looks_like_upload_name(title, expected):
    assert document_processor.looks_like_upload_name(title) is expected


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("synthetic-broadband-bill.pdf", "Synthetic broadband bill"),
        ("Example Energy — October 2026.png", "Example Energy — October 2026"),
        ("my_scan_2026.jpeg", "My scan 2026"),
        ("--.pdf", None),
        (".png", None),
    ],
)
def test_tidy_filename(title, expected):
    assert document_processor.tidy_filename(title) == expected


def _document(title, **extra):
    values = dict(
        id=uuid.uuid4(),
        s3_key_original="users/u/doc.pdf",
        title=title,
        raw_text=None,
        brand=None,
        model=None,
        document_type=None,
        summary=None,
        processing_status="pending",
    )
    values.update(extra)
    return SimpleNamespace(**values)


async def _process(monkeypatch, document, text, metadata, *, existing_warranty=None):
    database = _Database(_Result(scalar=document), _Result(rows=[]), _Result(scalar=existing_warranty))
    monkeypatch.setattr(document_processor, "async_session", lambda: _SessionContext(database))
    monkeypatch.setattr(document_processor.asyncio, "to_thread", _inline_to_thread)
    monkeypatch.setattr(document_processor.storage_service, "download_file", lambda key: (b"file", "application/pdf"))
    monkeypatch.setattr(document_processor, "_run_ocr_and_metadata", lambda *args: (text, metadata))
    monkeypatch.setattr(
        document_processor.chunking_service,
        "chunk_text",
        lambda value: [{"text": "chunk", "section_title": None}] if value else [],
    )
    monkeypatch.setattr(document_processor.embedding_service, "get_embeddings", lambda texts: [[0.1] for _ in texts])
    await document_processor.process_document(document.id)
    return database


def _metadata(**extra):
    values = dict(brand=None, model=None, document_type="Bill", title=None, summary=None)
    values.update(extra)
    return SimpleNamespace(**values)


async def test_an_upload_name_becomes_the_suggested_title(monkeypatch):
    document = _document("synthetic-broadband-bill.pdf")
    await _process(
        monkeypatch, document, "LINKLINE BROADBAND bill",
        _metadata(title="Linkline Broadband bill — November 2026"),
    )
    assert document.title == "Linkline Broadband bill — November 2026"


async def test_without_a_provider_the_filename_is_tidied(monkeypatch):
    document = _document("synthetic-broadband-bill.pdf")
    await _process(monkeypatch, document, "LINKLINE BROADBAND bill", _metadata(title=None))
    assert document.title == "Synthetic broadband bill"


async def test_a_suggested_title_with_an_extension_is_cleaned(monkeypatch):
    document = _document("scan.pdf")
    await _process(monkeypatch, document, "text", _metadata(title="Fernhill receipt.pdf"))
    assert document.title == "Fernhill receipt"


async def test_a_renamed_title_is_kept_even_when_a_suggestion_exists(monkeypatch):
    document = _document("My broadband")
    await _process(monkeypatch, document, "text", _metadata(title="Linkline Broadband bill"))
    assert document.title == "My broadband"


async def test_an_image_with_no_text_keeps_its_uploaded_title(monkeypatch):
    document = _document("Row height check.png")
    await _process(monkeypatch, document, "", _metadata(title="Anything"))
    assert document.title == "Row height check.png"


async def test_an_owner_title_that_ends_in_pdf_is_treated_as_an_upload_name(monkeypatch):
    # Known edge, accepted in the plan.
    document = _document("My broadband.pdf")
    await _process(monkeypatch, document, "text", _metadata(title="Linkline Broadband bill"))
    assert document.title == "Linkline Broadband bill"


async def test_reprocessing_keeps_a_set_kind_brand_and_model(monkeypatch):
    document = _document("My doc", document_type="Manual", brand="Owner brand", model="Owner model")
    await _process(
        monkeypatch, document, "text",
        _metadata(document_type="Bill", brand="Model brand", model="M1"),
    )
    assert (document.document_type, document.brand, document.model) == ("Manual", "Owner brand", "Owner model")


async def test_reprocessing_replaces_a_legacy_free_text_kind(monkeypatch):
    document = _document("My doc", document_type="Sales Receipt")
    await _process(monkeypatch, document, "text", _metadata(document_type="Receipt"))
    assert document.document_type == "Receipt"


# --- Warranties (Task 3) -----------------------------------------------------------------------


async def test_a_kettle_receipt_creates_no_warranty(monkeypatch):
    from tests.fixtures import household_texts

    document = _document("Kettle receipt.png")
    database = await _process(monkeypatch, document, household_texts.KETTLE_RECEIPT, _metadata(document_type="Receipt"))
    assert not any(isinstance(item, Warranty) for item in database.added)


async def test_a_purchase_date_alone_creates_no_warranty(monkeypatch):
    monkeypatch.setattr(
        document_processor.warranty_extraction,
        "extract_warranty_dates",
        lambda text: {"purchase_date": "2026-01-08", "expiry_date": None},
    )
    document = _document("receipt.pdf")
    database = await _process(monkeypatch, document, "text", _metadata())
    assert not any(isinstance(item, Warranty) for item in database.added)


async def test_the_laptop_receipt_creates_a_warranty_with_its_end_date(monkeypatch):
    from datetime import date

    from tests.fixtures import household_texts

    document = _document("laptop.pdf")
    database = await _process(monkeypatch, document, household_texts.LAPTOP_RECEIPT, _metadata(document_type="Receipt"))
    warranties = [item for item in database.added if isinstance(item, Warranty)]
    assert len(warranties) == 1
    assert (warranties[0].purchase_date, warranties[0].expiry_date) == (date(2026, 1, 8), date(2028, 1, 8))


async def test_an_existing_warranty_keeps_set_dates_and_only_fills_empty_ones(monkeypatch):
    from datetime import date

    from tests.fixtures import household_texts

    existing = SimpleNamespace(purchase_date=None, expiry_date=date(2027, 5, 1), notes="Owner note")
    document = _document("laptop.pdf")
    database = await _process(
        monkeypatch, document, household_texts.LAPTOP_RECEIPT, _metadata(), existing_warranty=existing,
    )
    assert not any(isinstance(item, Warranty) for item in database.added)
    assert existing.expiry_date == date(2027, 5, 1)
    assert existing.purchase_date == date(2026, 1, 8)
    assert existing.notes == "Owner note"


# --- Summaries (Task 4) ------------------------------------------------------------------------

_GEMINI_SUMMARY = "Linkline Broadband bill for November 2026. EUR 45.00 is due on 20 November 2026."


def _keys(monkeypatch, *, gemini="", mistral=""):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", gemini)
    monkeypatch.setattr(settings, "MISTRAL_API_KEY", mistral)


async def test_a_gemini_only_setup_stores_the_extraction_summary(monkeypatch):
    from google import genai

    _keys(monkeypatch, gemini="key")
    monkeypatch.setattr(retry, "with_retry", lambda fn, **kwargs: fn())

    class Models:
        def generate_content(self, **kwargs):
            return SimpleNamespace(text=(
                '{"kind":"Bill","title":"Linkline Broadband bill \u2014 November 2026",'
                f'"brand":null,"model":null,"summary":"{_GEMINI_SUMMARY}"}}'
            ))

    monkeypatch.setattr(genai, "Client", lambda **kwargs: SimpleNamespace(models=Models()))
    monkeypatch.setattr(
        document_processor, "_generate_summary",
        lambda text: (_ for _ in ()).throw(AssertionError("no second model call")),
    )
    metadata = document_processor.categorisation_service.categorise_document("LINKLINE BROADBAND bill")
    document = _document("synthetic-broadband-bill.pdf")
    await _process(monkeypatch, document, "LINKLINE BROADBAND bill", metadata)
    assert document.summary == _GEMINI_SUMMARY
    assert document.document_type == "Bill"


async def test_with_a_mistral_key_the_mistral_summary_is_stored(monkeypatch):
    _keys(monkeypatch, gemini="key", mistral="key")
    payload = '{"overview":"From Mistral","key_topics":[],"specifications":[],"safety_warnings":[],"quick_facts":[]}'
    monkeypatch.setattr(document_processor, "_generate_summary", lambda text: payload)
    document = _document("bill.pdf")
    await _process(monkeypatch, document, "text", _metadata(summary="From the extraction"))
    assert document.summary == payload


async def test_with_no_key_the_summary_is_none(monkeypatch):
    _keys(monkeypatch)
    document = _document("bill.pdf")
    metadata = document_processor.categorisation_service.categorise_document("Electricity bill. Amount due EUR 5")
    await _process(monkeypatch, document, "Electricity bill. Amount due EUR 5", metadata)
    assert document.summary is None
    assert document.document_type == "Bill"


# --- Read details again (Task 5), against the database -----------------------------------------


_LAPTOP_TEXT = (
    "FERNHILL STORE\nReceipt: Fernhill FL14 laptop, EUR 899.00\nDate: 8 January 2026\n"
    "2-year manufacturer warranty included.\nWarranty expires: 8 January 2028\n"
    "Text corrected by the owner."
)


def _suggestion(**extra):
    from app.services.categorisation_service import DocumentMetadata

    values = dict(
        brand="Suggested brand",
        model="Suggested model",
        document_type="Bill",
        title="Suggested title",
        summary="A suggested summary of the document.",
    )
    values.update(extra)
    return DocumentMetadata(**values)


async def _owner_with_document(**document_fields):
    from app.dependencies import async_session
    from app.models.base import Document
    from tests.accounts import create_users_and_document

    owner_id, other_id, document_id = await create_users_and_document(raw_text=_LAPTOP_TEXT)
    async with async_session() as db:
        document = await db.get(Document, document_id)
        for key, value in document_fields.items():
            setattr(document, key, value)
        await db.commit()
    return owner_id, other_id, document_id


async def _counts(document_id):
    from sqlalchemy import func, select

    from app.dependencies import async_session
    from app.models.base import BillRevision, BillSplit, Reminder, ReminderProposal

    async with async_session() as db:
        return {
            model.__tablename__: (
                await db.execute(select(func.count()).select_from(model).where(model.document_id == document_id))
            ).scalar_one()
            for model in (BillRevision, BillSplit, ReminderProposal, Reminder)
        }


async def test_refresh_details_keeps_everything_the_owner_set(monkeypatch):
    from datetime import date

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.dependencies import async_session
    from app.models.base import (
        BillRevision,
        BillSplit,
        Category,
        Document,
        Reminder,
        ReminderProposal,
        Tag,
    )
    from tests.accounts import delete_users

    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "")
    monkeypatch.setattr(document_processor.categorisation_service, "categorise_document", lambda text: _suggestion())
    owner_id, other_id, document_id = await _owner_with_document(
        title="My laptop", document_type="Receipt", brand="Fernhill", model="FL14",
        summary="Old summary", is_favourite=True,
    )
    try:
        async with async_session() as db:
            category = Category(user_id=owner_id, name="Electronics")
            tag = Tag(user_id=owner_id, name="keep")
            db.add_all([category, tag])
            await db.flush()
            document = (await db.execute(
                select(Document).where(Document.id == document_id).options(selectinload(Document.tags))
            )).scalar_one()
            document.category_id = category.id
            document.tags.append(tag)
            revision = BillRevision(
                document_id=document_id, revision_number=1, amount_due_cents=89900,
                due_date=date(2026, 2, 1), billing_period_start=date(2026, 1, 1),
                billing_period_end=date(2026, 1, 31), evidence={},
            )
            db.add(revision)
            await db.flush()
            split = BillSplit(
                document_id=document_id, bill_revision_id=revision.id, split_number=1,
                rule="equal", total_cents=89900, shares=[],
            )
            db.add(split)
            await db.flush()
            pending = ReminderProposal(
                document_id=document_id, user_id=owner_id, proposal_number=1, action="bill_reminder",
                source="bill_panel", bill_revision_id=revision.id, details={}, status="pending",
            )
            approved = ReminderProposal(
                document_id=document_id, user_id=owner_id, proposal_number=2, action="bill_reminder",
                source="bill_panel", bill_revision_id=revision.id, details={}, status="approved",
            )
            db.add_all([pending, approved])
            await db.flush()
            db.add(Reminder(
                user_id=owner_id, document_id=document_id, proposal_id=approved.id,
                remind_on=date(2026, 1, 30), details={},
            ))
            db.add(Warranty(
                document_id=document_id, purchase_date=None,
                expiry_date=date(2027, 5, 1), notes="Owner set the end date",
            ))
            await db.commit()
            category_id, tag_id = category.id, tag.id

        before = await _counts(document_id)
        await document_processor.refresh_details(document_id)

        async with async_session() as db:
            document = (await db.execute(
                select(Document).where(Document.id == document_id).options(selectinload(Document.tags))
            )).scalar_one()
            warranty = (await db.execute(select(Warranty).where(Warranty.document_id == document_id))).scalar_one()
            assert document.title == "My laptop"
            assert document.document_type == "Receipt"
            assert (document.brand, document.model) == ("Fernhill", "FL14")
            assert document.summary == "A suggested summary of the document."
            assert document.category_id == category_id
            assert document.is_favourite is True
            assert [t.id for t in document.tags] == [tag_id]
            assert document.raw_text == _LAPTOP_TEXT
            assert warranty.expiry_date == date(2027, 5, 1)
            assert warranty.purchase_date == date(2026, 1, 8)  # an empty date is filled
            assert warranty.notes == "Owner set the end date"
        assert await _counts(document_id) == before
        assert before == {"bill_revisions": 1, "bill_splits": 1, "reminder_proposals": 2, "reminders": 1}
    finally:
        await delete_users(owner_id, other_id)


async def test_refresh_details_fills_what_is_still_machine_owned(monkeypatch):
    from datetime import date

    from sqlalchemy import select

    from app.dependencies import async_session
    from app.models.base import Document
    from tests.accounts import delete_users

    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "")
    monkeypatch.setattr(
        document_processor.categorisation_service, "categorise_document",
        lambda text: _suggestion(document_type="Receipt", title="Fernhill FL14 laptop receipt"),
    )
    owner_id, other_id, document_id = await _owner_with_document(
        title="laptop-receipt.pdf", document_type="Sales Receipt", brand=None, model=None,
    )
    try:
        await document_processor.refresh_details(document_id)
        async with async_session() as db:
            document = await db.get(Document, document_id)
            warranty = (await db.execute(select(Warranty).where(Warranty.document_id == document_id))).scalar_one()
            assert document.title == "Fernhill FL14 laptop receipt"
            assert document.document_type == "Receipt"
            assert (document.brand, document.model) == ("Suggested brand", "Suggested model")
            assert (warranty.purchase_date, warranty.expiry_date) == (date(2026, 1, 8), date(2028, 1, 8))
    finally:
        await delete_users(owner_id, other_id)


async def test_refresh_details_keeps_a_set_kind(monkeypatch):
    from app.dependencies import async_session
    from app.models.base import Document
    from tests.accounts import delete_users

    monkeypatch.setattr(document_processor.categorisation_service, "categorise_document", lambda text: _suggestion())
    owner_id, other_id, document_id = await _owner_with_document(document_type="Manual")
    try:
        await document_processor.refresh_details(document_id)
        async with async_session() as db:
            assert (await db.get(Document, document_id)).document_type == "Manual"
    finally:
        await delete_users(owner_id, other_id)


async def test_refresh_details_keeps_an_existing_summary_when_none_is_returned(monkeypatch):
    from app.dependencies import async_session
    from app.models.base import Document
    from tests.accounts import delete_users

    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "")
    monkeypatch.setattr(
        document_processor.categorisation_service, "categorise_document", lambda text: _suggestion(summary=None),
    )
    owner_id, other_id, document_id = await _owner_with_document(summary="Earlier summary")
    try:
        await document_processor.refresh_details(document_id)
        async with async_session() as db:
            assert (await db.get(Document, document_id)).summary == "Earlier summary"
    finally:
        await delete_users(owner_id, other_id)
