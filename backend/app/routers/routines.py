import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.rate_limit import limiter
from app.services.household import get_preferences
from app.services.routines import run_bill_check

router = APIRouter()


class ProposedItem(BaseModel):
    document_id: uuid.UUID
    title: str
    proposal_number: int
    remind_on: date


class SkippedItem(BaseModel):
    document_id: uuid.UUID
    title: str
    reason: str


class WarrantyEnding(BaseModel):
    document_id: uuid.UUID
    title: str
    expiry_date: date


class CheckOut(BaseModel):
    proposed: list[ProposedItem]
    skipped: list[SkippedItem]
    warranties_ending: list[WarrantyEnding]


@router.post("/check", response_model=CheckOut)
@limiter.limit("10/hour")
async def check_now(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Run Pip's bill check for the signed-in account only. It proposes; nothing is saved until approval."""
    if not (await get_preferences(db, user_id)).routines_enabled:
        raise HTTPException(409, {"code": "routines_off", "message": "Pip's daily check is switched off in Settings."})
    report = await run_bill_check(db, user_id=user_id)
    return CheckOut(
        proposed=[
            ProposedItem(
                document_id=item.document_id,
                title=item.title,
                proposal_number=item.proposal_number,  # type: ignore[arg-type]
                remind_on=item.remind_on,  # type: ignore[arg-type]
            )
            for item in report.items
            if item.outcome == "proposed"
        ],
        skipped=[
            SkippedItem(document_id=item.document_id, title=item.title, reason=item.reason or "")
            for item in report.items
            if item.outcome == "skipped"
        ],
        warranties_ending=[
            WarrantyEnding(document_id=document_id, title=title, expiry_date=expiry)
            for document_id, title, expiry in report.warranties_ending
        ],
    )
