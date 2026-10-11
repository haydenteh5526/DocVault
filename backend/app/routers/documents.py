import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user_id, get_db
from app.models.base import Document, DocumentVersion
from app.schemas.document import DocumentList, DocumentOut, DocumentUpdate
from app.services import (
    document_processor,
    storage_service,
    task_queue,
)

router = APIRouter()


class BulkDeleteRequest(BaseModel):
    document_ids: list[uuid.UUID]


class BulkCategoriseRequest(BaseModel):
    document_ids: list[uuid.UUID]
    category_id: uuid.UUID | None = None

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024


def _validate_file_content(file_bytes: bytes, content_type: str) -> None:
    """Verify the bytes actually match the declared type.

    The client-supplied `content_type` is trivially spoofable, so we inspect the
    real content: PDFs must start with the %PDF magic number, and images must be
    decodable by Pillow. Rejects mismatched or corrupt uploads with 400.
    """
    if not file_bytes:
        raise HTTPException(400, "Empty file")

    if content_type == "application/pdf":
        if not file_bytes.startswith(b"%PDF"):
            raise HTTPException(400, "File content is not a valid PDF")
        return

    # Remaining allowed types are images — confirm Pillow can decode them.
    import io as _io

    from PIL import Image

    try:
        with Image.open(_io.BytesIO(file_bytes)) as img:
            img.verify()
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "File content is not a valid image") from None


