"""Shared RAG (Retrieval-Augmented Generation) logic for AI question answering.

Used by both the /api/v1/ai/ask endpoint and the conversations endpoint.
"""
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import embedding_service as embedding_service  # re-exported: tests patch it here
from app.services.retrieval import Passage, retrieve
from app.services.retrieval import ocr_lines_of as ocr_lines_of  # re-exported for existing imports

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
    context = "\n\n---\n\n".join(
        f"[From: {e['document_title']}]\n{e['chunk_text']}" for e in top
    )

    # 2b. Append warranty info if relevant documents have warranties
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


def _generate_answer(
    question: str,
    context: str,
    history: list[ChatTurn] | None = None,
    passages: list[dict] | None = None,
) -> str:
    from app.config import settings
    from app.services.observability import trace_generation

    if settings.GROQ_API_KEY:
        model = "llama-3.3-70b-versatile"
    elif settings.GEMINI_API_KEY:
        model = "gemini-2.0-flash"
    else:
        return _no_key_answer(context, passages)

    with trace_generation(
        name="rag_answer",
        model=model,
        input_text=question,
        metadata={"context_chars": len(context)},
    ) as record_output:
        if settings.GROQ_API_KEY:
            answer = _generate_answer_groq(question, context, history)
        else:
            answer = _generate_answer_gemini(question, context, history)
        record_output(answer)
        return answer


def _generate_answer_groq(question: str, context: str, history: list[ChatTurn] | None = None) -> str:
    from openai import OpenAI

    from app.config import settings
    from app.services.retry import with_retry

    client = OpenAI(api_key=settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")

    messages: list[dict] = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant that answers questions based on the user's stored documents. "
                "Only answer using information from the provided context. "
                "If the answer is not in the context, say 'I don't have information about that in your documents.' "
                "Cite which document the answer comes from. "
                "Format your responses using markdown: use **bold** for emphasis, bullet points for lists, "
                "and numbered lists for steps. Keep responses concise and well-structured."
            ),
        }
    ]
    if history:
        for turn in history[-6:]:
            if turn.role in ("user", "assistant"):
                messages.append({"role": turn.role, "content": turn.content})
    messages.append({
        "role": "user",
        "content": f"Context from my documents:\n\n{context}\n\n---\n\nQuestion: {question}",
    })

    response = with_retry(lambda: client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.3,
        max_tokens=500,
    ), label="groq.chat")

    return response.choices[0].message.content


def _generate_answer_gemini(question: str, context: str, history: list[ChatTurn] | None = None) -> str:
    from google import genai

    from app.config import settings
    from app.services.retry import with_retry

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    system_instruction = (
        "You are a helpful assistant that answers questions based on the user's stored documents. "
        "Only answer using information from the provided context. "
        "If the answer is not in the context, say 'I don't have information about that in your documents.' "
        "Cite which document the answer comes from. "
        "Format your responses using markdown: use **bold** for emphasis, bullet points for lists, "
        "and numbered lists for steps. Keep responses concise and well-structured."
    )

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
        model="gemini-2.0-flash",
        contents=contents,
        config={
            "system_instruction": system_instruction,
            "temperature": 0.3,
            "max_output_tokens": 500,
        },
    ), label="gemini.chat")

    return response.text
