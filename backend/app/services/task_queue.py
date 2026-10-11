"""Background task enqueue with graceful inline fallback.

If Redis/ARQ is available the job is enqueued for the worker; otherwise the
caller is told to process inline so uploads keep working with no queue.
"""
from app.config import settings
from app.logging_config import get_logger

logger = get_logger("task_queue")


async def enqueue_document_processing(document_id: str) -> bool:
    """Enqueue document processing. Returns True if enqueued, False to process inline."""
    if not settings.REDIS_URL:
        return False
    try:
        from arq import create_pool
        from arq.connections import RedisSettings

        pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
        try:
            await pool.enqueue_job("process_document_task", str(document_id))
        finally:
            try:
                await pool.close()
            except Exception as e:  # noqa: BLE001 - cleanup must not trigger duplicate inline processing
                logger.warning("Queue close failed (%s)", type(e).__name__)
        return True
    except Exception as e:  # noqa: BLE001 - any failure falls back to inline
        logger.warning("Enqueue failed (%s); processing inline", type(e).__name__)
        return False
