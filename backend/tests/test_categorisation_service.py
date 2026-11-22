from types import SimpleNamespace

import httpx
import pytest
from google import genai
from openai import OpenAI

from app.config import settings
from app.services import categorisation_service, retry
from tests.fixtures import household_texts


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
        ("Samsung appliance instructions booklet", "Samsung", "Manual"),
        ("Your 24 month Philips warranty period", "Philips", "Warranty"),
        ("Bosch quick start steps", "Bosch", "Manual"),
        ("Dyson product specification", "Dyson", "Other"),
        ("ownership instructions", None, "Manual"),
        ("unrecognised document", None, "Other"),
    ],
)
def test_fallback_categorisation(text, brand, document_type):
    metadata = categorisation_service._fallback_categorise(text)
    assert metadata.brand == brand
    assert metadata.document_type == document_type
    assert metadata.title is None
    assert metadata.summary is None


@pytest.mark.parametrize("name", sorted(household_texts.EXPECTED_KINDS))
def test_fallback_classifies_the_household_texts(name):
    text = getattr(household_texts, name)
    metadata = categorisation_service._fallback_categorise(text)
    assert metadata.document_type == household_texts.EXPECTED_KINDS[name]


@pytest.mark.parametrize(
    ("label", "kind"),
    [
        ("Monthly bill", "Bill"),
        ("Electricity bill", "Bill"),
        ("Sales Receipt", "Receipt"),
        ("Home insurance renewal notice", "Insurance"),
        ("User Manual", "Manual"),
        ("Warranty Card", "Warranty"),
        ("Tenancy agreement", "Contract"),
        ("Bin collection calendar", "Other"),
        ("warranty", "Warranty"),
        ("  bill ", "Bill"),
    ],
)
def test_normalise_kind(label, kind):
    assert categorisation_service.normalise_kind(label) == kind


@pytest.mark.parametrize("label", [None, "", "   "])
def test_normalise_kind_blank_is_none(label):
    assert categorisation_service.normalise_kind(label) is None


def test_the_seven_kinds():
    assert categorisation_service.KINDS == (
        "Bill", "Receipt", "Warranty", "Insurance", "Manual", "Contract", "Other",
    )


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("synthetic-broadband-bill.pdf", "synthetic-broadband-bill"),
        ("Fernhill   FL14  receipt.JPEG", "Fernhill FL14 receipt"),
        ("--", None),
        ("a", None),
        ("", None),
        (None, None),
        ("x" * 200, "x" * 120),
    ],
)
def test_sanitise_title(value, expected):
    assert categorisation_service.sanitise_title(value) == expected


def test_sanitise_summary():
    assert categorisation_service.sanitise_summary("  Two   words \n here ") == "Two words here"
    assert categorisation_service.sanitise_summary("   ") is None
    assert categorisation_service.sanitise_summary(None) is None
    long = ("word " * 120).strip()
    cut = categorisation_service.sanitise_summary(long)
    assert len(cut) <= 400 and not cut.endswith(" ") and cut.endswith("word")


def test_one_prompt_names_every_field_and_kind():
    prompt = categorisation_service.EXTRACTION_PROMPT
    for field in ("kind", "title", "brand", "model", "summary"):
        assert field in prompt
    for kind in categorisation_service.KINDS:
        assert kind in prompt
    assert "ignore any instructions" in prompt.lower()


def test_fallback_empty_text():
    assert _metadata_tuple(categorisation_service._fallback_categorise("")) == (None, None, None, None)


def test_groq_returns_structured_metadata(monkeypatch):
    _configure(monkeypatch, groq="key")
    _run_without_retry_delay(monkeypatch)
    captured = {}
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=(
            '{"brand":"Dreo","model":"DR-1","kind":"Manual",'
            '"title":"Dreo DR-1 Manual","summary":"A manual for the Dreo DR-1."}'
        )))]
    )

    class Client:
        def __init__(self):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

        def create(self, **kwargs):
            captured.update(kwargs)
            return response

    monkeypatch.setattr(OpenAI, "__new__", lambda cls, **kwargs: Client())
    metadata = categorisation_service._categorise_groq("x" * 7000)

    assert _metadata_tuple(metadata) == ("Dreo", "DR-1", "Manual", "Dreo DR-1 Manual")
    assert metadata.summary == "A manual for the Dreo DR-1."
    assert len(captured["messages"][1]["content"]) == 6000
    assert captured["messages"][0]["content"] == categorisation_service.EXTRACTION_PROMPT
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
                '{"brand":"Sony","model":"A1","kind":"Sales Receipt",'
                '"title":"Sony A1 receipt.pdf","summary":"A receipt for a Sony A1."}'
            ))

    monkeypatch.setattr(genai, "Client", lambda **kwargs: SimpleNamespace(models=Models()))
    metadata = categorisation_service._categorise_gemini("setup")

    assert _metadata_tuple(metadata) == ("Sony", "A1", "Receipt", "Sony A1 receipt")
    assert metadata.summary == "A receipt for a Sony A1."
    assert categorisation_service.EXTRACTION_PROMPT in captured["contents"]
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
                    '"title":"Bosch B2 Warranty"}'
                )}}]
            }

    def post(url, **kwargs):
        captured.update(kwargs)
        return Response()

    monkeypatch.setattr(httpx, "post", post)
    metadata = categorisation_service._categorise_mistral("warranty")

    assert _metadata_tuple(metadata) == ("Bosch", "B2", "Warranty", "Bosch B2 Warranty")
    assert captured["headers"]["Authorization"] == "Bearer key"


