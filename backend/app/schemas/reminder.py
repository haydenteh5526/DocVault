"""Reminder proposal, approval and history models."""
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.bill_split import BillShare

# The only action the assistant (issue #5) or the owner may request. Anything else is a 422.
REMINDER_ACTIONS = ("bill_reminder",)
MAX_DAYS_BEFORE_DUE = 60


class ReminderProposalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["bill_reminder"]
    days_before_due: int = Field(strict=True, ge=0, le=MAX_DAYS_BEFORE_DUE)
    # The confirmed revision number on screen.
    bill_revision: int = Field(ge=1)
    # The number of the split on screen if it is not stale, otherwise 0.
    bill_split: int = Field(ge=0)
    # The latest proposal number on screen, 0 if none.
    base_proposal: int = Field(ge=0)


class ReminderSplit(BaseModel):
    split_number: int
    total: str
    shares: list[BillShare]


class ReminderDetails(BaseModel):
    bill_revision: int
    amount_due: str
    due_date: date
    billing_period_start: date
    billing_period_end: date
    days_before_due: int
    remind_on: date
    split: ReminderSplit | None


class ReminderApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The details the owner was shown; the approval is bound to them.
    reviewed: ReminderDetails


class ReminderOut(BaseModel):
    id: uuid.UUID
    proposal_id: uuid.UUID
    remind_on: date
    created_at: datetime


class ReminderEventOut(BaseModel):
    sequence: int
    event: str
    detail: dict
    created_at: datetime


class ReminderProposalOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    proposal_number: int
    action: str
    source: str
    status: str
    inputs_changed: str | None
    details: ReminderDetails
    reminder: ReminderOut | None
    history: list[ReminderEventOut]
    created_at: datetime
    decided_at: datetime | None
