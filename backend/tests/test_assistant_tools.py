"""Assistant tools answer from the owner's checked bill records and never save anything."""

import uuid
from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import func, select

from app.dependencies import async_session
from app.models.base import BillSplit, Document, ReminderProposal
from app.schemas.assistant import Selection, SelectorMeta
from app.schemas.bill_split import BillSplitRequest
from app.schemas.document import BillConfirmation
from app.services.assistant.bills import owner_bills, resolve_bill
from app.services.assistant.tools import run_selection
from app.services.bill_review import extract_bill_review
from app.services.bill_revisions import save_revision
from app.services.bill_split import save_split
from app.services.housemates import add_housemate, list_housemates
from app.services.rag_service import RAGResult, Source
from tests.accounts import create_users_and_document, delete_users

BILL = (
    "Electricity bill\nTotal amount due: EUR 123.47\n"
    "Billing period: 1 October 2026 to 31 October 2026\nPayment due date: 23 November 2026\n"
    "Standing charge: EUR 18.20"
)
FOUR = ("Aoife", "Ben", "Chidi", "Dara")
META = SelectorMeta(selector="rules", model=None, fallback_reason=None)
PAYMENT = (
    "I can't pay bills or move money. I can show what a bill says, split it between your housemates, "
    "or prepare a reminder before it is due."
)
SENDING = (
    "I can't send anything outside DocVault. I can draft a question for you to copy and send yourself."
)


@pytest.fixture
async def bill():
    owner_id, other_id, document_id = await create_users_and_document(raw_text=BILL)
    yield owner_id, other_id, document_id
    await delete_users(owner_id, other_id)


async def _add_document(user_id, title, raw_text=BILL, status="complete", created_at=None):
    async with async_session() as db:
        document = Document(
            user_id=user_id,
            title=title,
            s3_key_original=f"users/{user_id}/{uuid.uuid4()}.pdf",
            raw_text=raw_text,
            processing_status=status,
            created_at=created_at or datetime.utcnow(),
        )
        db.add(document)
        await db.commit()
        return document.id


async def _confirmed(document_id, amount="123.47", due="2026-11-23", base=0):
    async with async_session() as db:
        document = (await db.execute(select(Document).where(Document.id == document_id))).scalar_one()
        review = extract_bill_review(document.raw_text)
        await save_revision(
            db,
            document,
            BillConfirmation(
                amount_due=amount,
                due_date=date.fromisoformat(due),
                billing_period_start=date(2026, 10, 1),
                billing_period_end=date(2026, 10, 31),
                reviewed=review,
                base_revision=base,
            ),
        )


async def _roster(user_id, *labels):
    async with async_session() as db:
        for label in labels:
            await add_housemate(db, user_id, label)
        await db.commit()


async def _split_saved(document_id, user_id):
    async with async_session() as db:
        document = (await db.execute(select(Document).where(Document.id == document_id))).scalar_one()
        people = await list_housemates(db, user_id)
        ids = [p.id for p in people]
        request = BillSplitRequest(bill_revision=1, rule="equal", housemate_ids=ids)
        from app.services.bill_split import preview_split

        preview = await preview_split(db, document, user_id, request)
        from app.schemas.bill_split import BillSplitSave

        await save_split(
            db, document, user_id, BillSplitSave(**request.model_dump(), base_split=0, reviewed=preview.shares)
        )


async def _run(user_id, scope_id=None, focus_id=None, question="q", **selection):
    async with async_session() as db:
        bills = await owner_bills(db, user_id)
        return await run_selection(
            db, user_id, Selection(**selection), bills, scope_id, focus_id, question, [], META
        )


async def _count(model, document_id):
    async with async_session() as db:
        return (
            await db.execute(select(func.count()).select_from(model).where(model.document_id == document_id))
        ).scalar_one()


@pytest.mark.asyncio
async def test_only_the_owners_recent_bills_are_listed(bill):
    owner_id, other_id, _ = bill
    await _add_document(owner_id, "User manual", raw_text="Washing machine manual")
    await _add_document(owner_id, "Still processing", status="processing")
    async with async_session() as db:
        bills = await owner_bills(db, owner_id)
        assert [b.ref for b in bills] == ["bill-1"]
        assert bills[0].title == "Owner only"
        assert await owner_bills(db, other_id) == []

    now = datetime.utcnow()
    for index in range(12):
        await _add_document(other_id, f"Bill {index}", created_at=now + timedelta(minutes=index))
    async with async_session() as db:
        bills = await owner_bills(db, other_id)
        assert len(bills) == 10
        assert [b.title for b in bills][0] == "Bill 11"
        assert [b.ref for b in bills][:2] == ["bill-1", "bill-2"]


