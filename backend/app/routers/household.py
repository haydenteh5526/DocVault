import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.schemas.household import HouseholdPreferencesIn, HouseholdPreferencesOut
from app.services import household as service

router = APIRouter()


@router.get("/preferences", response_model=HouseholdPreferencesOut)
async def get_preferences(db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    return await service.get_preferences(db, user_id)


@router.put("/preferences", response_model=HouseholdPreferencesOut)
async def save_preferences(
    body: HouseholdPreferencesIn,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    return await service.save_preferences(db, user_id, body)
