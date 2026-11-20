"""Retrieval as one function with a search mode (issue 33, Task 1).

The old fusion is copied into this file as `_previous_ranking`, so the extraction
can be compared with the code it replaced.
"""
import uuid
from types import SimpleNamespace

import pytest

from app.dependencies import async_session
from app.models.base import DocChunk, Document, User
from app.services import retrieval
from app.services.auth_service import hash_password
from app.services.retrieval import retrieve
from tests.accounts import delete_users


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _Database:
    """Answers the vector query and the keyword query by what each one selects."""

    def __init__(self, vector=(), keyword=()):
        self._vector = list(vector)
        self._keyword = list(keyword)
        self.queries: list[str] = []

    async def execute(self, statement, params):
        sql = str(statement)
        if "ts_rank" in sql:
            self.queries.append("keyword")
            return _Rows(self._keyword)
        self.queries.append("vector")
        return _Rows(self._vector)


def _vec(chunk_id, similarity, text="passage", title="Manual", document_id=None, raw_text=None):
    return SimpleNamespace(
        chunk_id=chunk_id,
        chunk_text=text,
        document_id=document_id or uuid.uuid4(),
        document_title=title,
        raw_text=raw_text,
        similarity=similarity,
    )


def _kw(chunk_id, rank=0.1, text="passage", title="Manual", document_id=None, raw_text=None):
    return SimpleNamespace(
        chunk_id=chunk_id,
        chunk_text=text,
        document_id=document_id or uuid.uuid4(),
        document_title=title,
        raw_text=raw_text,
        rank=rank,
    )


@pytest.fixture(autouse=True)
def _embed(monkeypatch):
    monkeypatch.setattr(retrieval.embedding_service, "get_embedding", lambda question: [0.1, 0.2])


def _previous_ranking(vec_rows, kw_rows, floor, document_id=None):
    """A frozen copy of the fusion that lived in rag_service.generate_rag_answer."""
    rrf_k = 60
    fused: dict = {}

    def _add(rows, sim_getter):
        for rank, row in enumerate(rows):
            entry = fused.setdefault(row.chunk_id, {"rrf": 0.0, "similarity": 0.0})
            entry["rrf"] += 1.0 / (rrf_k + rank + 1)
            sim = sim_getter(row)
            if sim is not None and sim > entry["similarity"]:
                entry["similarity"] = sim
            entry["id"] = row.chunk_id

    _add(vec_rows, lambda r: (r.similarity if r.similarity == r.similarity else 0.0))
    _add(kw_rows, lambda r: None)

    ranked = sorted(fused.values(), key=lambda e: e["rrf"], reverse=True)
    if document_id:
        relevant = ranked
    else:
        relevant = [e for e in ranked if e["similarity"] >= floor]
    if not relevant and kw_rows:
        relevant = ranked[:5]
    return [e["id"] for e in ranked], [e["id"] for e in relevant[:5]]


def _overlapping_fixture():
    # a and b appear in both lists, d and y only in the keyword list, and x has a NaN
    # similarity (the old code read that as 0.0). Exact ties are in the test below.
    vec = [_vec("a", 0.91), _vec("b", 0.74), _vec("c", 0.60), _vec("e", 0.41), _vec("x", float("nan"))]
    kw = [_kw("y"), _kw("b"), _kw("d"), _kw("a")]
    return vec, kw


@pytest.mark.parametrize("keyword_rows", ["overlap", "empty"])
@pytest.mark.parametrize("floor", [0.0, 0.55, 0.95])
async def test_hybrid_mode_matches_previous_ranking(keyword_rows, floor):
    vec, kw = _overlapping_fixture()
    if keyword_rows == "empty":
        kw = []
    expected_ranked, expected_kept = _previous_ranking(vec, kw, floor)

    result = await retrieve(_Database(vec, kw), uuid.uuid4(), "question", mode="hybrid", floor=floor)

    assert [p.chunk_id for p in result.candidates] == expected_ranked
    assert [p.chunk_id for p in result.passages] == expected_kept


async def test_hybrid_mode_ties_keep_the_vector_hit_first():
    vec = [_vec("x", 0.9)]
    kw = [_kw("y")]

    result = await retrieve(_Database(vec, kw), uuid.uuid4(), "question", mode="hybrid", floor=0.0)

    assert [p.chunk_id for p in result.candidates] == ["x", "y"]
    assert result.candidates[0].score == result.candidates[1].score


async def test_keyword_fallback_only_in_hybrid():
    vec = [_vec("v", 0.30)]
    kw = [_kw("k", text="Model ZX-42")]

    hybrid = await retrieve(_Database(vec, kw), uuid.uuid4(), "ZX-42", mode="hybrid")
    strict = await retrieve(_Database(vec, kw), uuid.uuid4(), "ZX-42", mode="hybrid_strict")

    assert (hybrid.outcome, hybrid.via) == ("passages", "keyword_fallback")
    assert {p.chunk_id for p in hybrid.passages} == {"v", "k"}
    assert (strict.outcome, strict.via) == ("not_found", "floor")
    assert strict.passages == []


async def test_semantic_mode_has_no_fallback():
    db = _Database([_vec("v", 0.30)], [_kw("k")])

    result = await retrieve(db, uuid.uuid4(), "question", mode="semantic")

    assert result.outcome == "not_found"
    assert result.passages == []
    assert db.queries == ["vector"]


