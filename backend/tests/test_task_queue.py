"""Unit tests for the background task queue — fallback behaviour."""
import pytest

from app.services import task_queue


@pytest.mark.asyncio
async def test_enqueue_returns_false_without_redis(monkeypatch):
    # No REDIS_URL configured -> caller should process inline
    monkeypatch.setattr(task_queue.settings, "REDIS_URL", "")
    assert await task_queue.enqueue_document_processing("some-id") is False


@pytest.mark.asyncio
async def test_enqueue_returns_false_on_connection_error(monkeypatch):
    # REDIS_URL set but unreachable -> graceful fallback (False), no exception
    monkeypatch.setattr(task_queue.settings, "REDIS_URL", "redis://127.0.0.1:6390/0")
    result = await task_queue.enqueue_document_processing("some-id")
    assert result is False


@pytest.mark.asyncio
async def test_enqueue_submits_named_job_and_closes_pool(monkeypatch):
    calls = []

    class Pool:
        async def enqueue_job(self, function_name, document_id):
            calls.append(("enqueue", function_name, document_id))

        async def close(self):
            calls.append(("close",))

    async def fake_create_pool(redis_settings):
        calls.append(("connect", redis_settings.host, redis_settings.port, redis_settings.database))
        return Pool()

    monkeypatch.setattr(task_queue.settings, "REDIS_URL", "redis://queue.test:6380/2")
    monkeypatch.setattr("arq.create_pool", fake_create_pool)

    assert await task_queue.enqueue_document_processing("document-123") is True
    assert calls == [
        ("connect", "queue.test", 6380, 2),
        ("enqueue", "process_document_task", "document-123"),
        ("close",),
    ]


@pytest.mark.asyncio
async def test_enqueue_failure_closes_pool_before_inline_fallback(monkeypatch):
    calls = []

    class Pool:
        async def enqueue_job(self, function_name, document_id):
            calls.append(("enqueue", function_name, document_id))
            raise RuntimeError("queue unavailable")

        async def close(self):
            calls.append(("close",))

    async def fake_create_pool(redis_settings):
        return Pool()

    monkeypatch.setattr(task_queue.settings, "REDIS_URL", "redis://queue.test:6379/0")
    monkeypatch.setattr("arq.create_pool", fake_create_pool)

    assert await task_queue.enqueue_document_processing("document-123") is False
    assert calls == [
        ("enqueue", "process_document_task", "document-123"),
        ("close",),
    ]


@pytest.mark.asyncio
async def test_close_failure_does_not_request_duplicate_inline_processing(monkeypatch):
    class Pool:
        async def enqueue_job(self, function_name, document_id):
            return None

        async def close(self):
            raise RuntimeError("close failed")

    async def fake_create_pool(redis_settings):
        return Pool()

    monkeypatch.setattr(task_queue.settings, "REDIS_URL", "redis://queue.test:6379/0")
    monkeypatch.setattr("arq.create_pool", fake_create_pool)

    assert await task_queue.enqueue_document_processing("document-123") is True