@pytest.mark.asyncio
async def test_a_reference_outside_the_owners_bills_is_never_guessed(bill):
    owner_id, other_id, document_id = bill
    foreign = await _add_document(other_id, "Foreign bill")
    async with async_session() as db:
        bills = await owner_bills(db, owner_id)
    assert resolve_bill(bills, "bill-9", document_id, document_id) is None
    assert resolve_bill(bills, str(foreign), None, None) is None


@pytest.mark.asyncio
async def test_bill_resolution_order(bill):
    owner_id, _, first = bill
    now = datetime.utcnow()
    second = await _add_document(owner_id, "Second bill", created_at=now + timedelta(minutes=5))
    async with async_session() as db:
        bills = await owner_bills(db, owner_id)
    by_doc = {b.document.id: b for b in bills}
    assert resolve_bill(bills, None, first, second) is by_doc[first]
    assert resolve_bill(bills, None, None, second) is by_doc[second]
    assert resolve_bill(bills, None, None, None) is None
    assert resolve_bill(bills, by_doc[second].ref, first, first) is by_doc[second]
    assert resolve_bill(bills[:1], None, None, None) is bills[0]


@pytest.mark.asyncio
async def test_confirmed_facts_come_from_the_revision(bill):
    owner_id, _, document_id = bill
    await _confirmed(document_id, "125.00")
    result = await _run(owner_id, tool="get_bill_facts")
    action = result.action
    assert action.kind == "bill_facts"
    assert action.facts.confirmed and action.facts.revision == 1
    assert action.facts.amount_due == "125.00"
    assert action.facts.evidence is not None
    assert action.facts.evidence.due_date.sources[0].text == "Payment due date: 23 November 2026"
    assert result.content == (
        "Owner only: €125.00 is due on 23 November 2026, for 1 October 2026 to 31 October 2026. "
        "These are the values you confirmed (revision 1)."
    )
    assert action.document_id == document_id and action.document_title == "Owner only"


@pytest.mark.asyncio
async def test_unconfirmed_facts_are_labelled(bill):
    owner_id, other_id, document_id = bill
    result = await _run(owner_id, tool="get_bill_facts")
    assert result.action.facts.confirmed is False
    assert result.action.facts.amount_due == "123.47"
    assert result.content.endswith(
        "These have not been confirmed. Open the bill and check them against the original."
    )
    assert result.content.startswith("The bill reads: amount due €123.47; due date 23 November 2026;")

    async with async_session() as db:
        doc = (await db.execute(select(Document).where(Document.id == document_id))).scalar_one()
        doc.raw_text = BILL.replace("Payment due date: 23 November 2026", "Payment due date: soon")
        await db.commit()
    result = await _run(owner_id, tool="get_bill_facts")
    assert "due date" not in result.content.split("These have not")[0]
    assert result.action.facts.due_date is None


@pytest.mark.asyncio
async def test_two_bills_and_no_hint_asks_which(bill):
    owner_id, _, _ = bill
    await _add_document(owner_id, "Second bill", created_at=datetime.utcnow() + timedelta(minutes=1))
    result = await _run(owner_id, tool="get_bill_facts")
    action = result.action
    assert action.kind == "question" and action.missing == "which_bill"
    assert action.options == ["Second bill", "Owner only"]
    assert action.pending.tool == "get_bill_facts" and action.pending.document_ref is None
    assert result.content.startswith("Which bill do you mean?")


@pytest.mark.asyncio
async def test_no_bills_says_so():
    owner_id, other_id, _ = await create_users_and_document(raw_text="Manual")
    try:
        result = await _run(owner_id, tool="get_bill_facts")
        assert result.action.kind == "notice" and result.action.reason == "no_bills"
        assert result.content == (
            "I can't find a bill in your documents yet. Upload one, then open it and confirm its values."
        )
    finally:
        await delete_users(owner_id, other_id)


@pytest.mark.asyncio
async def test_the_four_person_split_is_previewed_and_not_saved(bill):
    owner_id, _, document_id = bill
    await _confirmed(document_id)
    await _roster(owner_id, *FOUR)
    result = await _run(owner_id, tool="split_bill", people=[], count=4)
    action = result.action
    assert action.kind == "split_preview"
    assert [s.amount for s in action.preview.shares] == ["30.87", "30.87", "30.87", "30.86"]
    assert [s.label for s in action.preview.shares] == list(FOUR)
    assert "Aoife €30.87" in result.content
    assert result.content.endswith("Open the bill to review and save this split.")
    assert await _count(BillSplit, document_id) == 0


