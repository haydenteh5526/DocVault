"""Retrieval for question answering: one function, four search modes.

`retrieve` is the vector query, the keyword query, Reciprocal Rank Fusion and the
relevance floor that used to sit inside `rag_service.generate_rag_answer`, moved
here unchanged so the retrieval benchmark can run each part on its own. Ask calls
it in `hybrid` mode, which behaves exactly as before.
"""
import bisect
import uuid
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import embedding_service

# Cosine similarity a chunk must reach when a question is asked across all
# documents. Provisional (D1 of the issue 24 plan): the retrieval benchmark
# calibrates it on a frozen set. A question scoped to one document has no floor.
SIMILARITY_FLOOR = 0.55

# Reciprocal Rank Fusion constant; 60 is the conventional value.
RRF_K = 60

# Each candidate query returns this many rows, and the ranked list is cut to MAX_CANDIDATES.
CANDIDATE_LIMIT = 10
MAX_CANDIDATES = 20

Mode = Literal["keyword", "semantic", "hybrid", "hybrid_strict"]


@dataclass(frozen=True)
class Passage:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    chunk_text: str
    similarity: float  # best cosine similarity, 0.0 for keyword-only hits
    score: float  # RRF score (hybrid), ts_rank (keyword) or similarity (semantic)
    line_start: int | None
    line_end: int | None


@dataclass(frozen=True)
class Retrieval:
    outcome: Literal["passages", "not_found", "no_documents"]
    via: Literal["floor", "keyword_fallback", "scoped", "none"]
    passages: list[Passage]  # at most `limit`, after the floor
    candidates: list[Passage]  # the full ranked list before the floor, for the benchmark


class _LineIndex:
    """A document's text prepared once, so each passage is located without rescanning it.

    `collapsed` is raw_text with every run of whitespace turned into one space,
    `origin[i]` is the index in raw_text that collapsed[i] came from, and
    `starts` are the offsets where `raw_text.splitlines()` begins each line, so a
    character is numbered exactly as the bill review's "OCR line" numbers it.
    """

    def __init__(self, raw_text: str):
        chars: list[str] = []
        self.origin: list[int] = []
        in_space = False
        for index, char in enumerate(raw_text):
            if char.isspace():
                if not in_space and chars:
                    chars.append(" ")
                    self.origin.append(index)
                in_space = True
            else:
                chars.append(char)
                self.origin.append(index)
                in_space = False
        self.collapsed = "".join(chars)
        self.starts = [0]
        for piece in raw_text.splitlines(keepends=True):
            self.starts.append(self.starts[-1] + len(piece))

    def _line_of(self, collapsed_index: int) -> int:
        return bisect.bisect_right(self.starts, self.origin[collapsed_index])

    def lines_of(self, chunk_text: str) -> tuple[int, int] | None:
        flat = " ".join(chunk_text.split())
        if not flat or not self.collapsed:
            return None

        # A stored chunk is a contiguous run of the document's text once
        # whitespace is collapsed, so it normally matches whole. If the same
        # passage appears more than once word for word, the first copy is used:
        # that is a known limit, since the text alone cannot tell the copies apart.
        start = self.collapsed.find(flat)
        if start != -1:
            return self._line_of(start), self._line_of(start + len(flat) - 1)

        # Fallback: the chunk's first and last 40 characters.
        start = self.collapsed.find(flat[:40])
        if start == -1:
            return None
        tail = flat[-40:]
        end = self.collapsed.find(tail, start)
        end_index = (end + len(tail) - 1) if end != -1 else start
        return self._line_of(start), self._line_of(end_index)


def ocr_lines_of(raw_text: str, chunk_text: str) -> tuple[int, int] | None:
    """The 1-based first and last line of raw_text that a chunk covers.

    The chunker joins lines with spaces, so a stored chunk has no line breaks;
    see _LineIndex for how it is found and numbered.
    """
    if not raw_text:
        return None
    return _LineIndex(raw_text).lines_of(chunk_text)


def _clean_similarity(value) -> float:
    # pgvector returns NaN for a zero vector; read it as no similarity.
    return value if value == value else 0.0