@router.post("", response_model=DocumentOut, status_code=201)
async def upload_document(
    file: UploadFile,
    title: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"File type {file.content_type} not allowed")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large (max {MAX_FILE_SIZE_MB}MB)")

    # Defence in depth: validate the actual bytes, not just the declared type.
    _validate_file_content(file_bytes, file.content_type)

    s3_key = storage_service.upload_file(
        file_bytes, str(user_id), file.filename or "upload", file.content_type
    )

    # Create the document immediately in a pending state; heavy work (OCR, AI,
    # embeddings) runs in the background worker — or inline if no queue is available.
    doc = Document(
        user_id=user_id,
        title=title or file.filename or "Untitled",
        s3_key_original=s3_key,
        file_size=len(file_bytes),
        processing_status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    enqueued = await task_queue.enqueue_document_processing(str(doc.id))
    if not enqueued:
        # No worker/Redis — process inline so behaviour matches the original flow
        await document_processor.process_document(doc.id)
        await db.refresh(doc)

    return _to_response(doc)


@router.get("", response_model=DocumentList)
async def list_documents(
    skip: int = 0,
    limit: int = 20,
    brand: str | None = None,
    document_type: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    query = select(Document).where(Document.user_id == user_id).options(selectinload(Document.tags))
    if brand:
        query = query.where(Document.brand == brand)
    if document_type:
        query = query.where(Document.document_type == document_type)
    if q:
        query = query.where(Document.title.ilike(f"%{q}%"))
    if date_from:
        query = query.where(Document.created_at >= date_from)
    if date_to:
        query = query.where(Document.created_at <= date_to)
    query = query.order_by(Document.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    docs = result.scalars().all()

    count_query = select(func.count()).select_from(Document).where(Document.user_id == user_id)
    if brand:
        count_query = count_query.where(Document.brand == brand)
    if document_type:
        count_query = count_query.where(Document.document_type == document_type)
    if q:
        count_query = count_query.where(Document.title.ilike(f"%{q}%"))
    total = (await db.execute(count_query)).scalar() or 0

    return DocumentList(
        documents=[_to_response(d) for d in docs],
        total=total,
    )


@router.get("/export")
async def export_documents(
    fmt: str = Query("json", alias="format", pattern="^(json|csv)$"),
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Export all of the user's documents so their data isn't locked in.

    - ``format=json`` (default): full export including metadata + extracted text.
    - ``format=csv``: spreadsheet-friendly list of metadata (no extracted text).

    Both download as a file attachment.
    """
    import csv
    import io
    import json
    from datetime import datetime, timezone

    result = await db.execute(
        select(Document).where(Document.user_id == user_id).order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")

    if fmt == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "title", "brand", "model", "document_type", "file_size",
            "page_count", "processing_status", "is_favourite", "created_at",
        ])
        for d in docs:
            writer.writerow([
                d.title, d.brand or "", d.model or "", d.document_type or "",
                d.file_size or "", d.page_count or "", d.processing_status or "",
                d.is_favourite, d.created_at.isoformat() if d.created_at else "",
            ])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="docvault-export-{stamp}.csv"'},
        )

    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "count": len(docs),
        "documents": [
            {
                "id": str(d.id),
                "title": d.title,
                "brand": d.brand,
                "model": d.model,
                "document_type": d.document_type,
                "summary": d.summary,
                "raw_text": d.raw_text,
                "file_size": d.file_size,
                "page_count": d.page_count,
                "processing_status": d.processing_status,
                "is_favourite": d.is_favourite,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ],
    }
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="docvault-export-{stamp}.json"'},
    )


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(document_id: uuid.UUID, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    doc = await _get_doc_or_404(document_id, user_id, db)
    # Track last accessed
    from datetime import datetime
    doc.updated_at = datetime.utcnow()
    await db.commit()
    return _to_response(doc)


@router.patch("/{document_id}", response_model=DocumentOut)
async def update_document(
    document_id: uuid.UUID,
    update: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    doc = await _get_doc_or_404(document_id, user_id, db)
    changes = update.model_dump(exclude_unset=True)

    # Snapshot the previous text as a version whenever raw_text is changed
    if "raw_text" in changes and changes["raw_text"] != doc.raw_text and doc.raw_text is not None:
        await _snapshot_version(doc.id, doc.raw_text, db)

    for field, value in changes.items():
        setattr(doc, field, value)
    await db.commit()
    await db.refresh(doc)
    return _to_response(doc)


async def _snapshot_version(document_id: uuid.UUID, raw_text: str, db: AsyncSession) -> None:
    """Persist the given text as the next version number for a document."""
    last = await db.execute(
        select(func.max(DocumentVersion.version_number)).where(DocumentVersion.document_id == document_id)
    )
    next_num = (last.scalar() or 0) + 1
    db.add(DocumentVersion(document_id=document_id, raw_text=raw_text, version_number=next_num))


@router.get("/{document_id}/versions")
async def list_versions(document_id: uuid.UUID, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    await _get_doc_or_404(document_id, user_id, db)
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
    )
    versions = result.scalars().all()
    return [
        {
            "id": str(v.id),
            "version_number": v.version_number,
            "created_at": v.created_at.isoformat() if v.created_at else None,
            "preview": (v.raw_text or "")[:200],
            "char_count": len(v.raw_text or ""),
        }
        for v in versions
    ]


@router.post("/{document_id}/versions/{version_id}/restore", response_model=DocumentOut)
async def restore_version(document_id: uuid.UUID, version_id: uuid.UUID, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    doc = await _get_doc_or_404(document_id, user_id, db)
    result = await db.execute(
        select(DocumentVersion).where(DocumentVersion.id == version_id, DocumentVersion.document_id == document_id)
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Version not found."})
    # Snapshot current text before restoring, so the restore is itself reversible
    if doc.raw_text is not None:
        await _snapshot_version(doc.id, doc.raw_text, db)
    doc.raw_text = version.raw_text
    await db.commit()
    await db.refresh(doc)
    return _to_response(doc)


@router.post("/{document_id}/reprocess", response_model=DocumentOut)
async def reprocess_document(document_id: uuid.UUID, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    doc = await _get_doc_or_404(document_id, user_id, db)
    doc.processing_status = "pending"
    await db.commit()

    enqueued = await task_queue.enqueue_document_processing(str(doc.id))
    if not enqueued:
        await document_processor.process_document(doc.id)
        await db.refresh(doc)

    return _to_response(doc)


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: uuid.UUID, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    doc = await _get_doc_or_404(document_id, user_id, db)
    storage_service.delete_file(doc.s3_key_original)
    if doc.s3_key_thumbnail:
        storage_service.delete_file(doc.s3_key_thumbnail)
    await db.delete(doc)
    await db.commit()


@router.post("/bulk/delete", status_code=204)
async def bulk_delete(req: BulkDeleteRequest, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    result = await db.execute(select(Document).where(Document.id.in_(req.document_ids), Document.user_id == user_id))
    docs = result.scalars().all()
    for doc in docs:
        storage_service.delete_file(doc.s3_key_original)
        if doc.s3_key_thumbnail:
            storage_service.delete_file(doc.s3_key_thumbnail)
    await db.execute(sa_delete(Document).where(Document.id.in_([d.id for d in docs])))
    await db.commit()


@router.post("/bulk/categorise")
async def bulk_categorise(req: BulkCategoriseRequest, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    result = await db.execute(select(Document).where(Document.id.in_(req.document_ids), Document.user_id == user_id))
    docs = result.scalars().all()
    for doc in docs:
        doc.category_id = req.category_id
    await db.commit()
    return {"updated": len(docs)}


@router.get("/{document_id}/share")
async def share_document(document_id: uuid.UUID, expires_hours: int = 24, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    """Generate a time-limited shareable link to view the document."""
    doc = await _get_doc_or_404(document_id, user_id, db)
    expires = min(max(expires_hours, 1), 168) * 3600  # 1h–7d
    url = storage_service.get_presigned_url(doc.s3_key_original, expires_in=expires)
    return {"share_url": url, "expires_in_hours": expires // 3600}


@router.post("/{document_id}/favourite")
async def toggle_favourite(document_id: uuid.UUID, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    doc = await _get_doc_or_404(document_id, user_id, db)
    doc.is_favourite = not doc.is_favourite
    await db.commit()
    return {"is_favourite": doc.is_favourite}


@router.get("/{document_id}/similar")
async def find_similar_documents(document_id: uuid.UUID, limit: int = 5, db: AsyncSession = Depends(get_db), user_id: uuid.UUID = Depends(get_current_user_id)):
    """Find documents semantically similar to the given document using embeddings."""
    from sqlalchemy import text

    from app.models.base import DocChunk

    # Get the average embedding of this document's chunks
    chunks = (await db.execute(select(DocChunk).where(DocChunk.document_id == document_id))).scalars().all()
    if not chunks or not chunks[0].embedding:
        return {"similar": []}

    # Use the first chunk's embedding as the query vector (most representative)
    embedding = chunks[0].embedding
    embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"

    result = await db.execute(
        text("""
            SELECT DISTINCT ON (d.id) d.id, d.title, d.brand, d.document_type,
                   1 - (dc.embedding <=> cast(:embedding as vector)) as similarity
            FROM doc_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = cast(:user_id as uuid)
              AND d.id != cast(:doc_id as uuid)
            ORDER BY d.id, dc.embedding <=> cast(:embedding as vector)
        """),
        {"embedding": embedding_str, "user_id": str(user_id), "doc_id": str(document_id)},
    )
    rows = result.fetchall()
    # Sort by similarity descending and take top N
    sorted_rows = sorted(rows, key=lambda r: r.similarity if r.similarity == r.similarity else 0, reverse=True)[:limit]

    return {
        "similar": [
            {
                "id": str(r.id),
                "title": r.title,
                "brand": r.brand,
                "document_type": r.document_type,
                "similarity": round(r.similarity, 4) if r.similarity == r.similarity else 0.0,
            }
            for r in sorted_rows
            if r.similarity and r.similarity > 0.3  # Only show reasonably similar docs
        ]
    }



async def _get_doc_or_404(document_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Document:
    query = select(Document).where(Document.id == document_id, Document.user_id == user_id).options(selectinload(Document.tags))
    result = await db.execute(query)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


def _to_response(doc: Document) -> DocumentOut:
    image_url = storage_service.get_presigned_url(doc.s3_key_original)
    return DocumentOut(
        id=doc.id,
        title=doc.title,
        brand=doc.brand,
        model=doc.model,
        document_type=doc.document_type,
        category_id=doc.category_id,
        raw_text=doc.raw_text,
        summary=doc.summary,
        file_size=doc.file_size,
        page_count=doc.page_count,
        ocr_confidence=doc.ocr_confidence,
        image_url=image_url,
        processing_status=doc.processing_status,
        is_favourite=doc.is_favourite,
        tags=_safe_tags(doc),
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


def _safe_tags(doc: Document) -> list[dict]:
    """Return serialised tags, tolerating an unloaded relationship (e.g. fresh upload)."""
    from sqlalchemy import inspect as sa_inspect
    if "tags" in sa_inspect(doc).unloaded:
        return []
    return [{"id": t.id, "name": t.name, "color": t.color} for t in doc.tags]
