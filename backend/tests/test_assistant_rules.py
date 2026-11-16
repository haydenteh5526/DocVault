"""The keyword router and the readers for answers to the assistant's questions."""
from types import SimpleNamespace

import pytest

from app.schemas.assistant import Selection
from app.services.assistant.rules import (
    fill_pending,
    read_bill,
    read_count,
    read_days,
    read_people,
    read_topic,
    select_by_rules,
)

FOUR = ["Aoife", "Ben", "Chidi", "Dara"]


def _bill(ref, title):
    return SimpleNamespace(ref=ref, title=title, document=None)


BILLS = [_bill("bill-1", "October electricity bill"), _bill("bill-2", "September electricity bill")]


@pytest.mark.parametrize(
    "text, tool, reason",
    [
        ("When is this bill due?", "get_bill_facts", None),
        ("What's the last day I can pay this without being late?", "get_bill_facts", None),
        ("How much do I owe?", "get_bill_facts", None),
        ("What period does it cover?", "get_bill_facts", None),
        ("How much do I have to pay?", "get_bill_facts", None),
        ("When is the payment due?", "get_bill_facts", None),
        ("Split it between the four of us.", "split_bill", None),
        ("What does each of us pay?", "split_bill", None),
        ("Divide it between Aoife and Ben", "split_bill", None),
        ("Remind me two days before it's due.", "propose_reminder", None),
        ("Can you nudge me 2 days ahead of the deadline?", "propose_reminder", None),
        ("Draft a question for the supplier about the standing charge.", "draft_enquiry", None),
        ("Write to the supplier about the standing charge", "draft_enquiry", None),
        ("Pay this bill for me.", "decline", "payment"),
        ("Can you pay it?", "decline", "payment"),
        ("Please settle the bill", "decline", "payment"),
        ("Email this bill to my landlord.", "decline", "external_sending"),
        ("Send it to Ben", "decline", "external_sending"),
        ("Forward this to the supplier", "decline", "external_sending"),
        ("Summarise this bill.", "answer_from_documents", None),
        ("What is my account number?", "answer_from_documents", None),
        ("hello", "answer_from_documents", None),
    ],
)
def test_requests_route_to_the_right_tool(text, tool, reason):
    selection = select_by_rules(text, BILLS, FOUR)
    assert selection.tool == tool
    assert selection.decline_reason == reason


def test_the_router_passes_the_arguments_it_can_read():
    selection = select_by_rules("Remind me two days before the September bill is due", BILLS, FOUR)
    assert (selection.days_before_due, selection.document_ref) == (2, "bill-2")
    selection = select_by_rules("Split it between the four of us.", BILLS, FOUR)
    assert selection.count == 4 and selection.people == []
    selection = select_by_rules("Draft a question for the supplier about the standing charge.", BILLS, FOUR)
    assert selection.topic == "the standing charge"


@pytest.mark.parametrize(
    "text, days",
    [
        ("two days before", 2),
        ("2 days ahead", 2),
        ("a day before", 1),
        ("on the due date", 0),
        ("a week before", 7),
        ("a fortnight before", 14),
        ("a couple of days before", 2),
        ("before it's due", None),
        ("90 days before", None),
    ],
)
def test_days_are_read_from_words_and_digits(text, days):
    assert read_days(text) == days


def test_people_and_counts_are_read():
    assert read_count("between the four of us") == 4 and read_people("between the four of us", FOUR) == []
    assert read_people("between Ben and aoife", FOUR) == ["Ben", "Aoife"]
    assert read_people("between everyone", FOUR) == FOUR
    assert read_people("between Zed and Ben", FOUR) == ["Ben"]
    assert read_people("Benjamin", FOUR) == []
    assert read_count("a split between 3 people") == 3
    assert read_count("hello") is None


def test_the_bill_is_read_from_a_title_or_month():
    assert read_bill("the September bill", BILLS) == "bill-2"
    assert read_bill("October electricity bill", BILLS) == "bill-1"
    assert read_bill("this bill", BILLS) is None
    same = [_bill("bill-1", "October electricity bill"), _bill("bill-2", "October gas bill")]
    assert read_bill("the October bill", same) is None


def test_the_topic_is_read():
    assert read_topic("about the standing charge.") == "the standing charge"
    assert read_topic("Draft a question for the supplier") is None


def _pending(tool, **kwargs):
    return Selection(tool=tool, **kwargs)


def test_answers_fill_the_pending_request():
    pending = _pending("propose_reminder", days_before_due=3)
    assert fill_pending(pending, "which_bill", "the September one", BILLS, FOUR).document_ref == "bill-2"
    filled = fill_pending(pending, "which_bill", "2", BILLS, FOUR)
    assert filled.document_ref == "bill-2" and filled.tool == "propose_reminder" and filled.days_before_due == 3
    assert fill_pending(pending, "which_bill", "the first one", BILLS, FOUR).document_ref == "bill-1"
    split = _pending("split_bill", count=2)
    filled = fill_pending(split, "which_people", "Aoife and Ben", BILLS, FOUR)
    assert filled.people == ["Aoife", "Ben"] and filled.count == 2
    ask = _pending("propose_reminder")
    assert fill_pending(ask, "how_many_days", "3", BILLS, FOUR).days_before_due == 3
    assert fill_pending(ask, "how_many_days", "two days", BILLS, FOUR).days_before_due == 2
    draft = _pending("draft_enquiry")
    assert fill_pending(draft, "what_topic", "the standing charge", BILLS, FOUR).topic == "the standing charge"
    assert fill_pending(draft, "what_topic", "the amount due", BILLS, FOUR).topic == "the amount due"


def test_a_reply_that_is_not_an_answer_is_not_forced_in():
    reply = "Remind me two days before it's due"
    assert fill_pending(_pending("propose_reminder"), "which_bill", reply, BILLS, FOUR) is None
    assert fill_pending(_pending("propose_reminder"), "how_many_days", "not sure", BILLS, FOUR) is None
    assert fill_pending(_pending("split_bill"), "which_people", "Zed", BILLS, FOUR) is None
    assert fill_pending(_pending("draft_enquiry"), "what_topic", "Pay this bill for me", BILLS, FOUR) is None


@pytest.mark.parametrize("text", ["", "x" * 5000, "hi 😀 \x00\x07   'quote’ “q”"])
def test_the_router_never_raises(text):
    assert isinstance(select_by_rules(text, BILLS, FOUR), Selection)
