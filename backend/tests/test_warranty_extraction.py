from datetime import date

import pytest

from app.services.warranty_extraction import _add_months, _parse_date, extract_warranty_dates


def test_extract_warranty_dates_requires_text_or_parseable_date():
    assert extract_warranty_dates("") is None
    assert extract_warranty_dates("Warranty applies, but no purchase date is shown") is None
    assert extract_warranty_dates("Purchased 99/99/9999 with 2 year warranty") is None


def test_extract_year_warranty_and_clamp_leap_day():
    assert extract_warranty_dates("Purchase 29/02/2024. 1 year warranty") == {
        "purchase_date": date(2024, 2, 29),
        "expiry_date": date(2025, 2, 28),
    }


def test_extract_month_warranty_across_year_boundary():
    assert extract_warranty_dates("Purchase 31/10/2025. 6 month guarantee") == {
        "purchase_date": date(2025, 10, 31),
        "expiry_date": date(2026, 4, 30),
    }


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("02/01/2025", date(2025, 1, 2)),
        ("02-01-2025", date(2025, 1, 2)),
        ("02.01.2025", date(2025, 1, 2)),
        ("02/01/25", date(2025, 1, 2)),
        ("not-a-date", None),
    ],
)
def test_parse_date_formats(raw, expected):
    assert _parse_date(raw) == expected


def test_add_months_handles_multiple_years():
    assert _add_months(date(2025, 1, 15), 25) == date(2027, 2, 15)
