import uuid
from datetime import datetime

from pydantic import BaseModel


class TagOut(BaseModel):
    id: uuid.UUID
    name: str
    color: str | None = None

    model_config = {"from_attributes": True}


class DocumentOut(BaseModel):
    id: uuid.UUID
    title: str
    brand: str | None = None
    model: str | None = None
    document_type: str | None = None
    category_id: uuid.UUID | None = None
    raw_text: str | None = None
    summary: str | None = None
    file_size: int | None = None
    page_count: int = 1
    ocr_confidence: float | None = None
    image_url: str | None = None
    processing_status: str = "complete"
    is_favourite: bool = False
    tags: list[TagOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentUpdate(BaseModel):
    title: str | None = None
    brand: str | None = None
    model: str | None = None
    document_type: str | None = None
    category_id: uuid.UUID | None = None
    raw_text: str | None = None


class DocumentList(BaseModel):
    documents: list[DocumentOut]
    total: int
