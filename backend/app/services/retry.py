import time
from collections.abc import Callable
from typing import TypeVar

from app.logging_config import get_logger

logger = get_logger("retry")
T = TypeVar("T")


def with_retry(fn: Callable[[], T], *, attempts: int = 3, base_delay: float = 0.5, label: str = "operation") -> T:
    """Run fn with exponential backoff. Raises the last exception if all attempts fail."""
    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - we re-raise after retries
            last_exc = e
            if attempt == attempts:
                break
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning("%s failed (attempt %d/%d): %s. Retrying in %.1fs", label, attempt, attempts, e, delay)
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc
