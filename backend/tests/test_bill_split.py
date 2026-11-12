"""Equal split of a confirmed bill in integer cents: calculator, preview, save and reopen."""

import pytest

from app.services.bill_split import split_equally


def test_the_issue_example_gives_the_remainder_to_the_first_three():
    assert split_equally(12347, 4) == [3087, 3087, 3087, 3086]


def test_exact_division_has_no_remainder():
    assert split_equally(12000, 4) == [3000, 3000, 3000, 3000]
    assert split_equally(12500, 4) == [3125] * 4


def test_two_and_five_people():
    assert split_equally(12347, 2) == [6174, 6173]
    assert split_equally(12347, 5) == [2470, 2470, 2469, 2469, 2469]


def test_totals_smaller_than_the_number_of_people():
    assert split_equally(3, 4) == [1, 1, 1, 0]
    assert split_equally(0, 4) == [0, 0, 0, 0]


def test_shares_always_sum_to_the_total():
    for total in (0, 1, 2, 99, 100, 101, 12347, 999999999):
        for count in range(2, 13):
            shares = split_equally(total, count)
            assert sum(shares) == total
            assert len(shares) == count
            assert max(shares) - min(shares) <= 1
            assert shares == sorted(shares, reverse=True)
            assert all(type(share) is int for share in shares)


@pytest.mark.parametrize(
    "total, count",
    [(12347, 0), (12347, 1), (12347, -1), (-1, 4), (123.47, 4), (12347, 4.0), ("12347", 4), (True, 4)],
)
def test_invalid_inputs_are_rejected(total, count):
    with pytest.raises(ValueError):
        split_equally(total, count)
