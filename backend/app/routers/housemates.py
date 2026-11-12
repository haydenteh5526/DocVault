import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.schemas.bill_split import HousemateCreate, HousemateOut
from app.services import housemates as service

router = APIRouter()


@router.get("", response_model=list[HousemateOut])
async def list_housemates(db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    return await service.list_housemates(db, user_id)


@router.post("", response_model=HousemateOut, status_code=201)
async def add_housemate(
    body: HousemateCreate,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        return await service.add_housemate(db, user_id, body.label)
    except service.HousemateConflict as exc:
        raise HTTPException(409, {"code": exc.code, "message": exc.message})


@router.delete("/{housemate_id}", status_code=204)
async def remove_housemate(
    housemate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    if not await service.remove_housemate(db, user_id, housemate_id):
        raise HTTPException(404, "Housemate not found")
