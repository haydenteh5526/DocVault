"""Shared RAG (Retrieval-Augmented Generation) logic for AI question answering.

Used by both the /api/v1/ai/ask endpoint and the conversations endpoint.
"""
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import embedding_service


class Source:
    def __init__(self, document_id: str, document_title: str, chunk_text: str, similarity: float):
        self.document_id = document_id
        self.document_title = document_title
        self.chunk_text = chunk_text
        self.similarity = similarity

    def to_dict(self) -> dict:
        return {
            "document_id": self.document_id,
            "document_title": self.document_title,
            "chunk_text": self.chunk_text,
            "similarity": self.similarity,
        }


class RAGResult:
    def __init__(self, answer: str, sources: list[Source]):
        self.answer = answer
        self.sources = sources


class ChatTurn:
    def __init__(self, role: str, content: str):
        self.role = role
        self.content = content


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
    # 1. Embed the question
    query_embedding = embedding_service.get_embedding(question)
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # 2. Hybrid retrieval: run vector similarity AND full-text keyword search,
    #    then fuse the two ranked lists with Reciprocal Rank Fusion (RRF).
    #    This catches both semantic matches ("drainage issue" ~ "blocked filter")
    #    and exact keyword/model-number matches that pure vectors can miss.
    doc_filter = ""
    params: dict = {"embedding": embedding_str, "user_id": str(user_id)}
    if document_id:
        doc_filter = "AND dc.document_id = cast(:document_id as uuid)"
        params["document_id"] = document_id

    # 2a. Vector candidates (cosine similarity)
    vec_result = await db.execute(
        text(f"""
            SELECT dc.id as chunk_id, dc.chunk_text, dc.document_id, d.title as document_title,
                   1 - (dc.embedding <=> cast(:embedding as vector)) as similarity
            FROM doc_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = cast(:user_id as uuid)
            {doc_filter}
            ORDER BY dc.embedding <=> cast(:embedding as vector)
            LIMIT 10
        """),
        params,
    )
    vec_rows = vec_result.fetchall()

    # 2b. Keyword candidates (PostgreSQL full-text over chunk text)
    kw_params: dict = {"q": question, "user_id": str(user_id)}
    if document_id:
        kw_params["document_id"] = document_id
    kw_result = await db.execute(
        text(f"""
            SELECT dc.id as chunk_id, dc.chunk_text, dc.document_id, d.title as document_title,
                   ts_rank(to_tsvector('english', dc.chunk_text), plainto_tsquery('english', :q)) as rank
            FROM doc_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = cast(:user_id as uuid)
            {doc_filter}
              AND to_tsvector('english', dc.chunk_text) @@ plainto_tsquery('english', :q)
            ORDER BY rank DESC
            LIMIT 10
        """),
        kw_params,
    )
    kw_rows = kw_result.fetchall()

    if not vec_rows and not kw_rows:
        return RAGResult(answer="I don't have any documents to answer from.", sources=[])

    # 2c. Reciprocal Rank Fusion: score = sum(1 / (k + rank)) across both lists.
    #     k=60 is the conventional constant. We keep the best vector similarity
    #     per chunk so we can still apply a relevance floor and surface it.
    RRF_K = 60
    fused: dict = {}

    def _add(rows, sim_getter):
        for rank, row in enumerate(rows):
            entry = fused.setdefault(row.chunk_id, {
                "chunk_text": row.chunk_text,
                "document_id": row.document_id,
                "document_title": row.document_title,
                "rrf": 0.0,
                "similarity": 0.0,
            })
            entry["rrf"] += 1.0 / (RRF_K + rank + 1)
            sim = sim_getter(row)
            if sim is not None and sim > entry["similarity"]:
                entry["similarity"] = sim

    _add(vec_rows, lambda r: (r.similarity if r.similarity == r.similarity else 0.0))
    _add(kw_rows, lambda r: None)  # keyword rows carry no cosine similarity

    # 2d. Relevance floor: keep chunks that clear a semantic similarity
    #     threshold. This filters out near-irrelevant chunks that would
    #     otherwise pad the context and invite hallucination.
    SIMILARITY_FLOOR = 0.25
    ranked = sorted(fused.values(), key=lambda e: e["rrf"], reverse=True)
    relevant = [e for e in ranked if e["similarity"] >= SIMILARITY_FLOOR]
    if not relevant:
        # No chunk cleared the semantic floor. If keyword search still produced
        # matches (exact terms/model numbers), trust the top fused hits;
        # otherwise report that we have nothing relevant.
        if kw_rows:
            relevant = ranked[:5]
        else:
            return RAGResult(
                answer="I don't have information about that in your documents.",
                sources=[],
            )

    top = relevant[:5]

    # 3. Build context from retrieved chunks
    context = "\n\n---\n\n".join(
        f"[From: {e['document_title']}]\n{e['chunk_text']}" for e in top
    )

    # 3b. Append warranty info if relevant documents have warranties
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

    # 4. Generate answer via LLM (with conversation history)
    answer = _generate_answer(question, context, history)

    # 5. Build sources from the fused top chunks
    sources = [
        Source(
            document_id=str(e["document_id"]),
            document_title=e["document_title"],
            chunk_text=e["chunk_text"][:200],
            similarity=round(e["similarity"], 4),
        )
        for e in top
    ]

    return RAGResult(answer=answer, sources=sources)


def _generate_answer(question: str, context: str, history: list[ChatTurn] | None = None) -> str:
    from app.config import settings
    from app.services.observability import trace_generation

    if settings.GROQ_API_KEY:
        model = "llama-3.3-70b-versatile"
    elif settings.GEMINI_API_KEY:
        model = "gemini-2.0-flash"
    else:
        return f"[Dev mode - no AI key] Based on your documents, here are relevant excerpts:\n\n{context[:500]}"

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
