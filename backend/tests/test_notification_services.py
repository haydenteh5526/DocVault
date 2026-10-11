"""Tests for in-app warranty queries and scheduled push notifications."""

import uuid
from datetime import date, datetime
from types import SimpleNamespace

import pytest

from app.services import notification_service, warranty_notifications


class _FixedDate(date):
    @classmethod
    def today(cls):
        return cls(2026, 9, 15)


class _FixedDateTime(datetime):
    @classmethod
    def utcnow(cls):
        return cls(2026, 9, 15, 12, 0, 0)


@pytest.mark.asyncio
async def test_get_expiring_warranties_normalises_datetime(monkeypatch):
    warranty_id = uuid.uuid4()
    warranty = SimpleNamespace(id=warranty_id, expiry_date=datetime(2026, 9, 20, 9, 30))

    class Result:
        def all(self):
            return [(warranty, "Laptop")]

    class DB:
        async def execute(self, statement):
            return Result()

    monkeypatch.setattr(notification_service, "date", _FixedDate)

    rows = await notification_service.get_expiring_warranties(DB(), uuid.uuid4(), days=30)

    assert rows == [{
        "warranty_id": str(warranty_id),
        "document_title": "Laptop",
        "expiry_date": "2026-09-20T09:30:00",
        "days_remaining": 5,
    }]


@pytest.mark.asyncio
async def test_warranty_notification_skips_missing_tokens_and_counts_pushes(monkeypatch):
    first_document_id = uuid.uuid4()
    second_document_id = uuid.uuid4()
    rows = [
        (
            SimpleNamespace(expiry_date=datetime(2026, 9, 16, 12, 0)),
            SimpleNamespace(id=first_document_id, user_id=uuid.uuid4(), title="Phone"),
        ),
        (
            SimpleNamespace(expiry_date=date(2026, 9, 20)),
            SimpleNamespace(id=second_document_id, user_id=uuid.uuid4(), title="Laptop"),
        ),
    ]

    class ScalarResult:
        def __init__(self, values):
            self.values = values

        def all(self):
            return self.values

    class Result:
        def __init__(self, *, values=None, row_values=None):
            self.values = values
            self.row_values = row_values

        def all(self):
            return self.row_values

        def scalars(self):
            return ScalarResult(self.values)

    class DB:
        def __init__(self):
            self.results = [
                Result(row_values=rows),
                Result(values=[]),
                Result(values=["token-a", "token-b"]),
            ]

        async def execute(self, statement):
            return self.results.pop(0)

    db = DB()

    class SessionContext:
        async def __aenter__(self):
            return db

        async def __aexit__(self, exc_type, exc, traceback):
            return False

    pushes = []

    def fake_send_push(tokens, *, title, body, data):
        pushes.append((tokens, title, body, data))
        return len(tokens)

    monkeypatch.setattr(warranty_notifications, "datetime", _FixedDateTime)
    monkeypatch.setattr(warranty_notifications, "date", _FixedDate)
    monkeypatch.setattr(warranty_notifications, "async_session", lambda: SessionContext())
    monkeypatch.setattr(warranty_notifications.push_service, "send_push", fake_send_push)

    sent = await warranty_notifications.notify_expiring_warranties(days=30)

    assert sent == 2
    assert pushes == [(
        ["token-a", "token-b"],
        "Warranty expiring soon",
        "Laptop warranty expires in 5 day(s).",
        {"document_id": str(second_document_id), "type": "warranty_expiry"},
    )]
