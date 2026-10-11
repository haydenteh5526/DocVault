"""Warranty-expiry notification trigger.

Finds warranties expiring within a window, and pushes a reminder to each
owner's registered devices. Opens its own DB session so it can run from the
ARQ cron job as well as an on-demand endpoint.
"""
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.dependencies import async_session
from app.logging_config import get_logger
from app.models.base import Document, PushToken, Warranty
from app.services import push_service

logger = get_logger("warranty_notify")


async def notify_expiring_warranties(days: int = 30) -> int:
    """Notify owners of warranties expiring within `days`. Returns push count."""
    cutoff = datetime.utcnow() + timedelta(days=days)
    sent = 0
    async with async_session() as db:
        rows = (await db.execute(
            select(Warranty, Document)
            .join(Document, Document.id == Warranty.document_id)
            .where(
                Warranty.expiry_date.is_not(None),
                Warranty.expiry_date <= cutoff,
                Warranty.expiry_date >= datetime.utcnow(),
            )
        )).all()

        for warranty, doc in rows:
            tokens = (await db.execute(
                select(PushToken.token).where(PushToken.user_id == doc.user_id)
            )).scalars().all()
            if not tokens:
                continue
            expiry = warranty.expiry_date
            expiry_date = expiry.date() if isinstance(expiry, datetime) else expiry
            days_left = (expiry_date - date.today()).days
            sent += push_service.send_push(
                list(tokens),
                title="Warranty expiring soon",
                body=f"{doc.title} warranty expires in {days_left} day(s).",
                data={"document_id": str(doc.id), "type": "warranty_expiry"},
            )
    logger.info("Warranty expiry check: %d notification(s) sent", sent)
    return sent
