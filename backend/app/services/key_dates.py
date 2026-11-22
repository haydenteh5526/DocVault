"""Read insurance renewal and contract end dates from labelled lines, keeping the line they came from."""
import re
from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.services.bill_review import _date
from app.services.categorisation_service import normalise_kind

KeyDateKind = Literal["renewal", "contract_end"]

SCAN_LIMIT = 20_000
SCANNED_KINDS = frozenset({"Bill", "Insurance", "Contract"})
# The exact labels the keyword guesser wrote before PR 1, from word fragments real bills carry
# ("Direct Debit Instruction", "Direct Debit Guarantee", "Setup fee"). They say nothing about the kind (R3-a).
LEGACY_GUESS_LABELS = frozenset({"User Manual", "Warranty Card", "Quick Start Guide", "Specification Sheet"})


def classify_kind(document_type: str | None) -> str | None:
    """One of the seven kinds, or None when the document is unclassified."""
    if document_type in LEGACY_GUESS_LABELS:
        return None
    return normalise_kind(document_type)


def scans_text(document_type: str | None) -> bool:
    """Whether a document's text may be read for bill fields and dates.

    The value is classified first, so a legacy label such as "Sales Receipt" counts as a Receipt. Manuals,
    receipts, warranties and other documents are never scanned. An empty kind and the old keyword guesses
    count as unclassified.
    """
    kind = classify_kind(document_type)
    return kind is None or kind in SCANNED_KINDS


def reviews_bills(document_type: str | None) -> bool:
    """Whether a document gets a bill review: bills and unclassified documents only (D4)."""
    return classify_kind(document_type) in (None, "Bill")


# Each pattern matches a label; the rest of the line must then be one date.
_RENEWAL = re.compile(
    r"^\s*(?:renewal\s+date|renews\s+on|policy\s+renewal|renewal\s+due|expiry\s+date|policy\s+end\s+date"
    r"|cover\s+ends|valid\s+until)\b\s*:?\s*",
    re.I,
)
# Greedy, so the end date follows the last " to " ("Tenancy to run from … to 31 August 2027", R4-d).
_TERM = re.compile(r"^\s*term\s*:\s*\S.*\s+to\s+", re.I)
_CONTRACT_END = re.compile(r"^\s*(?:end\s+date|tenancy\s+ends|agreement\s+ends)\s*:\s*", re.I)

_PATTERNS: tuple[tuple[KeyDateKind, tuple[re.Pattern, ...]], ...] = (
    ("renewal", (_RENEWAL,)),
    ("contract_end", (_TERM, _CONTRACT_END)),
)

_UNREADABLE = "unreadable"
# A remainder that starts like a date: a digit, or a month name in full or abbreviated (R4-c).
_LOOKS_LIKE_A_DATE = re.compile(
    r"^(?:\d|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?"
    r"|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b)",
    re.I,
)


def _value(rest: str) -> str | None:
    """The ISO date after a label, _UNREADABLE for a date that cannot be read, or None for words."""
    rest = rest.strip()
    rest = rest[:-1].rstrip() if rest.endswith(".") else rest
    parsed = _date(rest)
    if parsed:
        return parsed
    return _UNREADABLE if _LOOKS_LIKE_A_DATE.match(rest) else None


@dataclass(frozen=True)
class DatedLine:
    kind: KeyDateKind
    date: date
    line: int  # 1-based line number in raw_text
    text: str  # the source line, stripped


def _wanted(document_type: str | None) -> set[KeyDateKind]:
    kind = classify_kind(document_type)
    if kind == "Insurance":
        return {"renewal"}
    if kind == "Contract":
        return {"contract_end"}
    if kind is None:
        # Unclassified: read both.
        return {"renewal", "contract_end"}
    return set()


def _read(lines: list[str], patterns: tuple[re.Pattern, ...], kind: KeyDateKind) -> DatedLine | None:
    found: list[DatedLine] = []
    values: set[str] = set()
    for number, line in enumerate(lines, start=1):
        for pattern in patterns:
            match = pattern.match(line)
            value = _value(line[match.end():]) if match else None
            if value:
                values.add(value)
                if value != _UNREADABLE:
                    found.append(DatedLine(kind, date.fromisoformat(value), number, line.strip()))
                break
    # Conflicting or unreadable labelled dates need the owner to read the document, as bill_review._field does.
    if len(values) != 1 or _UNREADABLE in values:
        return None
    return found[0]


def extract_key_dates(text: str | None, kind: str | None) -> list[DatedLine]:
    wanted = _wanted(kind)
    if not text or not wanted:
        return []
    lines = text[:SCAN_LIMIT].splitlines()
    results = [_read(lines, patterns, name) for name, patterns in _PATTERNS if name in wanted]
    return [item for item in results if item is not None]