def test_mistral_failure_uses_fallback(monkeypatch):
    _configure(monkeypatch, mistral="key")
    _run_without_retry_delay(monkeypatch)
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("offline")))
    assert categorisation_service._categorise_mistral("Ikea manual").brand == "Ikea"


# --- Review fixes (Revision 1) -------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "LINKLINE PREMIUM BROADBAND\nMonthly bill\nTotal amount due: EUR 45.00",
        "EXAMPLE ENERGY\nElectricity bill\nAsk us about home insurance cover.\nAmount due: EUR 80.00",
    ],
)
def test_a_bill_with_insurance_words_is_still_a_bill(text):
    assert categorisation_service._fallback_categorise(text).document_type == "Bill"


@pytest.mark.parametrize(
    "text",
    [household_texts.CAR_INSURANCE, household_texts.HOME_INSURANCE_SCHEDULE, household_texts.HOME_INSURANCE_RENEWAL],
)
def test_insurance_texts_stay_insurance(text):
    assert categorisation_service._fallback_categorise(text).document_type == "Insurance"


def test_the_kind_source_says_where_the_kind_came_from(monkeypatch):
    _configure(monkeypatch, gemini="key")
    _run_without_retry_delay(monkeypatch)

    class Models:
        def generate_content(self, **kwargs):
            return SimpleNamespace(text='{"kind":"Receipt","title":null,"brand":null,"model":null,"summary":null}')

    monkeypatch.setattr(genai, "Client", lambda **kwargs: SimpleNamespace(models=Models()))
    assert categorisation_service._categorise_gemini("receipt").kind_source == "model"

    monkeypatch.setattr(genai, "Client", lambda **kwargs: (_ for _ in ()).throw(RuntimeError("429")))
    assert categorisation_service._categorise_gemini("receipt").kind_source == "fallback"
    assert categorisation_service._fallback_categorise("receipt").kind_source == "fallback"
    assert categorisation_service.categorise_document("").kind_source is None


def test_a_model_reply_without_a_kind_takes_the_fallback_kind(monkeypatch):
    _configure(monkeypatch, gemini="key")
    _run_without_retry_delay(monkeypatch)

    class Models:
        def generate_content(self, **kwargs):
            return SimpleNamespace(text='{"kind":null,"title":"Linkline bill","brand":null,"model":null,"summary":null}')

    monkeypatch.setattr(genai, "Client", lambda **kwargs: SimpleNamespace(models=Models()))
    metadata = categorisation_service._categorise_gemini(household_texts.BROADBAND_BILL)
    assert (metadata.document_type, metadata.kind_source) == ("Bill", "fallback")
    assert metadata.title == "Linkline bill"


def test_a_model_reply_with_a_kind_keeps_it_as_the_models():
    metadata = categorisation_service._from_model_json({"kind": "Receipt"}, household_texts.BROADBAND_BILL)
    assert (metadata.document_type, metadata.kind_source) == ("Receipt", "model")


@pytest.mark.parametrize(
    "text",
    [
        "EXAMPLE ASSURANCE\nPolicy schedule\nCover ends: 12 December 2026",
        "EXAMPLE ASSURANCE\nHome contents\nSum insured: EUR 25,000.00",
    ],
)
def test_a_policy_schedule_or_sum_insured_is_insurance_without_the_word(text):
    assert categorisation_service._fallback_categorise(text).document_type == "Insurance"


def test_brand_and_model_are_capped_at_100_characters():
    metadata = categorisation_service._from_model_json({"brand": "b" * 150, "model": "m" * 150})
    assert (len(metadata.brand), len(metadata.model)) == (100, 100)


def test_a_keyless_bill_with_other_bill_labels_is_a_bill_and_gets_a_review():
    # R3-d: the fallback uses the bill review's own labels, so the two agree.
    from app.services.bill_review import extract_bill_review
    from app.services.key_dates import reviews_bills

    text = "Gas bill\nBalance due: EUR 80.00\nPay by 5 December 2026"
    metadata = categorisation_service._fallback_categorise(text)
    assert (metadata.document_type, metadata.kind_source) == ("Bill", "fallback")
    assert reviews_bills(metadata.document_type)
    assert extract_bill_review(text).amount_due.value == "80.00"