@pytest.mark.asyncio
async def test_named_people_are_matched_ignoring_case(bill):
    owner_id, _, document_id = bill
    await _confirmed(document_id)
    await _roster(owner_id, *FOUR)
    result = await _run(owner_id, tool="split_bill", people=["ben", "AOIFE"])
    shares = result.action.preview.shares
    assert [(s.label, s.amount) for s in shares] == [("Ben", "61.74"), ("Aoife", "61.73")]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "selection",
    [
        {"people": ["Person 1", "Person 2", "Person 3", "Person 4"]},
        {"people": ["Aoife", "Zed"]},
        {"people": [], "count": 3},
    ],
)
async def test_people_the_owner_never_saved_are_asked_about(bill, selection):
    owner_id, _, document_id = bill
    await _confirmed(document_id)
    await _roster(owner_id, *FOUR)
    result = await _run(owner_id, tool="split_bill", **selection)
    action = result.action
    assert action.kind == "question" and action.missing == "which_people"
    assert action.options == list(FOUR)
    assert action.preview is None
    assert result.content == f"Who is sharing this bill? Your saved housemates are {', '.join(FOUR)}."


@pytest.mark.asyncio
async def test_a_split_needs_housemates_and_a_confirmed_bill(bill):
    owner_id, _, document_id = bill
    result = await _run(owner_id, tool="split_bill", count=4)
    assert result.action.reason == "not_confirmed"
    assert result.content == (
        "Owner only has no confirmed values yet. Open the bill, check the amount and dates, and confirm them first."
    )
    await _confirmed(document_id)
    result = await _run(owner_id, tool="split_bill", count=4)
    assert result.action.kind == "notice" and result.action.reason == "no_housemates"
    assert result.content == (
        "You have no saved housemates yet. Open the bill and add them in the Bill split panel."
    )


@pytest.mark.asyncio
async def test_the_assistants_reminder_is_a_pending_proposal(bill):
    owner_id, _, document_id = bill
    await _confirmed(document_id)
    await _roster(owner_id, *FOUR)
    await _split_saved(document_id, owner_id)
    result = await _run(owner_id, tool="propose_reminder", days_before_due=2)
    action = result.action
    assert action.kind == "reminder_proposal"
    assert action.proposal.status == "pending" and action.proposal.source == "assistant"
    assert action.proposal.details.remind_on == date(2026, 11, 21)
    assert action.proposal.details.split.split_number == 1
    assert result.content == (
        "I've prepared a reminder for 21 November 2026, 2 days before €123.47 is due on 23 November 2026. "
        "It is not saved. Open the bill to approve or cancel it."
    )
    assert await _count(ReminderProposal, document_id) == 1
    from app.models.base import Reminder

    assert await _count(Reminder, document_id) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "days, phrase", [(1, "1 day before"), (0, "on the day")]
)
async def test_reminder_wording_for_one_day_and_the_due_date(bill, days, phrase):
    owner_id, _, document_id = bill
    await _confirmed(document_id)
    result = await _run(owner_id, tool="propose_reminder", days_before_due=days)
    assert phrase in result.content


@pytest.mark.asyncio
async def test_a_reminder_without_days_asks(bill):
    owner_id, _, document_id = bill
    await _confirmed(document_id)
    result = await _run(owner_id, tool="propose_reminder", days_before_due=None)
    action = result.action
    assert action.kind == "question" and action.missing == "how_many_days"
    assert action.pending.tool == "propose_reminder"
    assert result.content == "How many days before the due date should the reminder be?"
    assert await _count(ReminderProposal, document_id) == 0


@pytest.mark.asyncio
async def test_a_waiting_proposal_is_reported_not_duplicated(bill):
    owner_id, _, document_id = bill
    await _confirmed(document_id)
    await _run(owner_id, tool="propose_reminder", days_before_due=2)
    result = await _run(owner_id, tool="propose_reminder", days_before_due=2)
    assert result.action.kind == "notice" and result.action.reason == "proposal_pending"
    assert result.content == (
        "A reminder proposal is already waiting for your decision on this bill. "
        "Open the bill to approve or cancel it."
    )
    assert await _count(ReminderProposal, document_id) == 1


@pytest.mark.asyncio
async def test_a_reminder_needs_a_confirmed_bill(bill):
    owner_id, _, document_id = bill
    result = await _run(owner_id, tool="propose_reminder", days_before_due=2)
    assert result.action.reason == "not_confirmed"
    assert await _count(ReminderProposal, document_id) == 0


