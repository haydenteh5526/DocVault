import re
from calendar import monthrange
from datetime import date


def extract_warranty_dates(text: str) -> dict | None:
    """Extract purchase_date and expiry_date from document text using regex patterns."""
    if not text:
        return None

    # Common date patterns
    date_pattern = r"(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})"
    dates = re.findall(date_pattern, text)

    # Look for warranty period keywords
    warranty_years = re.search(r"(\d+)\s*(?:year|yr)s?\s*(?:warranty|guarantee)", text, re.IGNORECASE)
    warranty_months = re.search(r"(\d+)\s*(?:month)s?\s*(?:warranty|guarantee)", text, re.IGNORECASE)

    purchase_date = None
    expiry_date = None

    # Try to parse the first date found as purchase date
    if dates:
        purchase_date = _parse_date(dates[0])

    # Calculate expiry from warranty period
    if purchase_date and warranty_years:
        years = int(warranty_years.group(1))
        expiry_date = _add_months(purchase_date, years * 12)
    elif purchase_date and warranty_months:
        months = int(warranty_months.group(1))
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


def _parse_date(date_str: str) -> date | None:
    """Try common date formats."""
    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y"):
        try:
            from datetime import datetime
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None
