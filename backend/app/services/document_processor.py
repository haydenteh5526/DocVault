"""Heavy document processing (OCR, categorisation, embeddings, warranty extraction).

Shared by the synchronous inline fallback (in the request) and the ARQ worker.
Opens its own DB session so it is safe to run outside a request context.
"""
import asyncio
import re
import uuid

from sqlalchemy import select

from app.config import settings
from app.dependencies import async_session
from app.logging_config import get_logger
from app.models.base import DocChunk, Document, Warranty
from app.services import (
    categorisation_service,
    chunking_service,
    embedding_service,
    image_processing,
    ocr_service,
    storage_service,
    warranty_extraction,
)
from app.services.key_dates import LEGACY_GUESS_LABELS

logger = get_logger("processor")

# Kinds that may carry a product warranty; an unclassified document (None) may too.
_WARRANTY_KINDS = {"Receipt", "Warranty", "Manual", "Other", None}
# The fallback kinds that may replace an old keyword-guess label (R4-a).
_FALLBACK_REPLACES_GUESS = {"Bill", "Receipt", "Insurance", "Contract"}

_UPLOAD_EXTENSION = re.compile(r"\.(?:pdf|jpe?g|png|webp)$", re.IGNORECASE)


def looks_like_upload_name(title: str | None) -> bool:
    """True for a title nobody chose: blank, "Untitled", or a file name with an upload extension."""
    if title is None or not title.strip() or title.strip() == "Untitled":
        return True
    return bool(_UPLOAD_EXTENSION.search(title.strip()))


def tidy_filename(title: str) -> str | None:
    """Turn an uploaded file name into a readable title, or None if nothing readable is left."""
    name = _UPLOAD_EXTENSION.sub("", (title or "").strip())
    if " " not in name:
        name = name.replace("-", " ").replace("_", " ")
    name = re.sub(r"\s+", " ", name).strip()
    if len(re.findall(r"[^\W_]", name)) < 2:
        return None
    return name[0].upper() + name[1:]


def _apply_details(doc: Document, raw_text: str, metadata) -> None:
    """Apply extracted details without overwriting anything the owner set.

    The title changes only while it still looks like an upload name. A kind read by a model
    replaces the stored kind; a keyword-fallback guess (no key, or the provider failed) only
    fills an empty kind, and a legacy free-text kind is mapped with normalise_kind instead.
    Brand and model are filled only when empty.
    """
    if raw_text and looks_like_upload_name(doc.title):
        doc.title = (
            categorisation_service.sanitise_title(metadata.title)
            or tidy_filename(doc.title or "")
            or doc.title
        )
    kind_source = getattr(metadata, "kind_source", None)
    if kind_source == "model" and metadata.document_type:
        doc.document_type = metadata.document_type
    elif doc.document_type in LEGACY_GUESS_LABELS:
        # An old keyword guess says nothing about the kind (R3-a). A fallback guess replaces it only with a
        # kind the guess can tell apart; otherwise the label stays and still counts as unclassified (R4-a).
        if metadata.document_type in _FALLBACK_REPLACES_GUESS:
            doc.document_type = metadata.document_type
    elif not doc.document_type:
        if metadata.document_type:
            doc.document_type = metadata.document_type
    elif doc.document_type not in categorisation_service.KINDS:
        doc.document_type = categorisation_service.normalise_kind(doc.document_type)
    if not doc.brand and metadata.brand:
        doc.brand = metadata.brand
    if not doc.model and metadata.model:
        doc.model = metadata.model


def _run_ocr_and_metadata(file_bytes: bytes, content_type: str) -> tuple[str, object]:
    """CPU/IO-bound work — runs in a worker thread to avoid blocking the event loop."""
    processed = (
        image_processing.preprocess_image(file_bytes)
        if content_type != "application/pdf"
        else file_bytes
    )
    raw_text = ocr_service.extract_text(processed, content_type)
    metadata = categorisation_service.categorise_document(raw_text)
    return raw_text, metadata


async def _summary_for(raw_text: str, metadata) -> str | None:
    """Mistral's structured summary when Mistral is configured; otherwise the extraction's own summary."""
    if settings.MISTRAL_API_KEY:
        return await asyncio.to_thread(_generate_summary, raw_text)
    return categorisation_service.sanitise_summary(metadata.summary)


async def _apply_warranty(db, doc: Document, raw_text: str) -> None:
    """Create a warranty only when an end date is known; never change a date the owner set.

    Bills, insurance policies and contracts never get one (a price guarantee or a policy's
    "Cover ends" line is not a product warranty). An existing warranty keeps its purchase
    date, expiry date and notes; only an empty expiry or purchase date is filled in.
    """
    # An old keyword-guess label counts as unclassified, as everywhere else (R3-a).
    kind = None if doc.document_type in LEGACY_GUESS_LABELS else doc.document_type
    if kind not in _WARRANTY_KINDS:
        return
    dates = warranty_extraction.extract_warranty_dates(raw_text)
    if not dates or not (dates.get("expiry_date") or dates.get("purchase_date")):
        return
    existing = (await db.execute(
        select(Warranty).where(Warranty.document_id == doc.id)
    )).scalar_one_or_none()
    if existing is None:
        if dates.get("expiry_date"):
            db.add(Warranty(
                document_id=doc.id,
                purchase_date=dates.get("purchase_date"),
                expiry_date=dates["expiry_date"],
            ))
        return
    if existing.expiry_date is None and dates.get("expiry_date"):
        existing.expiry_date = dates["expiry_date"]
    if existing.purchase_date is None and dates.get("purchase_date"):
        existing.purchase_date = dates["purchase_date"]


