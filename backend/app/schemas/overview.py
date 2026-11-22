"""The owner's overview: what needs them, what is coming up, recent documents, counts and every status."""
import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel

AttentionKind = Literal["reminder_pending", "bill_unconfirmed", "split_stale", "processing_failed", "warranty_ending"]
UpcomingKind = Literal["bill_due", "renewal", "contract_end", "warranty_end"]
StatusTone = Literal["neutral", "attention", "danger"]
RecentOutcome = Literal[
    "processing", "failed", "due_date_flagged", "bill_confirmed",
    "warranty_added", "renewal_found", "term_end_found", "ready",
]


class SourceLine(BaseModel):
    line: int
    text: str


class AttentionItem(BaseModel):
    kind: AttentionKind
    document_id: uuid.UUID
    title: str
    date: dt.date | None = None  # due date, remind-on date or warranty end
    amount_due: str | None = None  # "45.00"
    proposal_id: uuid.UUID | None = None
    source: SourceLine | None = None  # the verbatim document line behind the item, for the approval strip


class UpcomingItem(BaseModel):
    kind: UpcomingKind
    document_id: uuid.UUID
    title: str
    date: dt.date
    amount_due: str | None = None
    confirmed: bool  # True for confirmed bills and saved warranties
    source: SourceLine | None = None  # for dates read from the text


class BillFacts(BaseModel):
    amount_due: str | None
    due_date: dt.date | None
    confirmed: bool


class DocumentStatus(BaseModel):
    label: str  # exactly the strings DocumentStatus.tsx uses today
    tone: StatusTone
    bill: BillFacts | None = None


class RecentDocument(BaseModel):
    id: uuid.UUID
    title: str
    kind: str | None
    processing_status: str
    created_at: dt.datetime
    outcome: RecentOutcome  # what DocBot did with the document, for the activity chips
    outcome_label: str  # the chip text


class OverviewOut(BaseModel):
    attention: list[AttentionItem]
    attention_count: int
    upcoming: list[UpcomingItem]  # today .. today+60, soonest first
    next_after_window: UpcomingItem | None  # the first date after the window, for the calm state
    recent: list[RecentDocument]  # newest 5
    counts: dict[str, int]  # {"total": n, "Bill": n, ...}: kinds with n > 0
    statuses: dict[uuid.UUID, DocumentStatus]  # every document of the owner
    processing: int  # documents pending or processing
