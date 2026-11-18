import uuid
from contextlib import contextmanager
from types import SimpleNamespace

import openai
from google import genai

from app.config import settings
from app.services import observability, rag_service, retry
from app.services.chunking_service import chunk_text


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


def _chunk(chunk_id="chunk-1", similarity=0.8, title="Manual", text="Reset with the red button", raw_text=None):
    return SimpleNamespace(
        chunk_id=chunk_id,
        chunk_text=text,
        document_id=uuid.uuid4(),
        document_title=title,
        raw_text=raw_text,
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

    assert result.answer == "I couldn't find this in your documents."
    assert result.sources == []


def _no_key(monkeypatch, similarity=0.5):
    monkeypatch.setattr(rag_service.embedding_service, "get_embedding", lambda question: [0.1])
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")


async def test_an_unscoped_question_below_the_floor_is_not_found(monkeypatch):
    _no_key(monkeypatch)
    db = _Database([_chunk(similarity=0.45)], [])

    result = await rag_service.generate_rag_answer("When does my tenancy end?", uuid.uuid4(), db)

    assert result.answer == "I couldn't find this in your documents."
    assert result.sources == []


async def test_an_unscoped_question_above_the_floor_answers(monkeypatch):
    _no_key(monkeypatch)
    db = _Database([_chunk(similarity=0.62)], [], [])

    result = await rag_service.generate_rag_answer("When is this bill due?", uuid.uuid4(), db)

    assert len(result.sources) == 1
    assert result.sources[0].similarity == 0.62


async def test_a_scoped_question_has_no_floor(monkeypatch):
    _no_key(monkeypatch)
    chunk = _chunk(similarity=0.30)
    db = _Database([chunk], [], [])

    result = await rag_service.generate_rag_answer(
        "Anything?", uuid.uuid4(), db, document_id=str(chunk.document_id)
    )

    assert len(result.sources) == 1


async def test_a_keyword_match_still_answers_below_the_floor(monkeypatch):
    _no_key(monkeypatch)
    vector = _chunk(chunk_id="v", similarity=0.45, text="Unrelated")
    keyword = SimpleNamespace(
        chunk_id="k",
        chunk_text="Model ZX-42 reset procedure",
        document_id=uuid.uuid4(),
        document_title="Boiler Manual",
        raw_text=None,
    )
    db = _Database([vector], [keyword], [])

    result = await rag_service.generate_rag_answer("ZX-42", uuid.uuid4(), db)

    assert {s.document_title for s in result.sources} == {"Manual", "Boiler Manual"}


EXAMPLE_ENERGY = "\n".join([
    "Electricity bill",
    "Total amount due: EUR 123.47",
    "Billing period: 1 October 2026 to 31 October 2026",
    "Payment due date: 23 November 2026",
])

PARTS = "\n".join(
    f"Item {i}: the part number is PN-{i:04d} and it fits model WD8." for i in range(1, 31)
)


def _collapsed(text: str) -> str:
    return " ".join(text.split())


def _line_text(raw_text: str, number: int) -> str:
    return _collapsed(raw_text.splitlines()[number - 1])


def test_lines_of_the_real_bill():
    chunks = chunk_text(EXAMPLE_ENERGY)
    assert chunks
    assert rag_service.ocr_lines_of(EXAMPLE_ENERGY, chunks[0]["text"]) == (1, 4)
    for chunk in chunks:
        flat = _collapsed(chunk["text"])
        start, end = rag_service.ocr_lines_of(EXAMPLE_ENERGY, chunk["text"])
        assert flat[:10] in _line_text(EXAMPLE_ENERGY, start)
        assert flat[-10:] in _line_text(EXAMPLE_ENERGY, end)


def _oracle(raw_text: str, chunk_text_value: str) -> tuple[int, int]:
    """The shortest run of lines (numbered like splitlines) whose collapsed text holds the chunk."""
    lines = [(number, _collapsed(line)) for number, line in enumerate(raw_text.splitlines(), start=1)]
    lines = [(number, text) for number, text in lines if text]
    flat = _collapsed(chunk_text_value)
    for span in range(len(lines)):
        for start in range(len(lines) - span):
            run = lines[start:start + span + 1]
            if flat in " ".join(text for _, text in run):
                return run[0][0], run[-1][0]
    raise AssertionError("chunk is not in the text")


def test_a_one_chunk_bill_covers_all_its_text():
    chunks = chunk_text(EXAMPLE_ENERGY)
    assert len(chunks) == 1
    assert rag_service.ocr_lines_of(EXAMPLE_ENERGY, chunks[0]["text"]) == (1, 4)


def test_lines_of_a_later_chunk():
    chunks = chunk_text(PARTS)
    assert len(chunks) >= 3
    start, end = rag_service.ocr_lines_of(PARTS, chunks[1]["text"])
    assert 1 < start <= end
    overlap_head = _collapsed(chunks[1]["text"])[:10]
    assert overlap_head in _line_text(PARTS, start)


def test_unknown_text_gives_none():
    assert rag_service.ocr_lines_of(EXAMPLE_ENERGY, "Not in this document at all") is None
    assert rag_service.ocr_lines_of(EXAMPLE_ENERGY, "   ") is None
    assert rag_service.ocr_lines_of("", "text") is None


REPEATED = "\n".join(
    line
    for month in range(1, 6)
    for line in (
        "EXAMPLE ENERGY \u00b7 account ending 0042",
        "Account number: 0042 1187 Customer: J Smith.",
        "Keep this document for your records and do not share it.",
        f"Charges for month {month}: EUR {month * 7}.00 including standing charge.",
    )
)


def test_repeated_lines_do_not_move_the_range():
    chunks = chunk_text(REPEATED)
    assert len(chunks) >= 3
    for chunk in chunks:
        assert rag_service.ocr_lines_of(REPEATED, chunk["text"]) == _oracle(REPEATED, chunk["text"])


def test_numbering_matches_the_bill_review():
    lines = [f"Item {i}: the part number is PN-{i:04d} and it fits model WD8." for i in range(1, 35)]
    raw = "\n".join(lines[:30]) + "\f" + "\n".join(lines[30:])  # the form feed is a line break for splitlines()
    chunks = chunk_text(raw)
    start, end = rag_service.ocr_lines_of(raw, chunks[-1]["text"])
    assert (start, end) == _oracle(raw, chunks[-1]["text"])
    assert end == 34  # counting only newlines would say 33


def test_blank_lines_before_a_later_passage():
    lines = []
    for i in range(1, 31):
        lines.append(f"Item {i}: the part number is PN-{i:04d} and it fits model WD8.")
        if i % 4 == 0:
            lines.extend(["", "      ", ""])
    raw = "\n".join(lines)
    chunks = chunk_text(raw)
    assert len(chunks) >= 3
    for chunk in chunks[1:]:
        start, end = rag_service.ocr_lines_of(raw, chunk["text"])
        assert (start, end) == _oracle(raw, chunk["text"])
        assert _collapsed(chunk["text"])[:10] in _line_text(raw, start)


def test_a_chunk_that_is_not_whole_in_the_text_falls_back_to_its_ends():
    head = _line_text(PARTS, 5)
    tail = _line_text(PARTS, 9)
    assert rag_service.ocr_lines_of(PARTS, f"{head} an altered middle {tail}") == (5, 9)


async def test_sources_carry_the_line_range(monkeypatch):
    _no_key(monkeypatch)
    chunk = chunk_text(EXAMPLE_ENERGY)[0]
    row = _chunk(title="Example Energy", text=chunk["text"], raw_text=EXAMPLE_ENERGY)
    db = _Database([row], [], [])

    result = await rag_service.generate_rag_answer("What is due?", uuid.uuid4(), db)

    assert (result.sources[0].line_start, result.sources[0].line_end) == (1, 4)
    assert result.sources[0].to_dict()["line_start"] == 1
    assert result.sources[0].to_dict()["line_end"] == 4


async def test_the_no_key_answer_names_the_line_range(monkeypatch):
    _no_key(monkeypatch)
    chunks = chunk_text(PARTS)
    rows = [
        _chunk(chunk_id=f"c{i}", title="Manual", text=chunks[i]["text"], raw_text=PARTS, similarity=0.9 - i / 100)
        for i in (0, 1)
    ]
    single = _chunk(chunk_id="s", title="Receipt", text="Item 3: the part number is PN-0003", raw_text=PARTS, similarity=0.8)
    db = _Database([*rows, single], [], [])

    result = await rag_service.generate_rag_answer("part number?", uuid.uuid4(), db)

    assert result.answer.startswith("No answer could be written")
    assert "Manual, lines 1\u2013" in result.answer
    second = result.sources[1]
    assert f"Manual, lines {second.line_start}\u2013{second.line_end}:" in result.answer
    assert "Receipt, line 3:" in result.answer
    assert "[Dev mode" not in result.answer


async def test_a_source_with_an_unknown_line_is_named_by_title_only(monkeypatch):
    _no_key(monkeypatch)
    chunk = _chunk(title="Washer", text="Unlocated passage", raw_text="x")
    db = _Database([chunk], [], [])

    result = await rag_service.generate_rag_answer("What?", uuid.uuid4(), db)

    assert result.sources[0].line_start is None and result.sources[0].line_end is None
    assert "\nWasher:\nUnlocated passage" in result.answer


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

    assert result.answer.startswith("No answer could be written")
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
        raw_text=None,
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
        "line_start": None,
        "line_end": None,
    }


def test_generate_answer_without_provider_says_no_answer_was_written(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    result = rag_service._generate_answer("Question", "x" * 600)
    assert result.startswith("No answer could be written because no language model is set up.")
    assert "[Dev mode" not in result
    assert "x" * 501 not in result


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
