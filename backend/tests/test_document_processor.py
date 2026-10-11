import json
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
        document_type="User Manual",
        title="Dreo DR-1 Manual",
    )
    monkeypatch.setattr(document_processor, "async_session", lambda: _SessionContext(database))
    monkeypatch.setattr(document_processor.asyncio, "to_thread", _inline_to_thread)
    monkeypatch.setattr(document_processor.storage_service, "download_file", lambda key: (b"file", "image/png"))
    monkeypatch.setattr(document_processor, "_run_ocr_and_metadata", lambda *args: ("manual text", metadata))
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
        "User Manual",
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
    metadata = SimpleNamespace(brand=None, model=None, document_type=None, title="Generated")
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


def test_generate_summary_fallback_handles_short_and_long_text(monkeypatch):
    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "")
    short = json.loads(document_processor._generate_summary("short text"))
    long = json.loads(document_processor._generate_summary("x" * 250))
    assert short["overview"] == "short text"
    assert long["overview"] == "x" * 200 + "..."
    assert short["key_topics"] == []


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


def test_generate_summary_falls_back_on_invalid_provider_response(monkeypatch):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "not json"}}]}

    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "key")
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: Response())
    monkeypatch.setattr(retry, "with_retry", lambda fn, **kwargs: fn())
    assert json.loads(document_processor._generate_summary("manual"))["overview"] == "manual"
