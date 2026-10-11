import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.models.base import Category

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str


@router.get("")
async def list_categories(db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    result = await db.execute(select(Category).where(Category.user_id == user_id))
    cats = result.scalars().all()
    return [{"id": str(c.id), "name": c.name} for c in cats]


@router.post("", status_code=201)
async def create_category(req: CategoryCreate, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    cat = Category(user_id=user_id, name=req.name)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return {"id": str(cat.id), "name": cat.name}


@router.patch("/{category_id}")
async def update_category(category_id: uuid.UUID, req: CategoryCreate, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    result = await db.execute(select(Category).where(Category.id == category_id, Category.user_id == user_id))
    cat = result.scalar_one_or_none()
    if not cat:
        from fastapi import HTTPException
        raise HTTPException(404, "Category not found")
    cat.name = req.name
    await db.commit()
    return {"id": str(cat.id), "name": cat.name}


@router.delete("/{category_id}", status_code=204)
async def delete_category(category_id: uuid.UUID, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    result = await db.execute(select(Category).where(Category.id == category_id, Category.user_id == user_id))
    cat = result.scalar_one_or_none()
    if cat:
        await db.delete(cat)
        await db.commit()
