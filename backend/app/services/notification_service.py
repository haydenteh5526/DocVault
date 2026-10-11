from datetime import date, datetime, time, timedelta


async def get_expiring_warranties(db, user_id, days: int = 30):
    """Return warranties expiring within the given number of days."""
    from sqlalchemy import select

    from app.models.base import Document, Warranty

    today = date.today()
    window_start = datetime.combine(today, time.min)
    cutoff = datetime.combine(today + timedelta(days=days), time.max)
    result = await db.execute(
        select(Warranty, Document.title)
        .join(Document, Document.id == Warranty.document_id)
        .where(Document.user_id == user_id)
        .where(Warranty.expiry_date <= cutoff)
        .where(Warranty.expiry_date >= window_start)
        .order_by(Warranty.expiry_date)
    )
    return [
        {
            "warranty_id": str(w.id),
            "document_title": title,
            "expiry_date": w.expiry_date.isoformat(),
            "days_remaining": (
                (w.expiry_date.date() if isinstance(w.expiry_date, datetime) else w.expiry_date) - today
            ).days,
        }
        for w, title in result.all()
    ]
