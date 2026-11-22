import re
from calendar import monthrange
from datetime import date, datetime

# How close (in characters) the word "warranty" or "guarantee" must be to a date
# for that date to count as a purchase date when no period is written.
_WARRANTY_WORD_DISTANCE = 60

_MONTH = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|"
    r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
# One capture group around the whole date. ISO comes first so "2026-01-08" is not read as "26-01-08".
_DATE = (
    r"((?<!\d)\d{4}-\d{2}-\d{2}(?!\d)"
    r"|(?<!\d)\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}(?!\d)"
    rf"|\b\d{{1,2}}(?:st|nd|rd|th)?\s+{_MONTH}\.?,?\s+\d{{4}}\b"
    rf"|\b{_MONTH}\.?\s+\d{{1,2}}(?:st|nd|rd|th)?,?\s+\d{{4}}\b)"
)

_PERIOD_BEFORE = re.compile(
    r"(\d+)[\s-]*(year|yr|month)s?'?\s*"
    r"(?:(?:manufacturer(?:'s)?|limited|parts and labour)\s+)?(?:warranty|guarantee)",
    re.IGNORECASE,
)
_PERIOD_LABELLED = re.compile(
    r"(?:warranty|guarantee)(?:\s+period)?\s*[:\-]\s*(\d+)\s*(year|yr|month)s?",
    re.IGNORECASE,
)
_EXPLICIT_END = re.compile(
    r"^[ \t]*(warranty|guarantee|cover)\b[^\n:]{0,30}?\b(?:ends|expires|expiry date|valid until|end date)"
    rf"\s*[:\-]?\s*{_DATE}",
    re.IGNORECASE | re.MULTILINE,
)
_PURCHASE_LABEL = re.compile(
    rf"^[ \t]*(?:date of purchase|purchase date|purchased|date)\s*[:\-]?\s*{_DATE}",
    re.IGNORECASE | re.MULTILINE,
)


def _dates_near_warranty_wording(text: str, date_pattern: str) -> list[str]:
    near = []
    for match in re.finditer(date_pattern, text, re.IGNORECASE):
        window = text[max(0, match.start() - _WARRANTY_WORD_DISTANCE):match.end() + _WARRANTY_WORD_DISTANCE]
        if re.search(r"warranty|guarantee", window, re.IGNORECASE):
            near.append(match.group(1))
    return near


def _explicit_end(text: str) -> tuple[date | None, list[tuple[int, int]]]:
    """The date on a "Warranty ends: ..." line, and the spans of every such line.

    Of several end lines, the first beginning with "Warranty" wins, so "Battery cover ends"
    or "Guarantee ends" never overrides "Warranty ends".
    """
    matches = list(_EXPLICIT_END.finditer(text))
    spans = [m.span() for m in matches]
    ordered = [m for m in matches if m.group(1).lower() == "warranty"] + [
        m for m in matches if m.group(1).lower() != "warranty"
    ]
    for match in ordered:
        parsed = _parse_date(match.group(2))
        if parsed:
            return parsed, spans
    return None, spans


def _period_months(text: str) -> int | None:
    found = [m for m in (_PERIOD_BEFORE.search(text), _PERIOD_LABELLED.search(text)) if m]
    if not found:
        return None
    first = min(found, key=lambda m: m.start())
    amount = int(first.group(1))
    return amount if first.group(2).lower() == "month" else amount * 12


def extract_warranty_dates(text: str) -> dict | None:
    """Extract purchase_date and expiry_date from document text using regex patterns.

    Returns None unless the text has warranty wording: an explicit end line such as
    "Warranty ends: 7 January 2028", a period such as "2-year warranty", or the word
    "warranty" or "guarantee" close to a date. A bill with an issue date is not a warranty.
    An explicit end date wins over one computed from a period.
    """
    if not text:
        return None

    explicit_expiry, end_spans = _explicit_end(text)
    months = _period_months(text)

    def outside_end_lines(match: re.Match) -> bool:
        return not any(start <= match.start() < end for start, end in end_spans)

    if explicit_expiry is None and months is None:
        candidates = _dates_near_warranty_wording(text, _DATE)
        if not candidates:
            return None
    else:
        candidates = [m.group(1) for m in re.finditer(_DATE, text, re.IGNORECASE) if outside_end_lines(m)]

    purchase_date = None
    labelled = _PURCHASE_LABEL.search(text)
    if labelled:
        purchase_date = _parse_date(labelled.group(1))
    if purchase_date is None and candidates:
        purchase_date = _parse_date(candidates[0])

    expiry_date = explicit_expiry
    if expiry_date is None and purchase_date and months:
        expiry_date = _add_months(purchase_date, months)

    if not purchase_date and not expiry_date:
        return None

    return {"purchase_date": purchase_date, "expiry_date": expiry_date}


def _add_months(value: date, months: int) -> date:
    """Add calendar months, clamping to the destination month's final day."""
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)


_NUMERIC_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y")
_WRITTEN_FORMATS = ("%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y")


def _parse_date(date_str: str) -> date | None:
    """Try common numeric and written date formats."""
    value = date_str.strip()
    for fmt in _NUMERIC_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    # Written dates: drop ordinals, commas and full stops, normalise "Sept".
    written = re.sub(r"(\d)(?:st|nd|rd|th)\b", r"\1", value, flags=re.IGNORECASE)
    written = re.sub(r"[,.]", " ", written)
    written = re.sub(r"\bsept\b", "sep", written, flags=re.IGNORECASE)
    written = re.sub(r"\s+", " ", written).strip()
    for fmt in _WRITTEN_FORMATS:
        try:
            return datetime.strptime(written, fmt).date()
        except ValueError:
            continue
    return None
