"""Unit tests for the ARQ worker entry points and runtime settings."""

import pytest

from app import worker


@pytest.mark.asyncio
async def test_process_document_task_delegates_document_id(monkeypatch):
    processed = []

    async def fake_process_document(document_id):
        processed.append(document_id)

    monkeypatch.setattr(worker, "process_document", fake_process_document)

    await worker.process_document_task({}, "document-123")

    assert processed == ["document-123"]


@pytest.mark.asyncio
async def test_warranty_cron_checks_thirty_day_window(monkeypatch):
    windows = []

    async def fake_notify_expiring_warranties(*, days):
        windows.append(days)

    monkeypatch.setattr(worker, "notify_expiring_warranties", fake_notify_expiring_warranties)

    await worker.warranty_expiry_cron({})

    assert windows == [30]


def test_worker_settings_register_expected_jobs_and_limits():
    assert worker.WorkerSettings.functions == [worker.process_document_task]
    assert worker.WorkerSettings.max_jobs == 5
    assert worker.WorkerSettings.job_timeout == 900

    [warranty_job] = worker.WorkerSettings.cron_jobs
    assert warranty_job.coroutine is worker.warranty_expiry_cron
    assert warranty_job.hour == 8
    assert warranty_job.minute == 0

    redis = worker.WorkerSettings.redis_settings
    assert (redis.host, redis.port, redis.database) == ("redis", 6379, 0)
