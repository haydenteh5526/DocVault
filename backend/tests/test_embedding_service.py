"""Unit tests for embedding provider selection (pure, no network)."""
from app.config import settings
from app.services import embedding_service


def _reset(monkeypatch, provider="auto", ollama="", gemini=""):
    monkeypatch.setattr(settings, "EMBEDDING_PROVIDER", provider)
    monkeypatch.setattr(settings, "OLLAMA_URL", ollama)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", gemini)


def test_pin_ollama(monkeypatch):
    _reset(monkeypatch, provider="ollama")
    assert embedding_service._select_provider() == "ollama"


def test_pin_gemini(monkeypatch):
    _reset(monkeypatch, provider="gemini")
    assert embedding_service._select_provider() == "gemini"


def test_auto_prefers_ollama(monkeypatch):
    _reset(monkeypatch, provider="auto", ollama="http://ollama:11434", gemini="key")
    assert embedding_service._select_provider() == "ollama"


def test_auto_falls_back_to_gemini(monkeypatch):
    _reset(monkeypatch, provider="auto", ollama="", gemini="key")
    assert embedding_service._select_provider() == "gemini"


def test_auto_none_when_nothing_configured(monkeypatch):
    _reset(monkeypatch, provider="auto", ollama="", gemini="")
    assert embedding_service._select_provider() == "none"


def test_empty_texts_returns_empty():
    assert embedding_service.get_embeddings([]) == []
