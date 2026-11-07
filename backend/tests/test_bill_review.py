import pytest

from app.services.bill_review import extract_bill_review


def test_review_uses_labelled_fields_and_preserves_their_source_lines():
    text = ("Electricity invoice\nIssued: 2 November 2026\nSubtotal: EUR 102.00\n\n"
            "  Total amount due: €1,234.05\nPayment due date: 23 November 2026")
    review = extract_bill_review(text)
    assert review.amount_due.value == "1234.05"
    assert review.due_date.value == "2026-11-23"
    for field, line in [(review.amount_due, 5), (review.due_date, 6)]:
        [source] = field.sources
        assert source.line == line
        assert source.text == text.splitlines()[line - 1]


@pytest.mark.parametrize("entry", ["Due date: 04/05/2026", "Due date: 31 February 2026",
                                    "Due date: 2026-11-23\nPay by: 2026-11-24"])
def test_unclear_dates_retain_evidence_without_guessing(entry):
    review = extract_bill_review("Electricity bill\n" + entry)
    assert review.due_date.value is None
    assert [line.text for line in review.due_date.sources] == entry.splitlines()
    assert review.amount_due.value is None and not review.amount_due.sources


@pytest.mark.parametrize("entry", ["Amount due: $12.00", "Amount due: -12.00 EUR",
                                    "Amount due: EUR 12.00\nBalance due: EUR 10.00"])
def test_unsupported_or_conflicting_amounts_remain_unresolved(entry):
    review = extract_bill_review("Electricity bill\n" + entry)
    assert review.amount_due.value is None
    assert review.amount_due.sources


def test_unrelated_documents_do_not_show_bill_fields():
    assert extract_bill_review("User manual\nWarranty due date: 23 November 2026") is None
