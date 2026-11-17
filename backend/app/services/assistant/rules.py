"""A deterministic keyword router, and readers for the answers to the assistant's questions.

The router never sees document text. It reads only the owner's message, bill titles and housemate names.
"""
import re

from app.schemas.assistant import Selection
from app.services.assistant.bills import BillRef

_MONTHS = (
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
)  # fmt: skip
_NUMBERS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
}  # fmt: skip
_ORDINALS = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
    "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
}  # fmt: skip
_NUMBER_WORDS = "|".join(_NUMBERS)
_ASKS = re.compile(r"\b(how|what|when)\b|\?\s*$")
_OPENS_QUESTION = re.compile(
    r"^(?:(?:actually|and|so|ok|okay|but|then|wait)\W+)*(?:how|what|when|which|who|is|are|will|does|do|did|can|could)\b"
)

_RULES = (
    (re.compile(r"\b(remind|reminder|nudge|alert me|notify me)\b"), "propose_reminder", None),
    (
        re.compile(
            r"\b(split|divide)\b|\beach of us\b|\beach (pay|pays|owe|owes)\b|\bper person\b"
            r"|\b(between|among) (us|the \w+ of us)\b"
        ),
        "split_bill",
        None,
    ),
    (
        re.compile(
            r"\b(draft|write|compose)\b|\bquestion for\b|\b(ask|query) (the|my) (supplier|provider|company)\b"
        ),
        "draft_enquiry",
        None,
    ),
    (re.compile(r"\b(e-?mail|send|forward|whatsapp)\b|\btext (it|this|that)\b"), "decline", "external_sending"),
    (
        re.compile(
            r"^(please )?((can|could|will|would) you )?(please )?(pay|settle|transfer)\b"
            r"|\b(pay|settle) (it|this bill|that bill|the bill)( for me)?\b"
        ),
        "decline",
        "payment",
    ),
    (
        re.compile(
            r"\bhow much\b|\bamount\b|\bowe\b|\bdue\b|\bdeadline\b|\blast day\b|\bpay by\b|\bperiod\b|\btotal\b|\bcost\b"
        ),
        "get_bill_facts",
        None,
    ),
)


def _straight(text: str) -> str:
    return text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')


def _fold(text: str) -> str:
    return _straight(text).casefold()


def _number(token: str) -> int | None:
    token = token.strip()
    if token.isascii() and token.isdigit():
        return int(token)
    return _NUMBERS.get(token)


def read_days(text: str) -> int | None:
    folded = _fold(text)
    days = None
    if re.search(r"\bon the (due )?date\b|\bon the day\b|\bthe day it'?s due\b", folded):
        days = 0
    elif re.search(r"\ba couple of days\b", folded):
        days = 2
    elif re.search(r"\btwo weeks\b|\ba fortnight\b", folded):
        days = 14
    elif match := re.search(rf"\b(\d{{1,6}}|{_NUMBER_WORDS})\s+days?\b", folded):
        days = _number(match[1])
    elif re.search(r"\b(a|one) day\b", folded):
        days = 1
    elif re.search(r"\ba week\b", folded):
        days = 7
    return days if days is not None and 0 <= days <= 60 else None


def read_count(text: str) -> int | None:
    match = re.search(rf"\b(\d{{1,6}}|{_NUMBER_WORDS})\s+(of us|people|ways|housemates|way)\b", _fold(text))
    count = _number(match[1]) if match else None
    return count if count is not None and 2 <= count <= 12 else None


def read_people(text: str, housemates: list[str]) -> list[str]:
    folded = _fold(text)
    if re.search(r"\b(everyone|all of us|everybody)\b", folded):
        return list(housemates)
    found = []
    for label in housemates:
        match = re.search(rf"(?<!\w){re.escape(label.casefold())}(?!\w)", folded)
        if match:
            found.append((match.start(), label))
    return [label for _, label in sorted(found)]


def read_bill(text: str, bills: list[BillRef]) -> str | None:
    folded = _fold(text)
    whole = [bill for bill in bills if _fold(bill.title).strip() and bill.title.casefold() in folded]
    if len(whole) == 1:
        return whole[0].ref
    months = [month for month in _MONTHS if re.search(rf"\b{month}\b", folded)]
    by_month = [bill for bill in bills if any(month in bill.title.casefold() for month in months)]
    if months and len(by_month) == 1:
        return by_month[0].ref
    index = read_list_number(text)
    if index is not None and 1 <= index <= len(bills):
        return bills[index - 1].ref
    return None


