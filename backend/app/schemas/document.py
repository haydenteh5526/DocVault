import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator


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


class BillSourceLine(BaseModel):
    line: int
    text: str


class BillField(BaseModel):
    # EUR decimal string, ISO date, or ISO start/end interval. None requires review.
    value: str | None
    sources: list[BillSourceLine]


class BillReview(BaseModel):
    amount_due: BillField
    due_date: BillField
    billing_period: BillField


class BillConfirmation(BaseModel):
    # EUR amount as a decimal string with exactly two decimals, stored as integer cents.
    amount_due: str = Field(pattern=r"^\d{1,7}\.\d{2}$")
    due_date: date
    billing_period_start: date
    billing_period_end: date
    # The review the owner saw when editing started; the save is bound to it.
    reviewed: BillReview
    # 0 means no revision existed when editing started.
    base_revision: int = Field(ge=0)

    @model_validator(mode="after")
    def _period_in_order(self) -> "BillConfirmation":
        if self.billing_period_end < self.billing_period_start:
            raise ValueError("The billing period must end on or after it starts.")
        return self


class BillRevisionOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    revision_number: int
    amount_due: str
    due_date: date
    billing_period_start: date
    billing_period_end: date
    evidence: BillReview
    created_at: datetime


class DocumentDetailOut(DocumentOut):
    bill_review: BillReview | None = None
    confirmed_bill: BillRevisionOut | None = None


class DocumentList(BaseModel):
    documents: list[DocumentOut]
    total: int
