from datetime import date
from pathlib import Path

import pytest

from app.services.warranty_extraction import _add_months, _parse_date, extract_warranty_dates
from tests.fixtures import household_texts


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


# --- Written dates and explicit end dates (dashboard redesign, PR 1) ----------------------------

_D15 = Path(__file__).resolve().parents[2] / "evaluation" / "retrieval" / "corpus" / "D15-guarantee-laptop.txt"


def test_d15_laptop_warranty_uses_the_written_end_date():
    assert extract_warranty_dates(_D15.read_text(encoding="utf-8")) == {
        "purchase_date": date(2026, 1, 8),
        "expiry_date": date(2028, 1, 7),
    }


def test_laptop_receipt_lookalike_uses_the_explicit_expiry():
    assert extract_warranty_dates(household_texts.LAPTOP_RECEIPT) == {
        "purchase_date": date(2026, 1, 8),
        "expiry_date": date(2028, 1, 8),
    }


def test_a_hyphenated_period_after_a_labelled_numeric_date():
    assert extract_warranty_dates("Date: 08/01/2026\nLaptop EUR 899.00\n2-year warranty") == {
        "purchase_date": date(2026, 1, 8),
        "expiry_date": date(2028, 1, 8),
    }


def test_washer_warranty_card_with_a_labelled_period():
    assert extract_warranty_dates(household_texts.WASHER_WARRANTY_CARD) == {
        "purchase_date": date(2026, 6, 12),
        "expiry_date": date(2028, 6, 12),
    }


@pytest.mark.parametrize("text", [household_texts.OCTOBER_BILL, household_texts.ELECTRICITY_BILL_LIVE])
def test_an_electricity_bill_is_not_a_warranty(text):
    assert extract_warranty_dates(text) is None


def test_a_kettle_receipt_has_no_expiry():
    result = extract_warranty_dates(household_texts.KETTLE_RECEIPT)
    assert result is None or result["expiry_date"] is None


def test_battery_cover_does_not_override_the_warranty_end():
    text = "Date of purchase: 8 January 2026\nBattery cover ends: 7 January 2027\nWarranty ends: 7 January 2028"
    assert extract_warranty_dates(text)["expiry_date"] == date(2028, 1, 7)


def test_a_guarantee_end_line_counts_when_no_warranty_line_exists():
    text = "Purchased: 1 March 2026\nGuarantee valid until: 1 March 2029"
    assert extract_warranty_dates(text) == {"purchase_date": date(2026, 3, 1), "expiry_date": date(2029, 3, 1)}


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Purchased: 8 Jan 2026. 24 month guarantee", date(2028, 1, 8)),
        ("Purchased: January 8, 2026. 2 years' limited warranty", date(2028, 1, 8)),
        ("Purchased: 2026-01-08. 2 year manufacturer's warranty", date(2028, 1, 8)),
        ("Purchased: 8 January 2026\nGuarantee: 24 months", date(2028, 1, 8)),
    ],
)
def test_written_dates_and_period_wordings(text, expected):
    assert extract_warranty_dates(text)["expiry_date"] == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("8 January 2026", date(2026, 1, 8)),
        ("8 Jan 2026", date(2026, 1, 8)),
        ("January 8, 2026", date(2026, 1, 8)),
        ("2026-01-08", date(2026, 1, 8)),
    ],
)
def test_parse_written_dates(raw, expected):
    assert _parse_date(raw) == expected


# --- Review fixes (Revision 1) -------------------------------------------------------------------


def test_a_price_guarantee_on_a_bill_is_not_a_warranty_period():
    text = (
        "Linkline Broadband\nBill date: 1 November 2026\nAmount due EUR 45.00\n"
        "Price guarantee: 12 months\nDate: 1 November 2026"
    )
    # "guarantee" near a date may still give a purchase date, but no period is read, so no end date.
    result = extract_warranty_dates(text)
    assert result is None or result["expiry_date"] is None


def test_a_bulleted_warranty_end_line_counts():
    text = "Date of purchase: 8 January 2026\n- Warranty ends: 7 January 2028"
    assert extract_warranty_dates(text) == {"purchase_date": date(2026, 1, 8), "expiry_date": date(2028, 1, 7)}


def test_a_bulleted_labelled_period_counts():
    text = "Purchased: 8 January 2026\n• Warranty period: 2 years"
    assert extract_warranty_dates(text)["expiry_date"] == date(2028, 1, 8)


def test_a_purchase_date_after_the_expiry_is_dropped():
    text = "Warranty ends: 7 January 2020\nDate: 8 January 2026"
    assert extract_warranty_dates(text) == {"purchase_date": None, "expiry_date": date(2020, 1, 7)}
