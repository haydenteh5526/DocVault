"""Shared RAG (Retrieval-Augmented Generation) logic for AI question answering.

Used by both the /api/v1/ai/ask endpoint and the conversations endpoint.
"""
import time
import uuid
from dataclasses import dataclass
from typing import Literal

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.logging_config import get_logger
from app.services import embedding_service as embedding_service  # re-exported: tests patch it here
from app.services.retrieval import Passage, retrieve
from app.services.retrieval import ocr_lines_of as ocr_lines_of  # re-exported for existing imports

logger = get_logger("rag")

ANSWER_SYSTEM_PROMPT = (
    "You are a helpful assistant that answers questions based on the user's stored documents. "
    "Only answer using information from the provided context. "
    "If the answer is not in the context, say 'I don't have information about that in your documents.' "
    "Cite which document the answer comes from. "
    "Format your responses using markdown: use **bold** for emphasis, bullet points for lists, "
    "and numbered lists for steps. Keep responses concise and well-structured."
)
# A document assistant should give the same answer to the same question (D6).
ANSWER_TEMPERATURE = 0.0
ANSWER_MAX_TOKENS = 500
OLLAMA_NUM_CTX = 8192

GROQ_MODEL = "llama-3.3-70b-versatile"
GEMINI_MODEL = "gemini-2.0-flash"

NOT_FOUND_ANSWER = "I couldn't find this in your documents."
NO_KEY_HEADER = (
    "No answer could be written because no language model is set up. "
    "These passages match your question:"
)


class Source:
    def __init__(
        self,
        document_id: str,
        document_title: str,
        chunk_text: str,
        similarity: float,
        line_start: int | None = None,
        line_end: int | None = None,
    ):
        self.document_id = document_id
        self.document_title = document_title
        self.chunk_text = chunk_text
        self.similarity = similarity
        self.line_start = line_start
        self.line_end = line_end

    def to_dict(self) -> dict:
        return {
            "document_id": self.document_id,
            "document_title": self.document_title,
            "chunk_text": self.chunk_text,
            "similarity": self.similarity,
            "line_start": self.line_start,
            "line_end": self.line_end,
        }


class RAGResult:
    def __init__(self, answer: str, sources: list[Source]):
        self.answer = answer
        self.sources = sources


def _passage_label(title: str, line_start: int | None, line_end: int | None) -> str:
    if line_start is None or line_end is None:
        return f"{title}:"
    if line_start == line_end:
        return f"{title}, line {line_start}:"
    return f"{title}, lines {line_start}\u2013{line_end}:"


class ChatTurn:
    def __init__(self, role: str, content: str):
        self.role = role
        self.content = content


def _passage_dict(passage: Passage) -> dict:
    return {
        "chunk_id": passage.chunk_id,
        "document_id": passage.document_id,
        "document_title": passage.document_title,
        "chunk_text": passage.chunk_text,
        "similarity": passage.similarity,
        "line_start": passage.line_start,
        "line_end": passage.line_end,
    }


async def build_context(db: AsyncSession, top: list[dict]) -> str:
    """The text the answer writer reads: each passage under its document, then any warranty dates."""
    context = "\n\n---\n\n".join(
        f"[From: {e['document_title']}]\n{e['chunk_text']}" for e in top
    )

    # Append warranty info if relevant documents have warranties
    doc_ids = list(set(str(e["document_id"]) for e in top))
    if doc_ids:
        warranty_result = await db.execute(
            text("""
                SELECT w.purchase_date, w.expiry_date, d.title as document_title
                FROM warranties w
                JOIN documents d ON d.id = w.document_id
                WHERE w.document_id = ANY(cast(:doc_ids as uuid[]))
            """),
            {"doc_ids": doc_ids},
        )
        warranty_rows = warranty_result.fetchall()
        if warranty_rows:
            warranty_context = "\n\n---\n\n[Warranty Information]\n" + "\n".join(
                f"• {wr.document_title}: purchased {wr.purchase_date or 'unknown'}, expires {wr.expiry_date or 'unknown'}"
                for wr in warranty_rows
            )
            context += warranty_context
    return context


