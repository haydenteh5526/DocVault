import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.models.base import PushToken
from app.services import warranty_notifications

router = APIRouter()


class TokenRegister(BaseModel):
    token: str
    platform: str | None = None


@router.post("/register", status_code=201)
async def register_token(req: TokenRegister, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    """Register (or re-associate) an Expo push token for the current user."""
    existing = (await db.execute(select(PushToken).where(PushToken.token == req.token))).scalar_one_or_none()
    if existing:
        existing.user_id = user_id
        existing.platform = req.platform
        await db.commit()
        return {"id": str(existing.id), "status": "updated"}
    tok = PushToken(user_id=user_id, token=req.token, platform=req.platform)
    db.add(tok)
    await db.commit()
    await db.refresh(tok)
    return {"id": str(tok.id), "status": "registered"}


@router.delete("/register", status_code=204)
async def unregister_token(token: str, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    row = (await db.execute(
        select(PushToken).where(PushToken.token == token, PushToken.user_id == user_id)
    )).scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()


@router.post("/warranty-check")
async def trigger_warranty_check(days: int = 30, _user_id: uuid.UUID = Depends(get_current_user_id)):
    """On-demand warranty-expiry notification run (also runs daily via the worker cron)."""
    sent = await warranty_notifications.notify_expiring_warranties(days=days)
    return {"notifications_sent": sent}
