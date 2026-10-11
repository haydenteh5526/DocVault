"""Unit tests for the retry/backoff utility."""
import pytest

from app.services.retry import with_retry


def test_returns_result_on_first_success():
    assert with_retry(lambda: 42) == 42


def test_retries_then_succeeds(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda _: None)  # no real delay
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise ValueError("transient")
        return "ok"

    assert with_retry(flaky, attempts=3, base_delay=0.01) == "ok"
    assert calls["n"] == 3


def test_raises_after_exhausting_attempts(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda _: None)

    def always_fails():
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        with_retry(always_fails, attempts=2, base_delay=0.01)
