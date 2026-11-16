"""Typed selections and results for the chat assistant (issue #5)."""
import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.schemas.bill_split import BillSplitPreview
from app.schemas.document import BillReview, BillSourceLine
from app.schemas.reminder import ReminderProposalOut

TOOLS = ("get_bill_facts", "split_bill", "propose_reminder", "draft_enquiry", "answer_from_documents", "decline")

Name = Annotated[str, StringConstraints(min_length=1, max_length=40)]


class Selection(BaseModel):
    """One tool chosen for a message. The server resolves and checks every field before using it."""

    model_config = ConfigDict(extra="forbid")

    tool: Literal["get_bill_facts", "split_bill", "propose_reminder", "draft_enquiry", "answer_from_documents", "decline"]
    document_ref: str | None = None
    people: list[Name] = Field(default_factory=list, max_length=12)
    count: int | None = Field(default=None, ge=2, le=12)
    days_before_due: int | None = Field(default=None, strict=True, ge=0, le=60)
    topic: str | None = None
    decline_reason: Literal["payment", "external_sending", "other"] | None = None

    @field_validator("topic")
    @classmethod
    def _clean_topic(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not 1 <= len(value) <= 80 or not value.isprintable():
            raise ValueError("The topic must be 1 to 80 printable characters.")
        return value


class SelectorMeta(BaseModel):
    selector: Literal["model", "rules", "pending"]
    model: str | None
    fallback_reason: str | None


class BillFacts(BaseModel):
    confirmed: bool
    revision: int | None
    amount_due: str | None
    due_date: date | None
    billing_period_start: date | None
    billing_period_end: date | None
    evidence: BillReview | None


class AssistantAction(BaseModel):
    kind: Literal[
        "answer", "bill_facts", "split_preview", "reminder_proposal", "enquiry_draft", "question", "notice", "declined"
    ]
    meta: SelectorMeta
    document_id: uuid.UUID | None = None
    document_title: str | None = None
    facts: BillFacts | None = None
    preview: BillSplitPreview | None = None
    proposal: ReminderProposalOut | None = None
    draft: str | None = None
    topic: str | None = None
    evidence: list[BillSourceLine] | None = None
    missing: Literal["which_bill", "which_people", "how_many_days", "what_topic"] | None = None
    options: list[str] | None = None
    pending: Selection | None = None
    reason: str | None = None


class TurnResult(BaseModel):
    content: str
    action: AssistantAction
    sources: list[dict] = Field(default_factory=list)