def named_bill(text: str, bills: list[BillRef]) -> str | None:
    """The ref of the bill whose whole title appears in the text as whole words; the longest wins, a tie is None."""
    folded = _fold(text)
    found = [
        bill
        for bill in bills
        if _fold(bill.title).strip() and re.search(rf"(?<!\w){re.escape(_fold(bill.title))}(?!\w)", folded)
    ]
    if not found:
        return None
    longest = max(len(bill.title) for bill in found)
    best = [bill for bill in found if len(bill.title) == longest]
    return best[0].ref if len(best) == 1 else None


def read_list_number(text: str) -> int | None:
    """A whole reply that is only a list number: `2`, `2.`, `the second`, `the first one`."""
    names = "|".join([*_NUMBERS, *_ORDINALS])
    match = re.fullmatch(rf"\s*(?:the )?(\d{{1,3}}|{names})(?: one)?\s*[.)]?\s*", _fold(text))
    if not match:
        return None
    token = match[1]
    return _ORDINALS.get(token) or _number(token)


def _clean(text: str) -> str:
    text = "".join(ch for ch in text if ch.isprintable())
    return text.strip().rstrip(".?!,;: ").strip()


def read_topic(text: str) -> str | None:
    match = re.search(r"\b(?:about|regarding|on the)\s+(.*)", _straight(text), re.I | re.S)
    if not match:
        return None
    return _clean(match[1])[:80].strip() or None


def select_by_rules(question: str, bills: list[BillRef], housemates: list[str]) -> Selection:
    try:
        folded = _fold(question).strip()
        for pattern, tool, reason in _RULES:
            if pattern.search(folded):
                break
        else:
            tool, reason = "answer_from_documents", None
        arguments: dict = {"tool": tool, "document_ref": read_bill(question, bills)}
        if tool == "propose_reminder":
            arguments["days_before_due"] = read_days(question)
        elif tool == "split_bill":
            arguments["people"] = read_people(question, housemates)
            arguments["count"] = read_count(question)
        elif tool == "draft_enquiry":
            arguments["topic"] = read_topic(question)
        elif tool == "decline":
            arguments["decline_reason"] = reason
        return Selection(**arguments)
    except Exception:  # noqa: BLE001 - the router must always answer
        return Selection(tool="answer_from_documents")


def fill_pending(
    pending: Selection, missing: str, reply: str, bills: list[BillRef], housemates: list[str]
) -> Selection | None:
    if missing in ("which_bill", "which_people", "how_many_days"):
        # A reply that is itself a different request is a new request, not the answer. Bill facts count as a
        # different request after "which bill" when the reply is phrased as a question, and after "who" or
        # "how many days" when the reply opens with a question word.
        other = select_by_rules(reply, bills, housemates).tool
        folded = _fold(reply).strip()
        if other not in ("answer_from_documents", pending.tool) and (
            other != "get_bill_facts"
            or (missing == "which_bill" and _ASKS.search(folded))
            or (missing != "which_bill" and _OPENS_QUESTION.search(folded))
        ):
            return None
    if missing == "which_bill":
        ref = read_bill(reply, bills)
        return pending.model_copy(update={"document_ref": ref}) if ref else None
    if missing == "which_people":
        people = read_people(reply, housemates)
        return pending.model_copy(update={"people": people}) if people else None
    if missing == "how_many_days":
        days = read_days(reply)
        if days is None:
            bare = re.fullmatch(r"\s*(\d{1,3})\s*", reply)
            days = int(bare[1]) if bare and int(bare[1]) <= 60 else None
        return pending.model_copy(update={"days_before_due": days}) if days is not None else None
    if missing == "what_topic":
        topic = read_topic(reply) or _clean(_straight(reply))[:80].strip()
        if not topic:
            return None
        if select_by_rules(reply, bills, housemates).tool in (
            "propose_reminder",
            "split_bill",
            "draft_enquiry",
            "decline",
        ):
            return None
        return pending.model_copy(update={"topic": topic})
    return None