@pytest.mark.asyncio
async def test_the_enquiry_draft_uses_confirmed_values_and_the_matching_line(bill):
    owner_id, _, document_id = bill
    await _confirmed(document_id)
    result = await _run(owner_id, tool="draft_enquiry", topic="the standing charge")
    action = result.action
    assert action.kind == "enquiry_draft" and action.topic == "the standing charge"
    assert [(e.line, e.text) for e in action.evidence] == [(5, "Standing charge: EUR 18.20")]
    assert "Subject: Question about Owner only" in action.draft
    assert (
        "I have a question about the standing charge on my bill for 1 October 2026 to 31 October 2026. "
        "The amount due is €123.47, payable by 23 November 2026."
    ) in action.draft
    assert '"Standing charge: EUR 18.20"' in action.draft
    assert result.content == "Here is a draft you can edit and send yourself. DocVault does not send it."

    result = await _run(owner_id, tool="draft_enquiry", topic="late fees")
    assert result.action.evidence == [] and "The bill shows" not in result.action.draft

    result = await _run(owner_id, tool="draft_enquiry", topic=None)
    assert result.action.kind == "question" and result.action.missing == "what_topic"
    assert result.content == "What should the question to the supplier be about?"


@pytest.mark.asyncio
async def test_the_unconfirmed_enquiry_draft_has_no_amount_sentence(bill):
    owner_id, _, _ = bill
    result = await _run(owner_id, tool="draft_enquiry", topic="the standing charge")
    assert "The amount due" not in result.action.draft
    assert "I have a question about the standing charge on my bill." in result.action.draft


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "reason, sentence, expected",
    [
        ("payment", PAYMENT, "payment"),
        ("external_sending", SENDING, "external_sending"),
        ("other", None, "other"),
    ],
)
async def test_payments_and_sending_are_declined_with_the_alternative(bill, reason, sentence, expected):
    owner_id, _, _ = bill
    result = await _run(owner_id, tool="decline", decline_reason=reason)
    assert result.action.kind == "declined" and result.action.reason == expected
    if sentence:
        assert result.content == sentence
    else:
        assert result.content == (
            "I can't do that. I can answer from your documents, show a bill's amount and dates, split a bill, "
            "prepare a reminder, or draft a question for the supplier."
        )


@pytest.mark.asyncio
async def test_a_decline_without_a_reason_is_other(bill):
    owner_id, _, _ = bill
    result = await _run(owner_id, tool="decline")
    assert result.action.reason == "other"


@pytest.mark.asyncio
async def test_general_questions_use_retrieval(bill):
    owner_id, _, document_id = bill
    source = Source(str(document_id), "Owner only", "Standing charge", 0.9)
    stub = AsyncMock(return_value=RAGResult("It is a fixed daily charge.", [source]))
    with patch("app.services.assistant.tools.generate_rag_answer", stub):
        result = await _run(owner_id, tool="answer_from_documents")
    assert result.action.kind == "answer"
    assert result.content == "It is a fixed daily charge."
    assert result.sources == [source.to_dict()]
    assert stub.await_args.kwargs["user_id"] == owner_id


@pytest.mark.asyncio
async def test_one_saved_housemate_is_not_asked_about_forever(bill):
    owner_id, _, document_id = bill
    await _confirmed(document_id)
    await _roster(owner_id, "Aoife")
    result = await _run(owner_id, tool="split_bill", count=2)
    assert result.action.kind == "notice" and result.action.reason == "no_housemates"
    assert result.content == (
        "A split needs at least two people and you have saved only one housemate. "
        "Open the bill and add them in the Bill split panel."
    )


@pytest.mark.asyncio
async def test_a_bill_that_changes_mid_request_writes_nothing(bill, monkeypatch):
    owner_id, _, document_id = bill
    await _confirmed(document_id)
    await _confirmed(document_id, amount="125.00", base=1)
    await _roster(owner_id, *FOUR)

    async def stale_numbers(db, document_id):
        return (1, 0, 0)  # the revision the owner saw, before revision 2 was confirmed

    monkeypatch.setattr("app.services.assistant.tools.current_request_numbers", stale_numbers)
    result = await _run(owner_id, tool="propose_reminder", days_before_due=2)
    assert result.action.kind == "notice" and result.action.reason == "changed"
    assert result.content == "The bill changed while I was preparing that. Ask again."
    assert await _count(ReminderProposal, document_id) == 0

    from app.services.bill_split import BillSplitConflict

    async def conflicting(*args, **kwargs):
        raise BillSplitConflict("revision_changed", "changed")

    monkeypatch.setattr("app.services.assistant.tools.preview_split", conflicting)
    result = await _run(owner_id, tool="split_bill", people=[], count=4)
    assert result.action.kind == "notice" and result.action.reason == "changed"
    assert await _count(BillSplit, document_id) == 0
