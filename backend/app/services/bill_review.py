"""Derive read-only electricity bill candidates from labelled OCR lines."""
import re
from collections.abc import Callable
from datetime import datetime
from decimal import Decimal

from app.schemas.document import BillField, BillReview, BillSourceLine

_AMOUNT_LABEL = re.compile(r"^\s*(?:(?:total\s+)?amount\s+(?:due|payable)|(?:total|balance)\s+due)\b", re.I)
_DATE_LABEL = re.compile(r"^\s*(?:(?:payment\s+)?due\s+date|pay(?:ment\s+due)?\s+by)\b", re.I)
_NUMBER = r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?"


def _euros(text: str) -> str | None:
    match = re.fullmatch(rf"(?:EUR|€)\s*({_NUMBER})|({_NUMBER})\s*(?:EUR|€)", text, re.I)
    if not match:
        return None
    number = match[1] or match[2]
    return format(Decimal(number.replace(",", "")), ".2f")


def _date(text: str) -> str | None:
    formats = ["%d %B %Y", "%d %b %Y", "%Y-%m-%d"]
    # A numeric date like 04/05 can refer to two different days.
    numeric = re.fullmatch(r"(\d{1,2})/(\d{1,2})/\d{4}", text)
    if numeric and int(numeric[1]) > 12:
        formats.append("%d/%m/%Y")
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _field(lines: list[str], label: re.Pattern, parse: Callable[[str], str | None]) -> BillField:
    sources = []
    values = set()
    for number, line in enumerate(lines, start=1):
        match = label.match(line)
        if match:
            sources.append(BillSourceLine(line=number, text=line))
            values.add(parse(line[match.end():].strip().removeprefix(":").strip()))
    # Conflicting or unreadable labelled lines require a person to resolve them.
    return BillField(value=values.pop() if len(values) == 1 else None, sources=sources)


def extract_bill_review(text: str | None) -> BillReview | None:
    if not text or not re.search(r"\belectricity\b", text, re.I) or not re.search(r"\b(?:bill|invoice)\b", text, re.I):
        return None
    lines = text.splitlines()
    return BillReview(
        amount_due=_field(lines, _AMOUNT_LABEL, _euros),
        due_date=_field(lines, _DATE_LABEL, _date),
    )