async def generate_rag_answer(
    question: str,
    user_id: uuid.UUID,
    db: AsyncSession,
    document_id: str | None = None,
    history: list[ChatTurn] | None = None,
) -> RAGResult:
    """Execute the full RAG pipeline: embed query, retrieve chunks, generate answer.

    Args:
        question: The user's question.
        user_id: The authenticated user's ID for data isolation.
        db: The async database session.
        document_id: Optional document ID to scope the search.
        history: Optional conversation history for follow-up context.

    Returns:
        RAGResult with the generated answer and source references.
    """
    # 1. Retrieve passages: hybrid search over this user's documents, with the relevance floor.
    retrieval = await retrieve(db, user_id, question, mode="hybrid", document_id=document_id)
    if retrieval.outcome == "no_documents":
        return RAGResult(answer="I don't have any documents to answer from.", sources=[])
    if retrieval.outcome == "not_found":
        return RAGResult(answer=NOT_FOUND_ANSWER, sources=[])
    top = [_passage_dict(p) for p in retrieval.passages]

    # 2. Build context from retrieved chunks
    context = await build_context(db, top)

    # 3. Generate answer via LLM (with conversation history)
    answer = _generate_answer(question, context, history, passages=top)

    # 4. Build sources from the fused top chunks
    sources = [
        Source(
            document_id=str(e["document_id"]),
            document_title=e["document_title"],
            chunk_text=e["chunk_text"][:200],
            similarity=round(e["similarity"], 4),
            line_start=e["line_start"],
            line_end=e["line_end"],
        )
        for e in top
    ]

    return RAGResult(answer=answer, sources=sources)


def _no_key_answer(context: str, passages: list[dict] | None) -> str:
    if not passages:
        return f"{NO_KEY_HEADER}\n\n{context[:500]}"
    parts = [NO_KEY_HEADER]
    for passage in passages:
        label = _passage_label(passage["document_title"], passage.get("line_start"), passage.get("line_end"))
        parts.append(f"{label}\n{passage['chunk_text'][:200]}")
    answer = "\n\n".join(parts)
    warranty_at = context.find("[Warranty Information]")
    if warranty_at != -1:
        answer += "\n\n---\n\n" + context[warranty_at:]
    return answer


@dataclass(frozen=True)
class AnswerResult:
    text: str
    writer: str | None
    model: str | None
    latency_ms: int
    prompt_tokens: int | None
    invalid_reason: str | None


def _default_writer() -> Literal["ollama", "groq", "gemini"] | None:
    """D7: a local model if one is configured on purpose, then Groq, then Gemini."""
    from app.config import settings

    if settings.ANSWER_MODEL:
        return "ollama"
    if settings.GROQ_API_KEY:
        return "groq"
    if settings.GEMINI_API_KEY:
        return "gemini"
    return None


def _model_name(writer: str) -> str:
    from app.config import settings

    return {"ollama": settings.ANSWER_MODEL, "groq": GROQ_MODEL, "gemini": GEMINI_MODEL}[writer]


def generate_answer(
    question: str,
    context: str,
    history: list[ChatTurn] | None = None,
    passages: list[dict] | None = None,
    writer: Literal["ollama", "groq", "gemini"] | None = None,
) -> AnswerResult:
    """Write an answer from the retrieved context.

    With `writer=None` the product's choice applies (see _default_writer). A forced
    writer is for the benchmark: its failures come back as `invalid_reason`
    instead of falling back or raising.
    """
    from app.services.observability import trace_generation

    forced = writer is not None
    chosen = writer or _default_writer()
    if chosen is None:
        return AnswerResult(_no_key_answer(context, passages), None, None, 0, None, None)

    model = _model_name(chosen)
    started = time.perf_counter()
    prompt_tokens: int | None = None
    invalid_reason: str | None = None
    try:
        with trace_generation(
            name="rag_answer",
            model=model,
            input_text=question,
            metadata={"context_chars": len(context)},
        ) as record_output:
            if chosen == "ollama":
                answer, prompt_tokens = _generate_answer_ollama(question, context, history)
                if prompt_tokens is not None and prompt_tokens >= OLLAMA_NUM_CTX:
                    invalid_reason = "context truncated"
            elif chosen == "groq":
                answer = _generate_answer_groq(question, context, history)
            else:
                answer = _generate_answer_gemini(question, context, history)
            record_output(answer)
    except Exception as error:  # noqa: BLE001 - only the local writer or a forced writer may fail quietly
        if chosen != "ollama" and not forced:
            raise
        latency_ms = round((time.perf_counter() - started) * 1000)
        if forced:
            reason = str(error) if isinstance(error, RuntimeError) else type(error).__name__
            return AnswerResult("", chosen, model, latency_ms, None, f"error: {reason}")
        logger.warning("answer_writer_failed writer=ollama error=%s", type(error).__name__)
        return AnswerResult(_no_key_answer(context, passages), None, None, latency_ms, None, None)

    latency_ms = round((time.perf_counter() - started) * 1000)
    return AnswerResult(answer, chosen, model, latency_ms, prompt_tokens, invalid_reason)


