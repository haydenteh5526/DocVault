"""Run one selection against the owner's own records and write the reply from what the services return.

Nothing here saves anything: it shows facts, previews a split, creates a pending reminder proposal,
drafts text, asks, or declines. Every figure comes from a revision, the review, a split preview or a proposal.
"""
import re
import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.assistant import (
    AssistantAction,
    BillFacts,
    Selection,
    SelectorMeta,
    TurnResult,
)
from app.schemas.bill_split import BillSplitRequest
from app.schemas.document import BillSourceLine
from app.schemas.reminder import ReminderProposalRequest
from app.services.assistant.bills import BillRef, resolve_bill
from app.services.assistant.rules import named_bill
from app.services.bill_review import extract_bill_review
from app.services.bill_revisions import latest_revision
from app.services.bill_split import BillSplitConflict, preview_split
from app.services.housemates import list_housemates
from app.services.rag_service import ChatTurn, generate_rag_answer
from app.services.reminders import ReminderConflict, current_request_numbers, propose_reminder

NO_BILLS = "I can't find a bill in your documents yet. Upload one, then open it and confirm its values."
NO_HOUSEMATES = "You have no saved housemates yet. Open the bill and add them in the Bill split panel."
ONE_HOUSEMATE = (
    "A split needs at least two people and you have saved only one housemate. "
    "Open the bill and add them in the Bill split panel."
)
CHANGED = "The bill changed while I was preparing that. Ask again."
PENDING = (
    "A reminder proposal is already waiting for your decision on this bill. Open the bill to approve or cancel it."
)
DECLINES = {
    "payment": (
        "I can't pay bills or move money. I can show what a bill says, split it between your housemates, "
        "or prepare a reminder before it is due."
    ),
    "external_sending": (
        "I can't send anything outside DocVault. I can draft a question for you to copy and send yourself."
    ),
    "other": (
        "I can't do that. I can answer from your documents, show a bill's amount and dates, split a bill, "
        "prepare a reminder, or draft a question for the supplier."
    ),
}
NEEDS_BILL = ("get_bill_facts", "split_bill", "propose_reminder", "draft_enquiry")


def fmt_date(value: date) -> str:
    return f"{value.day} {value:%B} {value.year}"


def _euro(amount: str) -> str:
    return f"€{amount}"


def _words(topic: str) -> list[str]:
    return [word.casefold() for word in re.findall(r"[^\W_]+", topic) if len(word) > 3]


def _evidence(raw_text: str | None, topic: str) -> list[BillSourceLine]:
    words = _words(topic)
    if not words or not raw_text:
        return []
    lines = []
    for number, line in enumerate(raw_text.splitlines(), start=1):
        folded = line.casefold()
        if all(word in folded for word in words):
            lines.append(BillSourceLine(line=number, text=line))
        if len(lines) == 3:
            break
    return lines


