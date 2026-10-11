import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.models.base import Document, Warranty

router = APIRouter()


class WarrantyCreate(BaseModel):
    document_id: uuid.UUID
    purchase_date: date | None = None
    expiry_date: date | None = None
    notes: str | None = None


class WarrantyUpdate(BaseModel):
    purchase_date: date | None = None
    expiry_date: date | None = None
    notes: str | None = None


class WarrantyOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    purchase_date: date | None
    expiry_date: date | None
    notes: str | None

    model_config = {"from_attributes": True}


@router.get("")
async def list_warranties(db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    result = await db.execute(
        select(Warranty, Document.title)
        .join(Document, Document.id == Warranty.document_id)
        .where(Document.user_id == user_id)
        .order_by(Warranty.expiry_date)
    )
    rows = result.all()
    return [
        WarrantyOut(id=w.id, document_id=w.document_id, document_title=title,
                    purchase_date=w.purchase_date, expiry_date=w.expiry_date, notes=w.notes)
        for w, title in rows
    ]


@router.post("", response_model=WarrantyOut, status_code=201)
async def create_warranty(req: WarrantyCreate, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    # Verify document belongs to user
    doc = await db.execute(select(Document).where(Document.id == req.document_id, Document.user_id == user_id))
    doc_obj = doc.scalar_one_or_none()
    if not doc_obj:
        raise HTTPException(404, "Document not found")

    warranty = Warranty(document_id=req.document_id, purchase_date=req.purchase_date, expiry_date=req.expiry_date, notes=req.notes)
    db.add(warranty)
    await db.commit()
    await db.refresh(warranty)
    return WarrantyOut(id=warranty.id, document_id=warranty.document_id, document_title=doc_obj.title,
                       purchase_date=warranty.purchase_date, expiry_date=warranty.expiry_date, notes=warranty.notes)


@router.patch("/{warranty_id}", response_model=WarrantyOut)
async def update_warranty(warranty_id: uuid.UUID, req: WarrantyUpdate, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    result = await db.execute(
        select(Warranty).join(Document).where(Warranty.id == warranty_id, Document.user_id == user_id)
    )
    warranty = result.scalar_one_or_none()
    if not warranty:
        raise HTTPException(404, "Warranty not found")

    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(warranty, field, value)
    await db.commit()
    await db.refresh(warranty)

    doc = await db.execute(select(Document.title).where(Document.id == warranty.document_id))
    title = doc.scalar_one()
    return WarrantyOut(id=warranty.id, document_id=warranty.document_id, document_title=title,
                       purchase_date=warranty.purchase_date, expiry_date=warranty.expiry_date, notes=warranty.notes)


@router.get("/expiring")
async def get_expiring_warranties(days: int = 30, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    from app.services.notification_service import get_expiring_warranties
    return await get_expiring_warranties(db, user_id, days)
