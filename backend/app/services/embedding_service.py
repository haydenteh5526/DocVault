import hashlib

import httpx

from app.config import settings

EMBEDDING_DIM = 1536

# Simple in-process cache: sha256(text) -> embedding
_cache: dict[str, list[float]] = {}


def _cache_key(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _select_provider() -> str:
    """Resolve which embedding provider to use.

    Mixing providers is dangerous: nomic-embed-text (768d, padded) and
    gemini-embedding-001 (3072d, truncated) live in different vector spaces,
    so cosine similarity between them is meaningless. Pin EMBEDDING_PROVIDER
    in production to guarantee every document + query uses the same model.
    """
    pinned = (settings.EMBEDDING_PROVIDER or "auto").lower()
    if pinned == "ollama":
        return "ollama"
    if pinned == "gemini":
        return "gemini"
    if pinned not in ("auto", ""):
        # Unknown value — fail safe to auto rather than silently misbehave
        pass
    # auto: prefer local Ollama, then Gemini, else zero-vector dev fallback
    if settings.OLLAMA_URL:
        return "ollama"
    if settings.GEMINI_API_KEY:
        return "gemini"
    return "none"


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings via the configured provider. Caches by content hash."""
    if not texts:
        return []

    # Resolve from cache where possible (L1 in-process, L2 Redis)
    from app.services.cache import cache_get, cache_set
    results: list[list[float] | None] = [None] * len(texts)
    uncached_idx: list[int] = []
    uncached_texts: list[str] = []
    for i, t in enumerate(texts):
        key = _cache_key(t)
        if key in _cache:
            results[i] = _cache[key]
            continue
        l2 = cache_get(f"emb:{key}")
        if l2 is not None:
            _cache[key] = l2
            results[i] = l2
        else:
            uncached_idx.append(i)
            uncached_texts.append(t)

    if uncached_texts:
        provider = _select_provider()
        if provider == "ollama":
            fresh = _ollama_embeddings(uncached_texts)
        elif provider == "gemini":
            fresh = _gemini_embeddings(uncached_texts)
        else:
            fresh = [[0.0] * EMBEDDING_DIM for _ in uncached_texts]
        for idx, emb in zip(uncached_idx, fresh):
            results[idx] = emb
            key = _cache_key(texts[idx])
            _cache[key] = emb
            cache_set(f"emb:{key}", emb, ttl=86400)

    return [r if r is not None else [0.0] * EMBEDDING_DIM for r in results]


def get_embedding(text: str) -> list[float]:
    return get_embeddings([text])[0]


def _gemini_embeddings(texts: list[str]) -> list[list[float]]:
    import time

    from google import genai

    from app.services.retry import with_retry

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    embeddings = []
    # Gemini free tier: 100 requests per minute. Use batches of 50 with 35s delay to stay safe.
    batch_size = 50
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]

        def _call(b=batch):
            result = client.models.embed_content(
                model="gemini-embedding-001",
                contents=b,
            )
            return result

        response = with_retry(_call, label="gemini.embeddings", attempts=5, base_delay=30.0)
        for emb in response.embeddings:
            vec = list(emb.values)
            # Gemini gemini-embedding-001 outputs 3072 dims; truncate/pad to EMBEDDING_DIM for pgvector compatibility
            if len(vec) < EMBEDDING_DIM:
                vec = vec + [0.0] * (EMBEDDING_DIM - len(vec))
            embeddings.append(vec[:EMBEDDING_DIM])

        # Rate limit: wait between batches if more to process
        if i + batch_size < len(texts):
            time.sleep(35)

    return embeddings


def _ollama_embeddings(texts: list[str]) -> list[list[float]]:
    results = []
    for text in texts:
        resp = httpx.post(f"{settings.OLLAMA_URL}/api/embeddings", json={
            "model": "nomic-embed-text", "prompt": text
        }, timeout=30)
        if resp.status_code == 200:
            embedding = resp.json().get("embedding", [0.0] * EMBEDDING_DIM)
            # Pad/truncate to EMBEDDING_DIM
            embedding = (embedding + [0.0] * EMBEDDING_DIM)[:EMBEDDING_DIM]
            results.append(embedding)
        else:
            results.append([0.0] * EMBEDDING_DIM)
    return results
