import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.services import embedding_service

router = APIRouter()


@router.get("")
async def search_documents(
    q: str = Query(..., min_length=1),
    mode: str = Query("hybrid", pattern="^(semantic|keyword|hybrid)$"),
    limit: int = 5,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    results = []

    # Full-text keyword search (title, brand, model, and body)
    if mode in ("keyword", "hybrid"):
        ft_result = await db.execute(
            text("""
                SELECT d.id as document_id, d.title as document_title,
                       ts_headline('english', coalesce(d.raw_text, d.title), plainto_tsquery('english', :q),
                                   'MaxFragments=1,MaxWords=30') as excerpt
                FROM documents d
                WHERE d.user_id = cast(:user_id as uuid)
                  AND to_tsvector('english',
                        coalesce(d.title,'') || ' ' || coalesce(d.brand,'') || ' ' ||
                        coalesce(d.model,'') || ' ' || coalesce(d.document_type,'') || ' ' ||
                        coalesce(d.raw_text,'')
                      ) @@ plainto_tsquery('english', :q)
                LIMIT :limit
            """),
            {"q": q, "user_id": str(user_id), "limit": limit},
        )
        for row in ft_result.fetchall():
            results.append({
                "chunk_text": row.excerpt,
                "document_id": row.document_id,
                "document_title": row.document_title,
                "similarity": 1.0,
                "match_type": "keyword",
            })

    # Semantic vector search
    if mode in ("semantic", "hybrid"):
        query_embedding = embedding_service.get_embedding(q)
        embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
        vec_result = await db.execute(
            text("""
                SELECT dc.chunk_text, dc.document_id, d.title as document_title,
                       1 - (dc.embedding <=> cast(:embedding as vector)) as similarity
                FROM doc_chunks dc
                JOIN documents d ON d.id = dc.document_id
                WHERE d.user_id = cast(:user_id as uuid)
                ORDER BY dc.embedding <=> cast(:embedding as vector)
                LIMIT :limit
            """),
            {"embedding": embedding_str, "user_id": str(user_id), "limit": limit},
        )
        for row in vec_result.fetchall():
            results.append({
                "chunk_text": row.chunk_text,
                "document_id": row.document_id,
                "document_title": row.document_title,
                "similarity": round(row.similarity, 4) if row.similarity == row.similarity else 0.0,
                "match_type": "semantic",
            })

    # Deduplicate by document_id, keep highest similarity
    seen = {}
    for r in results:
        doc_id = str(r["document_id"])
        if doc_id not in seen or r["similarity"] > seen[doc_id]["similarity"]:
            seen[doc_id] = r
    deduped = sorted(seen.values(), key=lambda x: x["similarity"], reverse=True)[:limit]

    return {"query": q, "mode": mode, "results": deduped}
