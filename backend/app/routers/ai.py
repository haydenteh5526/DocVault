import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user_id, get_db
from app.services.rag_service import ChatTurn as RAGChatTurn
from app.services.rag_service import generate_rag_answer

router = APIRouter()


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AskRequest(BaseModel):
    question: str
    document_id: str | None = None
    history: list[ChatTurn] = []


class Source(BaseModel):
    document_id: str
    document_title: str
    chunk_text: str
    similarity: float


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]


@router.get("/status")
async def ai_status():
    """Report AI provider availability for the Settings page."""
    status = {
        "groq": bool(settings.GROQ_API_KEY),
        "gemini": bool(settings.GEMINI_API_KEY),
        "ollama": bool(settings.OLLAMA_URL),
        "ocr_backend": settings.OCR_BACKEND,
        "mode": (
            "groq" if settings.GROQ_API_KEY
            else "gemini" if settings.GEMINI_API_KEY
            else "ollama" if settings.OLLAMA_URL
            else "dev-fallback"
        ),
    }
    return status


@router.post("/ask", response_model=AskResponse)
async def ask_question(req: AskRequest, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    # Convert pydantic ChatTurn to RAG ChatTurn
    history = [RAGChatTurn(role=t.role, content=t.content) for t in req.history] if req.history else None

    rag_result = await generate_rag_answer(
        question=req.question,
        user_id=user_id,
        db=db,
        document_id=req.document_id,
        history=history,
    )

    sources = [
        Source(
            document_id=s.document_id,
            document_title=s.document_title,
            chunk_text=s.chunk_text,
            similarity=s.similarity,
        )
        for s in rag_result.sources
    ]

    return AskResponse(answer=rag_result.answer, sources=sources)
