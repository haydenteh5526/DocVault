"""Heavy document processing (OCR, categorisation, embeddings, warranty extraction).

Shared by the synchronous inline fallback (in the request) and the ARQ worker.
Opens its own DB session so it is safe to run outside a request context.
"""
import asyncio
import uuid

from sqlalchemy import select

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

logger = get_logger("processor")


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
            doc.brand = metadata.brand
            doc.model = metadata.model
            doc.document_type = metadata.document_type
            if (not doc.title or doc.title == "Untitled") and metadata.title:
                doc.title = metadata.title

            # Generate a short AI summary
            if raw_text:
                doc.summary = await asyncio.to_thread(_generate_summary, raw_text)

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

                dates = warranty_extraction.extract_warranty_dates(raw_text)
                if dates:
                    has_warranty = (await db.execute(
                        select(Warranty).where(Warranty.document_id == doc.id)
                    )).scalar_one_or_none()
                    if not has_warranty:
                        db.add(Warranty(
                            document_id=doc.id,
                            purchase_date=dates.get("purchase_date"),
                            expiry_date=dates.get("expiry_date"),
                        ))

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


def _generate_summary(raw_text: str) -> str | None:
    """Generate a rich structured summary of the document using Mistral or fallback."""
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

    # Fallback: return a simple JSON structure with just an overview
    overview = (raw_text[:200] + "...") if len(raw_text) > 200 else raw_text
    fallback = json.dumps({
        "overview": overview,
        "key_topics": [],
        "specifications": [],
        "safety_warnings": [],
        "quick_facts": [],
    })
    return fallback
