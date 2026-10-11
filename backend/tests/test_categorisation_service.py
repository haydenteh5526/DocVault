from types import SimpleNamespace

import httpx
import pytest
from google import genai
from openai import OpenAI

from app.config import settings
from app.services import categorisation_service, retry


def _metadata_tuple(metadata):
    return metadata.brand, metadata.model, metadata.document_type, metadata.title


def _configure(monkeypatch, *, groq="", gemini="", mistral=""):
    monkeypatch.setattr(settings, "GROQ_API_KEY", groq)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", gemini)
    monkeypatch.setattr(settings, "MISTRAL_API_KEY", mistral)


def _run_without_retry_delay(monkeypatch):
    monkeypatch.setattr(retry, "with_retry", lambda fn, **kwargs: fn())


def test_categorise_empty_text_returns_empty_metadata(monkeypatch):
    _configure(monkeypatch, groq="key", gemini="key", mistral="key")
    assert _metadata_tuple(categorisation_service.categorise_document("")) == (None, None, None, None)


def test_provider_precedence(monkeypatch):
    monkeypatch.setattr(categorisation_service, "_categorise_groq", lambda text: "groq")
    monkeypatch.setattr(categorisation_service, "_categorise_gemini", lambda text: "gemini")
    monkeypatch.setattr(categorisation_service, "_categorise_mistral", lambda text: "mistral")
    monkeypatch.setattr(categorisation_service, "_fallback_categorise", lambda text: "fallback")

    _configure(monkeypatch, groq="g", gemini="x", mistral="m")
    assert categorisation_service.categorise_document("text") == "groq"
    _configure(monkeypatch, gemini="x", mistral="m")
    assert categorisation_service.categorise_document("text") == "gemini"
    _configure(monkeypatch, mistral="m")
    assert categorisation_service.categorise_document("text") == "mistral"
    _configure(monkeypatch)
    assert categorisation_service.categorise_document("text") == "fallback"


@pytest.mark.parametrize(
    ("text", "brand", "document_type"),
    [
        ("Samsung appliance instruction booklet", "Samsung", "User Manual"),
        ("Your 24 month Philips guarantee", "Philips", "Warranty Card"),
        ("Bosch quick start steps", "Bosch", "Quick Start Guide"),
        ("Dyson product specification", "Dyson", "Specification Sheet"),
        ("ownership instructions", None, "User Manual"),
        ("unrecognised document", None, None),
    ],
)
def test_fallback_categorisation(text, brand, document_type):
    metadata = categorisation_service._fallback_categorise(text)
    assert metadata.brand == brand
    assert metadata.document_type == document_type


def test_fallback_empty_text():
    assert _metadata_tuple(categorisation_service._fallback_categorise("")) == (None, None, None, None)


def test_groq_returns_structured_metadata(monkeypatch):
    _configure(monkeypatch, groq="key")
    _run_without_retry_delay(monkeypatch)
    captured = {}
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=(
            '{"brand":"Dreo","model":"DR-1","document_type":"User Manual",'
            '"suggested_title":"Dreo DR-1 Manual"}'
        )))]
    )

    class Client:
        def __init__(self):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

        def create(self, **kwargs):
            captured.update(kwargs)
            return response

    monkeypatch.setattr(OpenAI, "__new__", lambda cls, **kwargs: Client())
    metadata = categorisation_service._categorise_groq("x" * 2500)

    assert _metadata_tuple(metadata) == ("Dreo", "DR-1", "User Manual", "Dreo DR-1 Manual")
    assert len(captured["messages"][1]["content"]) == 2000
    assert captured["temperature"] == 0


def test_groq_failure_uses_fallback(monkeypatch):
    _configure(monkeypatch, groq="key")
    _run_without_retry_delay(monkeypatch)

    class Client:
        chat = SimpleNamespace(
            completions=SimpleNamespace(create=lambda **kwargs: (_ for _ in ()).throw(RuntimeError("offline")))
        )

    monkeypatch.setattr(OpenAI, "__new__", lambda cls, **kwargs: Client())
    assert categorisation_service._categorise_groq("Apple warranty").brand == "Apple"


def test_gemini_returns_structured_metadata(monkeypatch):
    _configure(monkeypatch, gemini="key")
    _run_without_retry_delay(monkeypatch)
    captured = {}

    class Models:
        def generate_content(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(text=(
                '{"brand":"Sony","model":"A1","document_type":"Quick Start Guide",'
                '"suggested_title":"Sony A1 Setup"}'
            ))

    monkeypatch.setattr(genai, "Client", lambda **kwargs: SimpleNamespace(models=Models()))
    metadata = categorisation_service._categorise_gemini("setup")

    assert _metadata_tuple(metadata) == ("Sony", "A1", "Quick Start Guide", "Sony A1 Setup")
    assert captured["config"]["response_mime_type"] == "application/json"


def test_gemini_failure_uses_fallback(monkeypatch):
    _configure(monkeypatch, gemini="key")
    _run_without_retry_delay(monkeypatch)
    monkeypatch.setattr(genai, "Client", lambda **kwargs: (_ for _ in ()).throw(RuntimeError("offline")))
    assert categorisation_service._categorise_gemini("Canon manual").brand == "Canon"


def test_mistral_returns_structured_metadata(monkeypatch):
    _configure(monkeypatch, mistral="key")
    _run_without_retry_delay(monkeypatch)
    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [{"message": {"content": (
                    '{"brand":"Bosch","model":"B2","document_type":"Warranty Card",'
                    '"suggested_title":"Bosch B2 Warranty"}'
                )}}]
            }

    def post(url, **kwargs):
        captured.update(kwargs)
        return Response()

    monkeypatch.setattr(httpx, "post", post)
    metadata = categorisation_service._categorise_mistral("warranty")

    assert _metadata_tuple(metadata) == ("Bosch", "B2", "Warranty Card", "Bosch B2 Warranty")
    assert captured["headers"]["Authorization"] == "Bearer key"


def test_mistral_failure_uses_fallback(monkeypatch):
    _configure(monkeypatch, mistral="key")
    _run_without_retry_delay(monkeypatch)
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("offline")))
    assert categorisation_service._categorise_mistral("Ikea manual").brand == "Ikea"