def _generate_answer(
    question: str,
    context: str,
    history: list[ChatTurn] | None = None,
    passages: list[dict] | None = None,
) -> str:
    return generate_answer(question, context, history, passages=passages).text


def _generate_answer_ollama(
    question: str, context: str, history: list[ChatTurn] | None = None
) -> tuple[str, int | None]:
    """Answer with the local model. Returns the text and Ollama's prompt token count."""
    from app.config import settings

    if not settings.OLLAMA_URL:
        raise RuntimeError("OLLAMA_URL is not set")
    messages: list[dict] = [{"role": "system", "content": ANSWER_SYSTEM_PROMPT}]
    if history:
        for turn in history[-6:]:
            if turn.role in ("user", "assistant"):
                messages.append({"role": turn.role, "content": turn.content})
    messages.append({
        "role": "user",
        "content": f"Context from my documents:\n\n{context}\n\n---\n\nQuestion: {question}",
    })
    request = {
        "model": settings.ANSWER_MODEL,
        "messages": messages,
        "stream": False,
        "think": False,
        "options": {
            "temperature": ANSWER_TEMPERATURE,
            "seed": 0,
            "num_ctx": OLLAMA_NUM_CTX,
            "num_predict": ANSWER_MAX_TOKENS,
        },
        "keep_alive": "30m",
    }
    url = f"{settings.OLLAMA_URL.rstrip('/')}/api/chat"
    with httpx.Client(timeout=60) as client:
        response = client.post(url, json=request)
        if response.status_code == 400 and "think" in response.text:
            # An older Ollama or a model without a thinking mode rejects the field.
            request.pop("think")
            response = client.post(url, json=request)
        response.raise_for_status()
        body = response.json()
    return body["message"]["content"], body.get("prompt_eval_count")


def _generate_answer_groq(question: str, context: str, history: list[ChatTurn] | None = None) -> str:
    from openai import OpenAI

    from app.config import settings
    from app.services.retry import with_retry

    client = OpenAI(api_key=settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")

    messages: list[dict] = [{"role": "system", "content": ANSWER_SYSTEM_PROMPT}]
    if history:
        for turn in history[-6:]:
            if turn.role in ("user", "assistant"):
                messages.append({"role": turn.role, "content": turn.content})
    messages.append({
        "role": "user",
        "content": f"Context from my documents:\n\n{context}\n\n---\n\nQuestion: {question}",
    })

    response = with_retry(lambda: client.chat.completions.create(
        model=GROQ_MODEL,
        messages=messages,
        temperature=ANSWER_TEMPERATURE,
        max_tokens=ANSWER_MAX_TOKENS,
    ), label="groq.chat")

    return response.choices[0].message.content


def _generate_answer_gemini(question: str, context: str, history: list[ChatTurn] | None = None) -> str:
    from google import genai

    from app.config import settings
    from app.services.retry import with_retry

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    contents: list[dict] = []
    if history:
        for turn in history[-6:]:
            if turn.role == "user":
                contents.append({"role": "user", "parts": [{"text": turn.content}]})
            elif turn.role == "assistant":
                contents.append({"role": "model", "parts": [{"text": turn.content}]})

    contents.append({
        "role": "user",
        "parts": [{"text": f"Context from my documents:\n\n{context}\n\n---\n\nQuestion: {question}"}],
    })

    response = with_retry(lambda: client.models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config={
            "system_instruction": ANSWER_SYSTEM_PROMPT,
            "temperature": ANSWER_TEMPERATURE,
            "max_output_tokens": ANSWER_MAX_TOKENS,
        },
    ), label="gemini.chat")

    return response.text
