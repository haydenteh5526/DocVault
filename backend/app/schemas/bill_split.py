"""Housemate and bill split request and response models."""
import unicodedata
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

MAX_HOUSEMATES = 12
MAX_LABEL_LENGTH = 40


class HousemateCreate(BaseModel):
    label: str

    @field_validator("label")
    @classmethod
    def _clean_label(cls, value: str) -> str:
        label = unicodedata.normalize("NFC", value).strip()
        if not label:
            raise ValueError("Enter a name.")
        if len(label) > MAX_LABEL_LENGTH:
            raise ValueError(f"Use {MAX_LABEL_LENGTH} characters or fewer.")
        if not label.isprintable():
            raise ValueError("Use printable characters only.")
        return label


class HousemateOut(BaseModel):
    id: uuid.UUID
    label: str
    position: int
    created_at: datetime


class BillSplitRequest(BaseModel):
    # The confirmed revision number on screen when splitting started.
    bill_revision: int = Field(ge=1)
    rule: Literal["equal"]
    housemate_ids: list[uuid.UUID] = Field(min_length=2, max_length=MAX_HOUSEMATES)

    @field_validator("housemate_ids")
    @classmethod
    def _no_repeats(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(value)) != len(value):
            raise ValueError("Choose each person only once.")
        return value


class BillShare(BaseModel):
    housemate_id: uuid.UUID
    label: str
    amount: str


class BillSplitSave(BillSplitRequest):
    # 0 means no split existed when splitting started.
    base_split: int = Field(ge=0)
    # The shares the preview showed; the save is bound to them.
    reviewed: list[BillShare]


class BillSplitPreview(BaseModel):
    bill_revision: int
    rule: str
    total: str
    remainder_cents: int
    shares: list[BillShare]


class BillSplitOut(BillSplitPreview):
    id: uuid.UUID
    document_id: uuid.UUID
    split_number: int
    stale: bool
    created_at: datetime
