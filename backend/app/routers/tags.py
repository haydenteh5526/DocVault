import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user_id, get_db
from app.models.base import Document, Tag

router = APIRouter()


class TagCreate(BaseModel):
    name: str
    color: str | None = None


def _serialize(tag: Tag) -> dict:
    return {"id": str(tag.id), "name": tag.name, "color": tag.color}


@router.get("")
async def list_tags(db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    result = await db.execute(select(Tag).where(Tag.user_id == user_id).order_by(Tag.name))
    return [_serialize(t) for t in result.scalars().all()]


@router.post("", status_code=201)
async def create_tag(req: TagCreate, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    name = req.name.strip()
    if not name:
        raise HTTPException(422, {"code": "INVALID_TAG", "message": "Tag name cannot be empty."})
    # Idempotent: return existing tag if the name already exists for this user
    existing = await db.execute(select(Tag).where(Tag.user_id == user_id, Tag.name == name))
    found = existing.scalar_one_or_none()
    if found:
        return _serialize(found)
    tag = Tag(user_id=user_id, name=name, color=req.color)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return _serialize(tag)


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(tag_id: uuid.UUID, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    result = await db.execute(select(Tag).where(Tag.id == tag_id, Tag.user_id == user_id))
    tag = result.scalar_one_or_none()
    if tag:
        await db.delete(tag)
        await db.commit()


async def _get_document(document_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Document:
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == user_id)
        .options(selectinload(Document.tags))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Document not found."})
    return doc


@router.put("/documents/{document_id}/tags/{tag_id}", status_code=204)
async def add_tag_to_document(document_id: uuid.UUID, tag_id: uuid.UUID, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    doc = await _get_document(document_id, user_id, db)
    tag_result = await db.execute(select(Tag).where(Tag.id == tag_id, Tag.user_id == user_id))
    tag = tag_result.scalar_one_or_none()
    if not tag:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Tag not found."})
    if tag not in doc.tags:
        doc.tags.append(tag)
        await db.commit()


@router.delete("/documents/{document_id}/tags/{tag_id}", status_code=204)
async def remove_tag_from_document(document_id: uuid.UUID, tag_id: uuid.UUID, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    doc = await _get_document(document_id, user_id, db)
    doc.tags = [t for t in doc.tags if t.id != tag_id]
    await db.commit()
