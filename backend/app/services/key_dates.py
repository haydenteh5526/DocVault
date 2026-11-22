"""Read insurance renewal and contract end dates from labelled lines, keeping the line they came from."""
import re
from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.services.bill_review import _date
from app.services.categorisation_service import KINDS

KeyDateKind = Literal["renewal", "contract_end"]

SCAN_LIMIT = 20_000

_DATE_TEXT = r"(?P<date>\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})"
_END = r"\s*\.?\s*$"
_RENEWAL = re.compile(
    r"^\s*(?:renewal\s+date|renews\s+on|policy\s+renewal|renewal\s+due|expiry\s+date|policy\s+end\s+date"
    r"|cover\s+ends|valid\s+until)\s*:?\s*" + _DATE_TEXT + _END,
    re.I,
)
_TERM = re.compile(r"^\s*term\s*:\s*\S.*?\s+to\s+" + _DATE_TEXT + _END, re.I)
_CONTRACT_END = re.compile(r"^\s*(?:end\s+date|tenancy\s+ends|agreement\s+ends)\s*:\s*" + _DATE_TEXT + _END, re.I)

_PATTERNS: tuple[tuple[KeyDateKind, tuple[re.Pattern, ...]], ...] = (
    ("renewal", (_RENEWAL,)),
    ("contract_end", (_TERM, _CONTRACT_END)),
)


@dataclass(frozen=True)
class DatedLine:
    kind: KeyDateKind
    date: date
    line: int  # 1-based line number in raw_text
    text: str  # the source line, stripped


def _wanted(kind: str | None) -> set[KeyDateKind]:
    if kind == "Insurance":
        return {"renewal"}
    if kind == "Contract":
        return {"contract_end"}
    if not kind or kind not in KINDS:
        # Unclassified or a legacy free-text kind: read both.
        return {"renewal", "contract_end"}
    return set()


def _read(lines: list[str], patterns: tuple[re.Pattern, ...], kind: KeyDateKind) -> DatedLine | None:
    found = []
    for number, line in enumerate(lines, start=1):
        for pattern in patterns:
            match = pattern.match(line)
            parsed = _date(match["date"]) if match else None
            if parsed:
                found.append(DatedLine(kind, date.fromisoformat(parsed), number, line.strip()))
                break
    # Conflicting dates for the same kind need the owner to read the document, as bill_review._field does.
    if len({item.date for item in found}) != 1:
        return None
    return found[0]


def extract_key_dates(text: str | None, kind: str | None) -> list[DatedLine]:
    wanted = _wanted(kind)
    if not text or not wanted:
        return []
    lines = text[:SCAN_LIMIT].splitlines()
    results = [_read(lines, patterns, name) for name, patterns in _PATTERNS if name in wanted]
    return [item for item in results if item is not None]
