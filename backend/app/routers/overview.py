import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.schemas.overview import OverviewOut
from app.services.overview import build_overview

router = APIRouter()

IRISH_TIME = "Europe/Dublin"


@router.get("", response_model=OverviewOut)
async def get_overview(db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    """What needs the signed-in owner, what is coming up, recent documents, counts and every status."""
    return await build_overview(db, user_id, datetime.now(ZoneInfo(IRISH_TIME)).date())
