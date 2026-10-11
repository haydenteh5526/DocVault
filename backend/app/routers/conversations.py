"""Conversations router — ChatGPT-like persistent chat with RAG."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user_id, get_db
from app.models.base import Conversation, ConversationMessage
from app.services.rag_service import ChatTurn as RAGChatTurn
from app.services.rag_service import generate_rag_answer

router = APIRouter()


# ─── Schemas ───────────────────────────────────────────────────────────────────


class ConversationCreate(BaseModel):
    title: str | None = None


class ConversationUpdate(BaseModel):
    title: str | None = None
    is_pinned: bool | None = None


class ConversationSummary(BaseModel):
    id: str
    title: str
    is_pinned: bool
    created_at: datetime
    updated_at: datetime
    message_count: int


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    sources: list[dict] | None = None
    created_at: datetime


class ConversationDetail(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageOut]


class SendMessageRequest(BaseModel):
    question: str
    document_id: str | None = None


class SendMessageResponse(BaseModel):
    user_message: MessageOut
    assistant_message: MessageOut


# ─── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=list[ConversationSummary])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """List the user's conversations ordered by pinned first, then most recently updated."""
    # Subquery to count messages per conversation
    msg_count_subq = (
        select(
            ConversationMessage.conversation_id,
            func.count(ConversationMessage.id).label("message_count"),
        )
        .group_by(ConversationMessage.conversation_id)
        .subquery()
    )

    stmt = (
        select(
            Conversation.id,
            Conversation.title,
            Conversation.is_pinned,
            Conversation.created_at,
            Conversation.updated_at,
            func.coalesce(msg_count_subq.c.message_count, 0).label("message_count"),
        )
        .outerjoin(msg_count_subq, Conversation.id == msg_count_subq.c.conversation_id)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.is_pinned.desc(), Conversation.updated_at.desc())
    )

    result = await db.execute(stmt)
    rows = result.fetchall()

    return [
        ConversationSummary(
            id=str(row.id),
            title=row.title,
            is_pinned=row.is_pinned,
            created_at=row.created_at,
            updated_at=row.updated_at,
            message_count=row.message_count,
        )
        for row in rows
    ]


@router.post("", response_model=ConversationDetail, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Create a new empty conversation."""
    conversation = Conversation(
        id=uuid.uuid4(),
        user_id=user_id,
        title=body.title or "New conversation",
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)

    return ConversationDetail(
        id=str(conversation.id),
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[],
    )


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Get a conversation with all its messages."""
    stmt = (
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    result = await db.execute(stmt)
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    return ConversationDetail(
        id=str(conversation.id),
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[
            MessageOut(
                id=str(m.id),
                role=m.role,
                content=m.content,
                sources=m.sources,
                created_at=m.created_at,
            )
            for m in conversation.messages
        ],
    )


@router.patch("/{conversation_id}", response_model=ConversationSummary)
async def update_conversation(
    conversation_id: uuid.UUID,
    body: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Update a conversation's title or pin status."""
    stmt = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.user_id == user_id,
    )
    result = await db.execute(stmt)
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    if body.title is not None:
        conversation.title = body.title
    if body.is_pinned is not None:
        conversation.is_pinned = body.is_pinned

    await db.commit()
    await db.refresh(conversation)

    # Get message count
    msg_count_stmt = select(func.count(ConversationMessage.id)).where(
        ConversationMessage.conversation_id == conversation_id
    )
    msg_count = (await db.execute(msg_count_stmt)).scalar() or 0

    return ConversationSummary(
        id=str(conversation.id),
        title=conversation.title,
        is_pinned=conversation.is_pinned,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        message_count=msg_count,
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Delete a conversation and all its messages."""
    stmt = delete(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.user_id == user_id,
    )
    result = await db.execute(stmt)
    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")


@router.post("/{conversation_id}/messages", response_model=SendMessageResponse)
async def send_message(
    conversation_id: uuid.UUID,
    body: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Send a message in a conversation and get an AI response via RAG."""
    # Verify conversation belongs to user
    stmt = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.user_id == user_id,
    )
    result = await db.execute(stmt)
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    # Load existing messages for history context
    msg_stmt = (
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at)
    )
    msg_result = await db.execute(msg_stmt)
    existing_messages = msg_result.scalars().all()

    # Build history from existing messages
    history = [RAGChatTurn(role=m.role, content=m.content) for m in existing_messages]

    # Save user message
    user_msg = ConversationMessage(
        id=uuid.uuid4(),
        conversation_id=conversation_id,
        role="user",
        content=body.question,
    )
    db.add(user_msg)

    # Generate AI response using shared RAG logic
    rag_result = await generate_rag_answer(
        question=body.question,
        user_id=user_id,
        db=db,
        document_id=body.document_id,
        history=history,
    )

    # Save assistant message with sources
    sources_data = [s.to_dict() for s in rag_result.sources] if rag_result.sources else None
    assistant_msg = ConversationMessage(
        id=uuid.uuid4(),
        conversation_id=conversation_id,
        role="assistant",
        content=rag_result.answer,
        sources=sources_data,
    )
    db.add(assistant_msg)

    # Update conversation title if it's the first message (auto-generate from question)
    if not existing_messages and not conversation.title.startswith("["):
        title = body.question[:100].strip()
        if len(body.question) > 100:
            title += "..."
        await db.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(title=title, updated_at=func.now())
        )
    else:
        # Just update the timestamp
        await db.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(updated_at=func.now())
        )

    await db.commit()
    await db.refresh(user_msg)
    await db.refresh(assistant_msg)

    return SendMessageResponse(
        user_message=MessageOut(
            id=str(user_msg.id),
            role=user_msg.role,
            content=user_msg.content,
            sources=None,
            created_at=user_msg.created_at,
        ),
        assistant_message=MessageOut(
            id=str(assistant_msg.id),
            role=assistant_msg.role,
            content=assistant_msg.content,
            sources=assistant_msg.sources,
            created_at=assistant_msg.created_at,
        ),
    )