async def process_document(document_id: str | uuid.UUID) -> None:
    """Run the full processing pipeline for a document and update its status."""
    doc_id = uuid.UUID(str(document_id))
    async with async_session() as db:
        doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
        if not doc:
            logger.warning("process_document: document %s not found", doc_id)
            return

        doc.processing_status = "processing"
        await db.commit()

        try:
            file_bytes, content_type = await asyncio.to_thread(storage_service.download_file, doc.s3_key_original)
            raw_text, metadata = await asyncio.to_thread(_run_ocr_and_metadata, file_bytes, content_type)

            # Don't auto-assign category — keep document at root.
            # The detected document_type is stored as metadata for the user to see.
            doc.raw_text = raw_text or None
            _apply_details(doc, raw_text, metadata)

            if raw_text:
                doc.summary = await _summary_for(raw_text, metadata)

            # Replace any existing chunks, then chunk + embed
            existing = (await db.execute(select(DocChunk).where(DocChunk.document_id == doc.id))).scalars().all()
            for c in existing:
                await db.delete(c)

            if raw_text:
                chunks = chunking_service.chunk_text(raw_text)
                texts = [c["text"] for c in chunks]
                embeddings = await asyncio.to_thread(embedding_service.get_embeddings, texts)
                for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                    db.add(DocChunk(
                        document_id=doc.id,
                        chunk_index=i,
                        chunk_text=chunk["text"],
                        section_title=chunk["section_title"],
                        embedding=embedding,
                    ))

                await _apply_warranty(db, doc, raw_text)

            doc.processing_status = "complete"
            await db.commit()
            logger.info("Processed document %s", doc_id)
        except Exception:
            logger.exception("Failed to process document %s", doc_id)
            await db.rollback()
            # Mark as failed in a fresh transaction
            failed = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
            if failed:
                failed.processing_status = "failed"
                await db.commit()
            raise


async def refresh_details(document_id: uuid.UUID) -> None:
    """Read a completed document's details again from its stored text.

    Re-runs only classification, title, summary and warranty extraction. OCR is not run and
    raw_text, chunks, embeddings and versions are never touched, so text the owner corrected
    stays. Title, kind, brand, model and warranty dates follow the same preservation rules as
    processing; folders, stars, tags and every bill, split and reminder record are never read
    or written. A summary is replaced only when a new one is available.
    """
    doc_id = uuid.UUID(str(document_id))
    async with async_session() as db:
        raw_text = (await db.execute(select(Document.raw_text).where(Document.id == doc_id))).scalar_one_or_none()
    if not raw_text:
        return

    # The model call happens before the row is locked, so an owner's edit is never held up by it.
    metadata = await asyncio.to_thread(categorisation_service.categorise_document, raw_text)
    summary = await _summary_for(raw_text, metadata)

    async with async_session() as db:
        doc = (await db.execute(
            select(Document).where(Document.id == doc_id).with_for_update()
        )).scalar_one_or_none()
        if not doc or not doc.raw_text:
            return
        _apply_details(doc, doc.raw_text, metadata)
        if summary:
            doc.summary = summary
        await _apply_warranty(db, doc, doc.raw_text)
        await db.commit()
    logger.info("Refreshed details for document %s", doc_id)


def _generate_summary(raw_text: str) -> str | None:
    """Generate a structured summary with Mistral, or None when no summary can be written."""
    import json

    from app.config import settings

    if settings.MISTRAL_API_KEY:
        import httpx

        from app.services.retry import with_retry

        system_prompt = """Analyse this document and return a JSON object with the following structure:
{
  "overview": "A 2-3 sentence overview of what this document is about",
  "key_topics": ["topic1", "topic2", "topic3"],
  "specifications": [{"label": "spec name", "value": "spec value"}],
  "safety_warnings": ["warning1", "warning2"],
  "quick_facts": [{"label": "fact name", "value": "fact value"}]
}

Rules:
- overview: 2-3 informative sentences describing the document's purpose and scope
- key_topics: 3-6 main topics or sections covered (short phrases)
- specifications: up to 6 key technical specs if it's a product manual/datasheet; empty array otherwise
- safety_warnings: any safety warnings, precautions, or important notices; empty array if none found
- quick_facts: 3-5 quick reference facts (e.g., dimensions, power, capacity, warranty period)
- Return ONLY valid JSON, no markdown formatting or explanation"""

        def _call():
            resp = httpx.post(
                "https://api.mistral.ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.MISTRAL_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "mistral-small-latest",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": raw_text[:4000]},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 800,
                },
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

        try:
            result = with_retry(_call, label="mistral.summary", attempts=2)
            content = result["choices"][0]["message"]["content"].strip()
            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[1] if "\n" in content else content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()
            # Validate it's valid JSON
            json.loads(content)
            return content
        except Exception:
            pass

    # No provider key, or the call failed: store no summary. A placeholder that
    # looks like AI output would only be shown to the owner as if it were real.
    return None
