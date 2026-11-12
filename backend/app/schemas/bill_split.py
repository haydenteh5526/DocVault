"""Housemate and bill split request and response models."""
import unicodedata
import uuid
from datetime import datetime


from pydantic import BaseModel, field_validator

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
