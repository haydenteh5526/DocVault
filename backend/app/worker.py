"""ARQ worker — runs heavy document processing off the request path.

Start with:  arq app.worker.WorkerSettings
"""
from arq import cron
from arq.connections import RedisSettings

from app.config import settings
from app.logging_config import get_logger
from app.services.document_processor import process_document
from app.services.warranty_notifications import notify_expiring_warranties

logger = get_logger("worker")


async def process_document_task(ctx: dict, document_id: str) -> None:
    logger.info("Worker picked up document %s", document_id)
    await process_document(document_id)


async def warranty_expiry_cron(ctx: dict) -> None:
    logger.info("Running daily warranty-expiry check")
    await notify_expiring_warranties(days=30)


class WorkerSettings:
    functions = [process_document_task]
    cron_jobs = [cron(warranty_expiry_cron, hour=8, minute=0)]  # daily at 08:00
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL or "redis://redis:6379/0")
    max_jobs = 5
    job_timeout = 900  # 15 min — large multi-page PDFs need time for OCR
