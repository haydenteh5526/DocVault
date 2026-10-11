"""Unit tests for caching — uses in-memory fallback (no Redis required)."""
from app.services import cache, embedding_service


def test_in_memory_cache_roundtrip(monkeypatch):
    # Force in-memory path
    monkeypatch.setattr(cache, "_redis", False)
    cache.cache_set("test:key", [1, 2, 3])
    assert cache.cache_get("test:key") == [1, 2, 3]


def test_cache_miss_returns_none(monkeypatch):
    monkeypatch.setattr(cache, "_redis", False)
    assert cache.cache_get("test:does-not-exist") is None


def test_cache_stores_dict(monkeypatch):
    monkeypatch.setattr(cache, "_redis", False)
    cache.cache_set("test:dict", {"a": 1})
    assert cache.cache_get("test:dict") == {"a": 1}


def test_embedding_cache_key_is_deterministic():
    k1 = embedding_service._cache_key("hello world")
    k2 = embedding_service._cache_key("hello world")
    k3 = embedding_service._cache_key("different")
    assert k1 == k2
    assert k1 != k3
    assert len(k1) == 64  # sha256 hex


def test_embeddings_dev_fallback_dimensions(monkeypatch):
    # No Gemini / Ollama -> zero vectors of correct dim
    monkeypatch.setattr(embedding_service.settings, "GEMINI_API_KEY", "")
    monkeypatch.setattr(embedding_service.settings, "OLLAMA_URL", "")
    embedding_service._cache.clear()
    result = embedding_service.get_embeddings(["some new unique text 12345"])
    assert len(result) == 1
    assert len(result[0]) == embedding_service.EMBEDDING_DIM


def test_embeddings_empty_input():
    assert embedding_service.get_embeddings([]) == []
