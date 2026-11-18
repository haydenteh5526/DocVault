from datetime import date

import pytest

from app.services.warranty_extraction import _add_months, _parse_date, extract_warranty_dates


def test_extract_warranty_dates_requires_text_or_parseable_date():
    assert extract_warranty_dates("") is None
    assert extract_warranty_dates("Warranty applies, but no purchase date is shown") is None
    assert extract_warranty_dates("Purchased 99/99/9999 with 2 year warranty") is None


def test_a_bill_is_not_a_warranty():
    assert extract_warranty_dates("Issued 01/11/2026 Total amount due: EUR 123.47") is None


def test_a_warranty_period_next_to_a_purchase_date_gives_the_expiry():
    assert extract_warranty_dates("Purchased 12/06/2026. 2 year warranty.") == {
        "purchase_date": date(2026, 6, 12),
        "expiry_date": date(2028, 6, 12),
    }


def test_the_word_warranty_near_a_date_is_enough_to_keep_the_purchase_date():
    assert extract_warranty_dates("Warranty card. Date of purchase 12/06/2026.") == {
        "purchase_date": date(2026, 6, 12),
        "expiry_date": None,
    }


def test_the_word_warranty_far_from_every_date_is_not_enough():
    far = "Warranty terms apply to this product. " + "x" * 80 + " Issued 12/06/2026"
    assert extract_warranty_dates(far) is None


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