async def test_semantic_mode_ranks_by_similarity_and_applies_the_floor():
    db = _Database([_vec("a", 0.80), _vec("b", 0.60), _vec("c", 0.50)])

    result = await retrieve(db, uuid.uuid4(), "question", mode="semantic", floor=0.55)

    assert result.via == "floor"
    assert [p.chunk_id for p in result.passages] == ["a", "b"]
    assert [p.score for p in result.passages] == [0.80, 0.60]
    assert [p.chunk_id for p in result.candidates] == ["a", "b", "c"]


async def test_keyword_mode_declines_without_match():
    db = _Database([_vec("v", 0.99)], [])

    result = await retrieve(db, uuid.uuid4(), "question", mode="keyword")

    assert result.passages == []
    assert result.outcome == "no_documents"
    assert db.queries == ["keyword"]


async def test_keyword_mode_answers_on_any_match_and_has_no_similarity():
    db = _Database([], [_kw("a", rank=0.4), _kw("b", rank=0.2)])

    result = await retrieve(db, uuid.uuid4(), "question", mode="keyword", floor=0.9)

    assert (result.outcome, result.via) == ("passages", "none")
    assert [p.chunk_id for p in result.passages] == ["a", "b"]
    assert [p.score for p in result.passages] == [0.4, 0.2]
    assert [p.similarity for p in result.passages] == [0.0, 0.0]


async def test_no_candidates_means_no_documents():
    result = await retrieve(_Database([], []), uuid.uuid4(), "question", mode="hybrid")

    assert (result.outcome, result.via) == ("no_documents", "none")
    assert result.passages == [] and result.candidates == []


@pytest.mark.parametrize("mode", ["keyword", "semantic", "hybrid", "hybrid_strict"])
async def test_scoped_question_ignores_floor(mode):
    document_id = uuid.uuid4()
    db = _Database([_vec("v", 0.05, document_id=document_id)], [_kw("k", document_id=document_id)])

    result = await retrieve(db, uuid.uuid4(), "question", mode=mode, document_id=str(document_id), floor=0.99)

    assert (result.outcome, result.via) == ("passages", "scoped")
    assert result.passages


async def test_candidates_keep_pre_floor_order():
    vec = [_vec("high", 0.90), _vec("low", 0.20), _vec("mid", 0.70)]
    kw = [_kw("low")]

    result = await retrieve(_Database(vec, kw), uuid.uuid4(), "question", mode="hybrid", floor=0.55)

    assert [p.chunk_id for p in result.candidates] == ["low", "high", "mid"]
    assert [p.chunk_id for p in result.passages] == ["high", "mid"]
    assert result.via == "floor"


async def test_limit_caps_passages_but_not_candidates():
    vec = [_vec(f"c{i}", 0.9 - i / 100) for i in range(8)]

    result = await retrieve(_Database(vec, []), uuid.uuid4(), "question", mode="semantic", floor=0.0, limit=3)

    assert len(result.passages) == 3
    assert len(result.candidates) == 8


async def test_passages_carry_line_numbers_and_candidates_do_not():
    document_id = uuid.uuid4()
    raw_text = "first line\nsecond line holds the answer\nthird line"
    vec = [_vec("v", 0.9, text="second line holds the answer", document_id=document_id, raw_text=raw_text)]

    result = await retrieve(_Database(vec, []), uuid.uuid4(), "question", mode="semantic")

    assert (result.passages[0].line_start, result.passages[0].line_end) == (2, 2)
    assert (result.candidates[0].line_start, result.candidates[0].line_end) == (None, None)


def test_ocr_lines_of_is_still_importable_from_rag_service():
    from app.services import rag_service

    assert rag_service.ocr_lines_of is retrieval.ocr_lines_of


@pytest.mark.parametrize("mode", ["keyword", "semantic", "hybrid", "hybrid_strict"])
async def test_retrieve_is_owner_scoped(mode, monkeypatch):
    shared_text = "Fault code E21 means the drain pump is blocked."
    unit = [1.0] + [0.0] * 1535
    monkeypatch.setattr(retrieval.embedding_service, "get_embedding", lambda question: unit)
    user_ids = []
    try:
        async with async_session() as db:
            for label in ("owner", "other"):
                user = User(
                    email=f"{label}-{uuid.uuid4()}@example.com",
                    hashed_password=hash_password("testing123"),
                    is_verified=True,
                )
                db.add(user)
                await db.flush()
                user_ids.append(user.id)
                document = Document(
                    user_id=user.id, title=f"{label} manual", s3_key_original=f"users/{user.id}/m.pdf", raw_text=shared_text
                )
                db.add(document)
                await db.flush()
                db.add(DocChunk(document_id=document.id, chunk_index=0, chunk_text=shared_text, embedding=unit))
            await db.commit()

        owner_id = user_ids[0]
        async with async_session() as db:
            result = await retrieve(db, owner_id, "fault code E21 drain pump", mode=mode, floor=0.0)

        assert result.passages
        assert {p.document_title for p in result.candidates} == {"owner manual"}
    finally:
        await delete_users(*user_ids)
