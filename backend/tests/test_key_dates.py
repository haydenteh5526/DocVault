from datetime import date

from app.services.key_dates import DatedLine, extract_key_dates
from tests.fixtures import household_texts


def test_car_insurance_renewal_is_read_with_its_source_line():
    [found] = extract_key_dates(household_texts.CAR_INSURANCE, "Insurance")
    assert found == DatedLine(kind="renewal", date=date(2027, 1, 15), line=4, text="Renewal date: 15 January 2027")


def test_tenancy_term_gives_its_end_date():
    [found] = extract_key_dates(household_texts.TENANCY, "Contract")
    assert found.kind == "contract_end"
    assert found.date == date(2027, 8, 31)
    assert (found.line, found.text) == (2, "Term: 1 September 2026 to 31 August 2027")


def test_labelled_contract_end_is_read():
    [found] = extract_key_dates("Broadband contract\nAgreement ends: 2027-03-01", "Contract")
    assert (found.kind, found.date) == ("contract_end", date(2027, 3, 1))


def test_a_manual_mentioning_valid_until_stock_lasts_has_no_dates():
    text = "Blender B2\nUser manual\nFree recipe book valid until stock lasts."
    assert extract_key_dates(text, "Manual") == []
    assert extract_key_dates(text, None) == []


def test_conflicting_renewal_dates_give_none():
    text = "Car insurance\nRenewal date: 15 January 2027\nRenews on: 16 January 2027"
    assert extract_key_dates(text, "Insurance") == []


def test_the_same_date_on_two_lines_keeps_the_first_line():
    text = "Car insurance\nRenewal date: 15 January 2027\nExpiry date: 15 January 2027"
    [found] = extract_key_dates(text, "Insurance")
    assert (found.line, found.date) == (2, date(2027, 1, 15))


def test_unclassified_documents_are_read_for_both_kinds():
    text = household_texts.CAR_INSURANCE + "\n" + household_texts.TENANCY
    assert {found.kind for found in extract_key_dates(text, None)} == {"renewal", "contract_end"}


def test_each_kind_reads_only_its_own_labels():
    assert extract_key_dates(household_texts.TENANCY, "Insurance") == []
    assert extract_key_dates(household_texts.CAR_INSURANCE, "Contract") == []
    assert extract_key_dates(household_texts.CAR_INSURANCE, "Receipt") == []


def test_only_the_first_20000_characters_are_scanned():
    text = "x" * 20_000 + "\nRenewal date: 15 January 2027"
    assert extract_key_dates(text, "Insurance") == []


def test_empty_text_has_no_dates():
    assert extract_key_dates(None, "Insurance") == []
    assert extract_key_dates("", None) == []


def test_an_unreadable_labelled_date_counts_as_a_conflict():
    text = "Car insurance\nRenewal date: 15 January 2027\nRenewal date: 03/02/2027"
    assert extract_key_dates(text, "Insurance") == []


def test_a_legacy_kind_is_classified_before_reading():
    text = household_texts.CAR_INSURANCE + "\n" + household_texts.TENANCY
    assert [found.kind for found in extract_key_dates(text, "Car insurance policy")] == ["renewal"]
    assert extract_key_dates(text, "Sales Receipt") == []


def test_a_date_the_pattern_cannot_read_counts_as_a_conflict():
    text = "Car insurance\nRenewal date: 15 January 2027\nRenewal date: 1st February 2027"
    assert extract_key_dates(text, "Insurance") == []


def test_one_trailing_full_stop_is_allowed():
    [found] = extract_key_dates("Car insurance\nRenewal date: 15 January 2027.", "Insurance")
    assert found.date == date(2027, 1, 15)


def test_a_label_followed_by_words_is_not_a_date():
    text = "Car insurance\nRenewal date: 15 January 2027\nValid until stock lasts"
    [found] = extract_key_dates(text, "Insurance")
    assert found.date == date(2027, 1, 15)


def test_an_old_guess_label_is_read_as_unclassified():
    text = household_texts.CAR_INSURANCE + "\n" + household_texts.TENANCY
    assert {found.kind for found in extract_key_dates(text, "User Manual")} == {"renewal", "contract_end"}