async def run_selection(
    db: AsyncSession,
    user_id: uuid.UUID,
    selection: Selection,
    bills: list[BillRef],
    scope_id: uuid.UUID | None,
    focus_id: uuid.UUID | None,
    question: str,
    history: list[ChatTurn],
    meta: SelectorMeta,
    scope_title: str | None = None,
) -> TurnResult:
    # A service conflict rolls the session back and expires loaded rows, so read the ids now.
    ids = {b.ref: b.document.id for b in bills}

    def reply(content: str, kind: str, bill: BillRef | None = None, **parts) -> TurnResult:
        sources = parts.pop("sources", [])
        action = AssistantAction(
            kind=kind,
            meta=meta,
            document_id=ids[bill.ref] if bill else None,
            document_title=bill.title if bill else None,
            **parts,
        )
        return TurnResult(content=content, action=action, sources=sources)

    tool = selection.tool
    if tool == "decline":
        reason = selection.decline_reason or "other"
        return reply(DECLINES[reason], "declined", reason=reason)

    if tool in NEEDS_BILL and not bills:
        return reply(NO_BILLS, "notice", reason="no_bills")

    if (
        tool in NEEDS_BILL
        and selection.document_ref is None
        and scope_id is not None
        and scope_id not in ids.values()
    ):
        action = AssistantAction(
            kind="notice",
            meta=meta,
            document_id=scope_id,
            document_title=scope_title,
            reason="not_a_bill",
        )
        content = (
            f"{scope_title} is not one of the bills I can work with. "
            "Ask about a bill by its name, or open the bill first."
        )
        return TurnResult(content=content, action=action, sources=[])

    bill = resolve_bill(bills, selection.document_ref, scope_id, focus_id)
    if bill is None and tool in NEEDS_BILL:
        titles = [b.title for b in bills]
        listing = "\n".join(f"{n}. {title}" for n, title in enumerate(titles, start=1))
        return reply(
            f"Which bill do you mean?\n{listing}",
            "question",
            missing="which_bill",
            options=titles,
            option_ids=[ids[b.ref] for b in bills],
            pending=selection.model_copy(update={"document_ref": None}),
        )

    if tool == "answer_from_documents":
        # Search all the owner's documents unless the owner scoped the request or the message names a bill in full.
        named_ref = named_bill(question, bills)
        named = next((b for b in bills if b.ref == named_ref), None)
        searched = scope_id if scope_id else (ids[named.ref] if named else None)
        result = await generate_rag_answer(
            question=question,
            user_id=user_id,
            db=db,
            document_id=str(searched) if searched else None,
            history=history,
        )
        sources = [source.to_dict() for source in result.sources]
        if scope_id:
            action = AssistantAction(
                kind="answer", meta=meta, document_id=scope_id, document_title=scope_title
            )
            return TurnResult(content=result.answer, action=action, sources=sources)
        return reply(result.answer, "answer", named, sources=sources)

    document = bill.document
    document_id, title, raw_text = ids[bill.ref], bill.title, document.raw_text
    revision = await latest_revision(db, document_id)

    def not_confirmed() -> TurnResult:
        return reply(
            f"{title} has no confirmed values yet. Open the bill, check the amount and dates, and confirm them first.",
            "notice",
            bill,
            reason="not_confirmed",
        )

    if tool == "get_bill_facts":
        if revision is not None:
            facts = BillFacts(
                confirmed=True,
                revision=revision.revision_number,
                amount_due=revision.amount_due,
                due_date=revision.due_date,
                billing_period_start=revision.billing_period_start,
                billing_period_end=revision.billing_period_end,
                evidence=revision.evidence,
            )
            content = (
                f"{title}: {_euro(revision.amount_due)} is due on {fmt_date(revision.due_date)}, "
                f"for {fmt_date(revision.billing_period_start)} to {fmt_date(revision.billing_period_end)}. "
                f"These are the values you confirmed (revision {revision.revision_number})."
            )
            return reply(content, "bill_facts", bill, facts=facts)
        review = extract_bill_review(raw_text)
        amount = review.amount_due.value if review else None
        due = date.fromisoformat(review.due_date.value) if review and review.due_date.value else None
        start = end = None
        if review and review.billing_period.value:
            first, second = review.billing_period.value.split("/")
            start, end = date.fromisoformat(first), date.fromisoformat(second)
        facts = BillFacts(
            confirmed=False,
            revision=None,
            amount_due=amount,
            due_date=due,
            billing_period_start=start,
            billing_period_end=end,
            evidence=review,
        )
        parts = []
        if amount:
            parts.append(f"amount due {_euro(amount)}")
        if due:
            parts.append(f"due date {fmt_date(due)}")
        if start and end:
            parts.append(f"billing period {fmt_date(start)} to {fmt_date(end)}")
        read = (
            f"{title} reads: {'; '.join(parts)}."
            if parts
            else f"I could not read the amount, due date or billing period from {title}."
        )
        content = f"{read} These have not been confirmed. Open the bill and check them against the original."
        return reply(content, "bill_facts", bill, facts=facts)

    if tool == "split_bill":
        if revision is None:
            return not_confirmed()
        saved = await list_housemates(db, user_id)
        if not saved:
            return reply(NO_HOUSEMATES, "notice", bill, reason="no_housemates")
        if len(saved) < 2:
            return reply(ONE_HOUSEMATE, "notice", bill, reason="no_housemates")
        by_key = {person.label.casefold(): person for person in saved}
        names = [person.label for person in saved]
        chosen = []
        unknown = False
        for name in selection.people:
            person = by_key.get(name.casefold())
            if person is None:
                unknown = True
            elif person not in chosen:
                chosen.append(person)
        if not selection.people and selection.count in (None, len(saved)):
            chosen = list(saved)
        if unknown or len(chosen) < 2:
            return reply(
                f"Who is sharing this bill? Your saved housemates are {', '.join(names)}.",
                "question",
                bill,
                missing="which_people",
                options=names,
                pending=selection.model_copy(update={"document_ref": None}),
            )
        try:
            preview = await preview_split(
                db,
                document,
                user_id,
                BillSplitRequest(
                    bill_revision=revision.revision_number, rule="equal", housemate_ids=[p.id for p in chosen]
                ),
            )
        except BillSplitConflict:
            return reply(CHANGED, "notice", bill, reason="changed")
        shares = ", ".join(f"{share.label} {_euro(share.amount)}" for share in preview.shares)
        content = (
            f"Equal split of {_euro(preview.total)} from revision {preview.bill_revision}: {shares}. "
            "Nothing was saved. Open the bill to review and save this split."
        )
        return reply(content, "split_preview", bill, preview=preview)

    if tool == "propose_reminder":
        if revision is None:
            return not_confirmed()
        if selection.days_before_due is None:
            return reply(
                "How many days before the due date should the reminder be?",
                "question",
                bill,
                missing="how_many_days",
                pending=selection.model_copy(update={"document_ref": None}),
            )
        numbers = await current_request_numbers(db, document_id)
        if numbers is None:
            return not_confirmed()
        number, split_number, proposal_number = numbers
        try:
            proposal = await propose_reminder(
                db,
                document,
                user_id,
                ReminderProposalRequest(
                    action="bill_reminder",
                    days_before_due=selection.days_before_due,
                    bill_revision=number,
                    bill_split=split_number,
                    base_proposal=proposal_number,
                ),
                source="assistant",
            )
        except ReminderConflict as conflict:
            if conflict.code == "proposal_pending":
                return reply(PENDING, "notice", bill, reason="proposal_pending")
            return reply(CHANGED, "notice", bill, reason="changed")
        details = proposal.details
        days = details.days_before_due
        when = "on the day" if days == 0 else f"{days} day{'' if days == 1 else 's'} before"
        content = (
            f"I've prepared a reminder for {fmt_date(details.remind_on)}, {when} "
            f"{_euro(details.amount_due)} is due on {fmt_date(details.due_date)}. "
            "It is not saved. Open the bill to approve or cancel it."
        )
        return reply(content, "reminder_proposal", bill, proposal=proposal)

    # draft_enquiry
    if selection.topic is None:
        return reply(
            "What should the question to the supplier be about?",
            "question",
            bill,
            missing="what_topic",
            pending=selection.model_copy(update={"document_ref": None}),
        )
    topic = selection.topic
    evidence = _evidence(raw_text, topic)
    period = (
        f" for {fmt_date(revision.billing_period_start)} to {fmt_date(revision.billing_period_end)}"
        if revision
        else ""
    )
    body = f"I have a question about {topic} on my bill{period}."
    if revision:
        body += f" The amount due is {_euro(revision.amount_due)}, payable by {fmt_date(revision.due_date)}."
    block = ""
    if evidence:
        block = "The bill shows:\n" + "\n".join(f'"{line.text}"' for line in evidence) + "\n\n"
    draft = (
        f"Subject: Question about {title}\n\nHello,\n\n{body}\n\n{block}"
        "Could you explain how this was worked out?\n\nThank you."
    )
    return reply(
        "Here is a draft you can edit and send yourself. DocVault does not send it.",
        "enquiry_draft",
        bill,
        draft=draft,
        topic=topic,
        evidence=evidence,
    )
