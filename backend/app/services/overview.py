"""Build the owner's overview from one pass over their documents.

Every query filters on the owner. Text is loaded and scanned only for complete documents whose kind can
carry bill fields or dates (`scans_text`), so a vault of manuals costs nothing to read.
"""
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.models.base import BillRevision, Document, Warranty
from app.schemas.bill_split import BillSplitOut
from app.schemas.document import BillField, BillReview, BillRevisionOut
from app.schemas.overview import (
    AttentionItem,
    BillFacts,
    DocumentStatus,
    OverviewOut,
    RecentDocument,
    SourceLine,
    UpcomingItem,
)
from app.schemas.reminder import ReminderProposalOut
from app.services.bill_review import extract_bill_review
from app.services.bill_revisions import latest_revision
from app.services.bill_split import latest_split
from app.services.categorisation_service import KINDS
from app.services.key_dates import DatedLine, extract_key_dates, reviews_bills, scans_text
from app.services.reminders import list_proposals

UPCOMING_DAYS = 60
WARRANTY_ATTENTION_DAYS = 30
RECENT_COUNT = 5

_ATTENTION_ORDER = ["reminder_pending", "bill_unconfirmed", "split_stale", "processing_failed", "warranty_ending"]
_IN_PROGRESS = ("pending", "processing")


@dataclass
class _Facts:
    """What the overview knows about one document."""

    doc: Document
    review: BillReview | None = None
    key_dates: list[DatedLine] = field(default_factory=list)
    revision: BillRevisionOut | None = None
    split: BillSplitOut | None = None
    proposals: list[ReminderProposalOut] = field(default_factory=list)
    warranty_end: date | None = None

    @property
    def pending_proposals(self) -> list[ReminderProposalOut]:
        return [p for p in self.proposals if p.status == "pending" and not p.inputs_changed]

    @property
    def unconfirmed_review(self) -> BillReview | None:
        """The bill review, when no confirmed revision exists yet."""
        return self.review if self.revision is None else None


def _source(field_: BillField | None) -> SourceLine | None:
    if field_ is None or not field_.sources:
        return None
    first = field_.sources[0]
    return SourceLine(line=first.line, text=first.text)


def _review_due(review: BillReview) -> date | None:
    return date.fromisoformat(review.due_date.value) if review.due_date.value else None


async def _load(db: AsyncSession, user_id: uuid.UUID) -> list[_Facts]:
    # Query 1: every owner document, without its text.
    docs = (
        await db.execute(
            select(Document)
            .where(Document.user_id == user_id)
            .options(load_only(Document.id, Document.title, Document.document_type,
                               Document.processing_status, Document.created_at))
            .order_by(Document.created_at.desc(), Document.id)
        )
    ).scalars().all()
    facts = {doc.id: _Facts(doc) for doc in docs}

    # Query 2: text only for complete documents that may be bills, policies or contracts.
    scanned = [doc.id for doc in docs if doc.processing_status == "complete" and scans_text(doc.document_type)]
    if scanned:
        rows = await db.execute(
            select(Document.id, Document.raw_text).where(Document.user_id == user_id, Document.id.in_(scanned))
        )
        for doc_id, text in rows:
            item = facts[doc_id]
            # Only bills and unclassified documents get a bill review (D4); key dates use the wider scope.
            if reviews_bills(item.doc.document_type):
                item.review = extract_bill_review(text)
            item.key_dates = extract_key_dates(text, item.doc.document_type)

    with_revision = set(
        (
            await db.execute(
                select(BillRevision.document_id)
                .join(Document, Document.id == BillRevision.document_id)
                .where(Document.user_id == user_id)
                .distinct()
            )
        ).scalars()
    )
    # Confirmed revisions, splits and proposals only for documents that have a review or a revision.
    for item in facts.values():
        if item.review is not None or item.doc.id in with_revision:
            item.revision = await latest_revision(db, item.doc.id)
            item.split = await latest_split(db, item.doc.id)
            item.proposals = await list_proposals(db, item.doc.id)

    warranties = await db.execute(
        select(Warranty.document_id, Warranty.expiry_date)
        .join(Document, Document.id == Warranty.document_id)
        .where(
            Document.user_id == user_id,
            Warranty.expiry_date.is_not(None),
            # A document created after query 1 waits for the next overview.
            Warranty.document_id.in_(list(facts)),
        )
    )
    for doc_id, expiry in warranties:
        # The model says datetime; the column is a date in the database.
        facts[doc_id].warranty_end = expiry.date() if isinstance(expiry, datetime) else expiry

    return list(facts.values())


