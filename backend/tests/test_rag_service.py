import uuid
from contextlib import contextmanager
from types import SimpleNamespace

import openai
from google import genai

from app.config import settings
from app.services import observability, rag_service, retry


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _Database:
    def __init__(self, *row_sets):
        self._results = iter(_Rows(rows) for rows in row_sets)
        self.calls = []

    async def execute(self, statement, params):
        self.calls.append((str(statement), params))
        return next(self._results)


def _chunk(chunk_id="chunk-1", similarity=0.8, title="Manual", text="Reset with the red button"):
    return SimpleNamespace(
        chunk_id=chunk_id,
        chunk_text=text,
        document_id=uuid.uuid4(),
        document_title=title,
        similarity=similarity,
    )


async def test_generate_rag_answer_when_no_documents(monkeypatch):
    monkeypatch.setattr(rag_service.embedding_service, "get_embedding", lambda question: [0.1, 0.2])
    db = _Database([], [])

    result = await rag_service.generate_rag_answer("How?", uuid.uuid4(), db)

    assert result.answer == "I don't have any documents to answer from."
    assert result.sources == []
    assert db.calls[0][1]["embedding"] == "[0.1,0.2]"


async def test_generate_rag_answer_rejects_irrelevant_vectors(monkeypatch):
    monkeypatch.setattr(rag_service.embedding_service, "get_embedding", lambda question: [0.1])
    db = _Database([_chunk(similarity=0.1)], [])

    result = await rag_service.generate_rag_answer("unrelated", uuid.uuid4(), db)

    assert result.answer == "I don't have information about that in your documents."
    assert result.sources == []


async def test_generate_rag_answer_uses_keyword_fallback_and_warranty(monkeypatch):
    monkeypatch.setattr(rag_service.embedding_service, "get_embedding", lambda question: [0.5])
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    keyword = _chunk(similarity=0.0, title="Boiler Manual", text="Model ZX-42 reset procedure")
    delattr(keyword, "similarity")
    warranty = SimpleNamespace(document_title="Boiler Manual", purchase_date=None, expiry_date="2027-01-01")
    db = _Database([], [keyword], [warranty])

    result = await rag_service.generate_rag_answer(
        "ZX-42",
        uuid.uuid4(),
        db,
        document_id=str(keyword.document_id),
    )

    assert result.answer.startswith("[Dev mode - no AI key]")
    assert "Warranty Information" in result.answer
    assert result.sources[0].document_title == "Boiler Manual"
    assert result.sources[0].similarity == 0.0
    assert db.calls[0][1]["document_id"] == str(keyword.document_id)
    assert db.calls[1][1]["document_id"] == str(keyword.document_id)


async def test_generate_rag_answer_fuses_duplicate_chunks(monkeypatch):
    monkeypatch.setattr(rag_service.embedding_service, "get_embedding", lambda question: [1.0])
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    shared = _chunk(similarity=0.9, text="Primary answer")
    duplicate_keyword = SimpleNamespace(
        chunk_id=shared.chunk_id,
        chunk_text=shared.chunk_text,
        document_id=shared.document_id,
        document_title=shared.document_title,
    )
    lower = _chunk(chunk_id="chunk-2", similarity=float("nan"), text="Noise")
    db = _Database([shared, lower], [duplicate_keyword], [])

    result = await rag_service.generate_rag_answer("reset", uuid.uuid4(), db)

    assert [source.chunk_text for source in result.sources] == ["Primary answer"]
    assert result.sources[0].to_dict() == {
        "document_id": str(shared.document_id),
        "document_title": "Manual",
        "chunk_text": "Primary answer",
        "similarity": 0.9,
    }


def test_generate_answer_without_provider_is_explicit_dev_fallback(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    result = rag_service._generate_answer("Question", "x" * 600)
    assert result.startswith("[Dev mode - no AI key]")
    assert len(result) < 600


def test_generate_answer_records_groq_output(monkeypatch):
    outputs = []

    @contextmanager
    def trace_generation(**kwargs):
        assert kwargs["model"] == "llama-3.3-70b-versatile"
        yield outputs.append

    monkeypatch.setattr(settings, "GROQ_API_KEY", "key")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "key")
    monkeypatch.setattr(observability, "trace_generation", trace_generation)
    monkeypatch.setattr(rag_service, "_generate_answer_groq", lambda *args: "groq answer")

    assert rag_service._generate_answer("Question", "Context") == "groq answer"
    assert outputs == ["groq answer"]


def test_generate_answer_records_gemini_output(monkeypatch):
    outputs = []

    @contextmanager
    def trace_generation(**kwargs):
        assert kwargs["model"] == "gemini-2.0-flash"
        yield outputs.append

    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "key")
    monkeypatch.setattr(observability, "trace_generation", trace_generation)
    monkeypatch.setattr(rag_service, "_generate_answer_gemini", lambda *args: "gemini answer")

    assert rag_service._generate_answer("Question", "Context") == "gemini answer"
    assert outputs == ["gemini answer"]


def test_generate_answer_groq_builds_grounded_history(monkeypatch):
    captured = {}
    response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="Answer"))])

    def create(**kwargs):
        captured.update(kwargs)
        return response

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    monkeypatch.setattr(openai, "OpenAI", lambda **kwargs: client)
    monkeypatch.setattr(retry, "with_retry", lambda fn, **kwargs: fn())
    monkeypatch.setattr(settings, "GROQ_API_KEY", "key")
    history = [rag_service.ChatTurn("system", "ignore")]
    history.extend(rag_service.ChatTurn("user", f"question-{i}") for i in range(7))

    result = rag_service._generate_answer_groq("Current", "Document context", history)

    assert result == "Answer"
    assert captured["model"] == "llama-3.3-70b-versatile"
    assert all(message["role"] != "system" for message in captured["messages"][1:-1])
    assert [message["content"] for message in captured["messages"][1:-1]] == [f"question-{i}" for i in range(1, 7)]
    assert "Document context" in captured["messages"][-1]["content"]


def test_generate_answer_gemini_maps_assistant_history(monkeypatch):
    captured = {}

    class Models:
        def generate_content(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(text="Gemini answer")

    monkeypatch.setattr(genai, "Client", lambda **kwargs: SimpleNamespace(models=Models()))
    monkeypatch.setattr(retry, "with_retry", lambda fn, **kwargs: fn())
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "key")
    history = [
        rag_service.ChatTurn("user", "Earlier question"),
        rag_service.ChatTurn("assistant", "Earlier answer"),
        rag_service.ChatTurn("system", "ignore"),
    ]

    result = rag_service._generate_answer_gemini("Current", "Context", history)

    assert result == "Gemini answer"
    assert [item["role"] for item in captured["contents"]] == ["user", "model", "user"]
    assert captured["config"]["temperature"] == 0.3