async def retrieve(
    db: AsyncSession,
    user_id: uuid.UUID,
    question: str,
    *,
    mode: Mode = "hybrid",
    document_id: str | None = None,
    floor: float = SIMILARITY_FLOOR,
    limit: int = 5,
) -> Retrieval:
    """Find the passages that answer a question, from one user's documents only.

    `keyword` ranks full-text matches by ts_rank, `semantic` ranks by cosine
    similarity, and `hybrid` and `hybrid_strict` fuse both with RRF. Across all
    documents the semantic modes keep chunks at or above `floor`; only `hybrid`
    falls back to the top fused hits when a keyword match exists but nothing
    clears the floor. A question scoped to one document has no floor.
    """
    vec_rows: list = []
    kw_rows: list = []

    doc_filter = ""
    if document_id:
        doc_filter = "AND dc.document_id = cast(:document_id as uuid)"

    # Vector candidates (cosine similarity)
    if mode != "keyword":
        query_embedding = embedding_service.get_embedding(question)
        embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
        params: dict = {"embedding": embedding_str, "user_id": str(user_id)}
        if document_id:
            params["document_id"] = document_id
        vec_result = await db.execute(
            text(f"""
                SELECT dc.id as chunk_id, dc.chunk_text, dc.document_id, d.title as document_title,
                       d.raw_text,
                       1 - (dc.embedding <=> cast(:embedding as vector)) as similarity
                FROM doc_chunks dc
                JOIN documents d ON d.id = dc.document_id
                WHERE d.user_id = cast(:user_id as uuid)
                {doc_filter}
                ORDER BY dc.embedding <=> cast(:embedding as vector)
                LIMIT {CANDIDATE_LIMIT}
            """),
            params,
        )
        vec_rows = vec_result.fetchall()

    # Keyword candidates (PostgreSQL full-text over chunk text)
    if mode != "semantic":
        kw_params: dict = {"q": question, "user_id": str(user_id)}
        if document_id:
            kw_params["document_id"] = document_id
        kw_result = await db.execute(
            text(f"""
                SELECT dc.id as chunk_id, dc.chunk_text, dc.document_id, d.title as document_title,
                       d.raw_text,
                       ts_rank(to_tsvector('english', dc.chunk_text), plainto_tsquery('english', :q)) as rank
                FROM doc_chunks dc
                JOIN documents d ON d.id = dc.document_id
                WHERE d.user_id = cast(:user_id as uuid)
                {doc_filter}
                  AND to_tsvector('english', dc.chunk_text) @@ plainto_tsquery('english', :q)
                ORDER BY rank DESC
                LIMIT {CANDIDATE_LIMIT}
            """),
            kw_params,
        )
        kw_rows = kw_result.fetchall()

    if not vec_rows and not kw_rows:
        return Retrieval(outcome="no_documents", via="none", passages=[], candidates=[])

    # Reciprocal Rank Fusion: score = sum(1 / (k + rank)) across the lists. The best
    # vector similarity is kept per chunk so the floor can still be applied.
    fused: dict = {}

    def _entry(row) -> dict:
        return fused.setdefault(row.chunk_id, {
            "chunk_id": row.chunk_id,
            "chunk_text": row.chunk_text,
            "document_id": row.document_id,
            "document_title": row.document_title,
            "raw_text": row.raw_text,
            "rrf": 0.0,
            "similarity": 0.0,
            "score": 0.0,
        })

    if mode == "keyword":
        for row in kw_rows:
            _entry(row)["score"] = float(row.rank)
        ranked = list(fused.values())
    elif mode == "semantic":
        for row in vec_rows:
            entry = _entry(row)
            entry["similarity"] = _clean_similarity(row.similarity)
            entry["score"] = entry["similarity"]
        ranked = sorted(fused.values(), key=lambda e: e["similarity"], reverse=True)
    else:
        for rank, row in enumerate(vec_rows):
            entry = _entry(row)
            entry["rrf"] += 1.0 / (RRF_K + rank + 1)
            similarity = _clean_similarity(row.similarity)
            if similarity > entry["similarity"]:
                entry["similarity"] = similarity
        for rank, row in enumerate(kw_rows):  # keyword rows carry no cosine similarity
            _entry(row)["rrf"] += 1.0 / (RRF_K + rank + 1)
        for entry in fused.values():
            entry["score"] = entry["rrf"]
        ranked = sorted(fused.values(), key=lambda e: e["rrf"], reverse=True)

    # Relevance floor. This filters out near-irrelevant chunks that would otherwise
    # pad the context and invite hallucination. Inside one document the owner
    # already chose where to look, so every candidate counts.
    via: Literal["floor", "keyword_fallback", "scoped", "none"]
    if document_id:
        relevant, via = ranked, "scoped"
    elif mode == "keyword":
        relevant, via = ranked, "none"
    else:
        relevant, via = [e for e in ranked if e["similarity"] >= floor], "floor"
        if not relevant and mode == "hybrid" and kw_rows:
            # Exact terms and model numbers still count when no chunk clears the floor.
            relevant, via = ranked[:limit], "keyword_fallback"

    def _passage(e: dict, line_start: int | None = None, line_end: int | None = None) -> Passage:
        return Passage(
            chunk_id=e["chunk_id"],
            document_id=e["document_id"],
            document_title=e["document_title"],
            chunk_text=e["chunk_text"],
            similarity=e["similarity"],
            score=e["score"],
            line_start=line_start,
            line_end=line_end,
        )

    candidates = [_passage(e) for e in ranked[:MAX_CANDIDATES]]
    if not relevant:
        return Retrieval(outcome="not_found", via="floor", passages=[], candidates=candidates)

    top = relevant[:limit]

    # Prepared once per document, not once per passage.
    line_indexes: dict = {}
    for e in top:
        if e["raw_text"] and e["document_id"] not in line_indexes:
            line_indexes[e["document_id"]] = _LineIndex(e["raw_text"])
    passages = []
    for e in top:
        lines = line_indexes[e["document_id"]].lines_of(e["chunk_text"]) if e["raw_text"] else None
        passages.append(_passage(e, *(lines if lines else (None, None))))

    return Retrieval(outcome="passages", via=via, passages=passages, candidates=candidates)