def _attention(facts: list[_Facts], today: date) -> list[AttentionItem]:
    items: list[AttentionItem] = []
    for f in facts:
        doc = f.doc
        base = {"document_id": doc.id, "title": doc.title}
        for proposal in f.pending_proposals:
            items.append(AttentionItem(
                kind="reminder_pending", **base, date=proposal.details.remind_on,
                amount_due=proposal.details.amount_due, proposal_id=proposal.id,
                source=_source(f.revision.evidence.due_date) if f.revision else None,
            ))
        if (review := f.unconfirmed_review) is not None:
            items.append(AttentionItem(
                kind="bill_unconfirmed", **base, date=_review_due(review), amount_due=review.amount_due.value,
                source=_source(review.due_date) or _source(review.amount_due),
            ))
        if f.split is not None and f.split.stale:
            items.append(AttentionItem(
                kind="split_stale", **base,
                amount_due=f.revision.amount_due if f.revision else None,
                source=_source(f.revision.evidence.amount_due) if f.revision else None,
            ))
        if doc.processing_status == "failed":
            items.append(AttentionItem(kind="processing_failed", **base))
        if f.warranty_end and today <= f.warranty_end <= today + timedelta(days=WARRANTY_ATTENTION_DAYS):
            items.append(AttentionItem(kind="warranty_ending", **base, date=f.warranty_end))
    return sorted(items, key=lambda i: (_ATTENTION_ORDER.index(i.kind), i.date is None, i.date or today, i.title))


def _dates(facts: list[_Facts]) -> list[UpcomingItem]:
    items: list[UpcomingItem] = []
    for f in facts:
        base = {"document_id": f.doc.id, "title": f.doc.title}
        if f.revision is not None:
            items.append(UpcomingItem(kind="bill_due", **base, date=f.revision.due_date,
                                      amount_due=f.revision.amount_due, confirmed=True))
        elif f.review is not None and (due := _review_due(f.review)):
            items.append(UpcomingItem(kind="bill_due", **base, date=due, amount_due=f.review.amount_due.value,
                                      confirmed=False, source=_source(f.review.due_date)))
        for found in f.key_dates:
            items.append(UpcomingItem(kind=found.kind, **base, date=found.date, confirmed=False,
                                      source=SourceLine(line=found.line, text=found.text)))
        if f.warranty_end:
            items.append(UpcomingItem(kind="warranty_end", **base, date=f.warranty_end, confirmed=True))
    return sorted(items, key=lambda i: (i.date, i.title))


def _status(f: _Facts) -> DocumentStatus:
    # The same precedence as frontend/src/components/DocumentStatus.tsx.
    bill = None
    if f.revision is not None:
        bill = BillFacts(amount_due=f.revision.amount_due, due_date=f.revision.due_date, confirmed=True)
    elif f.review is not None:
        bill = BillFacts(amount_due=f.review.amount_due.value, due_date=_review_due(f.review), confirmed=False)

    status = f.doc.processing_status
    if status == "failed":
        return DocumentStatus(label="Could not read this file", tone="danger", bill=bill)
    if status and status != "complete":
        return DocumentStatus(label="Reading the text", tone="neutral", bill=bill)
    if f.pending_proposals:
        return DocumentStatus(label="Reminder awaiting approval", tone="attention", bill=bill)
    if f.split is not None and f.split.stale:
        return DocumentStatus(label="Split out of date", tone="attention", bill=bill)
    if f.unconfirmed_review is not None:
        return DocumentStatus(label="Needs confirming", tone="attention", bill=bill)
    if f.revision is not None:
        return DocumentStatus(label=f"Confirmed · revision {f.revision.revision_number}", tone="neutral", bill=bill)
    return DocumentStatus(label="Ready", tone="neutral", bill=bill)


def _outcome(f: _Facts) -> tuple[str, str]:
    status = f.doc.processing_status
    if status == "failed":
        return "failed", "Could not read"
    if status in _IN_PROGRESS:
        return "processing", "Processing"
    if (review := f.unconfirmed_review) is not None and review.due_date.value:
        return "due_date_flagged", "Due date flagged"
    if f.revision is not None:
        return "bill_confirmed", "Bill confirmed"
    if f.warranty_end:
        return "warranty_added", "Warranty added"
    kinds = {found.kind for found in f.key_dates}
    if "renewal" in kinds:
        return "renewal_found", "Renewal found"
    if "contract_end" in kinds:
        return "term_end_found", "Term end found"
    return "ready", "Ready"


def _recent(facts: list[_Facts]) -> list[RecentDocument]:
    out = []
    for f in facts[:RECENT_COUNT]:  # facts are newest first
        outcome, label = _outcome(f)
        out.append(RecentDocument(
            id=f.doc.id, title=f.doc.title, kind=f.doc.document_type, processing_status=f.doc.processing_status,
            created_at=f.doc.created_at, outcome=outcome, outcome_label=label,
        ))
    return out


def _counts(facts: list[_Facts]) -> dict[str, int]:
    counts = {"total": len(facts)}
    for kind in KINDS:
        n = sum(1 for f in facts if f.doc.document_type == kind)
        if n:
            counts[kind] = n
    return counts


async def build_overview(db: AsyncSession, user_id: uuid.UUID, today: date) -> OverviewOut:
    facts = await _load(db, user_id)
    attention = _attention(facts, today)
    dates = _dates(facts)
    window_end = today + timedelta(days=UPCOMING_DAYS)
    return OverviewOut(
        attention=attention,
        attention_count=len(attention),
        upcoming=[item for item in dates if today <= item.date <= window_end],
        next_after_window=next((item for item in dates if item.date > window_end), None),
        recent=_recent(facts),
        counts=_counts(facts),
        statuses={f.doc.id: _status(f) for f in facts},
        processing=sum(1 for f in facts if f.doc.processing_status in _IN_PROGRESS),
    )
