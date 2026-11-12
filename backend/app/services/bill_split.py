"""Equal split of a confirmed bill among housemates, in integer cents."""


def split_equally(total_cents: int, count: int) -> list[int]:
    """Divide whole cents among `count` people; the first `total % count` people get one extra cent."""
    for value in (total_cents, count):
        if type(value) is not int:
            raise ValueError("Cents and the number of people must be integers.")
    if total_cents < 0:
        raise ValueError("The total cannot be negative.")
    if count < 2:
        raise ValueError("A split needs at least two people.")
    base, remainder = divmod(total_cents, count)
    return [base + (1 if index < remainder else 0) for index in range(count)]
