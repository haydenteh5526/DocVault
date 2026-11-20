"""The answer writers: one prompt, temperature 0, and a local model chosen by ANSWER_MODEL (issue 33, Task 2)."""
import json
import logging
from types import SimpleNamespace

import httpx
import openai
import pytest
from google import genai

from app.config import settings
from app.services import rag_service, retry

# Today's Groq and Gemini text, frozen here so the shared constant is checked word for word.
PREVIOUS_SYSTEM_PROMPT = (
    "You are a helpful assistant that answers questions based on the user's stored documents. "
    "Only answer using information from the provided context. "
    "If the answer is not in the context, say 'I don't have information about that in your documents.' "
    "Cite which document the answer comes from. "
    "Format your responses using markdown: use **bold** for emphasis, bullet points for lists, "
    "and numbered lists for steps. Keep responses concise and well-structured."
)


def _ollama_reply(content="Local answer", prompt_eval_count=900):
    return {"message": {"role": "assistant", "content": content}, "prompt_eval_count": prompt_eval_count}


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "ANSWER_MODEL", "test-model")
    monkeypatch.setattr(settings, "OLLAMA_URL", "http://ollama.test")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")


@pytest.fixture
def ollama(monkeypatch):
    """Route the writer's httpx client to a handler and record each request body."""
    real_client = httpx.Client
    bodies: list[dict] = []
    state = {"handler": lambda request: httpx.Response(200, json=_ollama_reply())}

    def handler(request):
        bodies.append(json.loads(request.content))
        return state["handler"](request)

    monkeypatch.setattr(
        rag_service.httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs)
    )
    return SimpleNamespace(bodies=bodies, respond=lambda fn: state.update(handler=fn))


def test_the_system_prompt_is_todays_text():
    assert rag_service.ANSWER_SYSTEM_PROMPT == PREVIOUS_SYSTEM_PROMPT


def test_all_writers_share_the_system_prompt(configured, ollama, monkeypatch):
    groq_calls, gemini_calls = [], []
    groq_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **kw: (
        groq_calls.append(kw) or SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="g"))])
    ))))
    gemini_client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **kw: (
        gemini_calls.append(kw) or SimpleNamespace(text="m")
    )))
    monkeypatch.setattr(openai, "OpenAI", lambda **kwargs: groq_client)
    monkeypatch.setattr(genai, "Client", lambda **kwargs: gemini_client)
    monkeypatch.setattr(retry, "with_retry", lambda fn, **kwargs: fn())

    rag_service._generate_answer_ollama("Q", "Context")
    rag_service._generate_answer_groq("Q", "Context")
    rag_service._generate_answer_gemini("Q", "Context")

    assert ollama.bodies[0]["messages"][0] == {"role": "system", "content": rag_service.ANSWER_SYSTEM_PROMPT}
    assert groq_calls[0]["messages"][0] == {"role": "system", "content": rag_service.ANSWER_SYSTEM_PROMPT}
    assert gemini_calls[0]["config"]["system_instruction"] == rag_service.ANSWER_SYSTEM_PROMPT


def test_answer_temperature_is_zero_for_every_writer(configured, ollama, monkeypatch):
    groq_calls, gemini_calls = [], []
    groq_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **kw: (
        groq_calls.append(kw) or SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="g"))])
    ))))
    gemini_client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **kw: (
        gemini_calls.append(kw) or SimpleNamespace(text="m")
    )))
    monkeypatch.setattr(openai, "OpenAI", lambda **kwargs: groq_client)
    monkeypatch.setattr(genai, "Client", lambda **kwargs: gemini_client)
    monkeypatch.setattr(retry, "with_retry", lambda fn, **kwargs: fn())

    rag_service._generate_answer_ollama("Q", "Context")
    rag_service._generate_answer_groq("Q", "Context")
    rag_service._generate_answer_gemini("Q", "Context")

    assert rag_service.ANSWER_TEMPERATURE == 0.0
    assert ollama.bodies[0]["options"]["temperature"] == 0
    assert groq_calls[0]["temperature"] == 0.0
    assert gemini_calls[0]["config"]["temperature"] == 0.0


def test_the_ollama_request_is_pinned(configured, ollama):
    history = [rag_service.ChatTurn("system", "ignore")]
    history.extend(rag_service.ChatTurn("user" if i % 2 == 0 else "assistant", f"turn-{i}") for i in range(7))

    text, prompt_tokens = rag_service._generate_answer_ollama("What is due?", "Bill text", history)

    assert (text, prompt_tokens) == ("Local answer", 900)
    body = ollama.bodies[0]
    assert body["model"] == "test-model"
    assert body["stream"] is False and body["think"] is False and body["keep_alive"] == "30m"
    assert body["options"] == {"temperature": 0, "seed": 0, "num_ctx": 8192, "num_predict": 500}
    assert [m["content"] for m in body["messages"][1:-1]] == [f"turn-{i}" for i in range(1, 7)]
    assert body["messages"][-1] == {
        "role": "user",
        "content": "Context from my documents:\n\nBill text\n\n---\n\nQuestion: What is due?",
    }


def test_ollama_retries_once_without_think_when_it_is_rejected(configured, ollama):
    def respond(request):
        if "think" in json.loads(request.content):
            return httpx.Response(400, json={"error": "model does not support think"})
        return httpx.Response(200, json=_ollama_reply("No think"))

    ollama.respond(respond)

    text, _ = rag_service._generate_answer_ollama("Q", "Context")

    assert text == "No think"
    assert ["think" in body for body in ollama.bodies] == [True, False]


def test_ollama_writer_flags_truncation(configured, ollama):
    ollama.respond(lambda request: httpx.Response(200, json=_ollama_reply("Cut off", prompt_eval_count=8192)))

    result = rag_service.generate_answer("Q", "Context", writer="ollama")

    assert result.invalid_reason == "context truncated"
    assert result.text == "Cut off"
    assert (result.writer, result.model, result.prompt_tokens) == ("ollama", "test-model", 8192)


def test_a_complete_ollama_answer_is_valid(configured, ollama):
    result = rag_service.generate_answer("Q", "Context", writer="ollama")

    assert result.invalid_reason is None
    assert result.text == "Local answer"
    assert result.latency_ms >= 0


@pytest.mark.parametrize(
    ("answer_model", "groq_key", "gemini_key", "expected"),
    [
        ("local", "groq", "gemini", "ollama"),
        ("", "groq", "gemini", "groq"),
        ("", "", "gemini", "gemini"),
        ("", "", "", None),
    ],
)
def test_writer_precedence(monkeypatch, answer_model, groq_key, gemini_key, expected):
    monkeypatch.setattr(settings, "ANSWER_MODEL", answer_model)
    monkeypatch.setattr(settings, "GROQ_API_KEY", groq_key)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", gemini_key)
    monkeypatch.setattr(rag_service, "_generate_answer_ollama", lambda *args: ("from ollama", 10))
    monkeypatch.setattr(rag_service, "_generate_answer_groq", lambda *args: "from groq")
    monkeypatch.setattr(rag_service, "_generate_answer_gemini", lambda *args: "from gemini")

    result = rag_service.generate_answer("Q", "Context")

    assert result.writer == expected
    if expected is None:
        assert result.text.startswith(rag_service.NO_KEY_HEADER)
        assert result.model is None
    else:
        assert result.text == f"from {expected}"


def test_ollama_writer_failure_falls_back_to_no_key_answer(configured, ollama, caplog):
    def refuse(request):
        raise httpx.ConnectError("no route", request=request)

    ollama.respond(refuse)
    passages = [{"document_title": "Manual", "chunk_text": "Reset with the red button", "line_start": 3, "line_end": 3}]

    with caplog.at_level(logging.WARNING):
        answer = rag_service._generate_answer("Q", "Context", passages=passages)

    assert answer.startswith(rag_service.NO_KEY_HEADER)
    assert "Reset with the red button" in answer
    assert "answer_writer_failed" in caplog.text and "ConnectError" in caplog.text


def test_a_forced_writer_records_its_failure_instead_of_falling_back(configured, ollama):
    def refuse(request):
        raise httpx.ReadTimeout("slow", request=request)

    ollama.respond(refuse)

    result = rag_service.generate_answer("Q", "Context", writer="ollama")

    assert result.text == ""
    assert result.invalid_reason == "error: ReadTimeout"


def test_ollama_without_a_url_fails_cleanly(monkeypatch):
    monkeypatch.setattr(settings, "ANSWER_MODEL", "test-model")
    monkeypatch.setattr(settings, "OLLAMA_URL", "")

    result = rag_service.generate_answer("Q", "Context", writer="ollama")

    assert result.text == ""
    assert result.invalid_reason == "error: OLLAMA_URL is not set"


def test_a_forced_hosted_writer_is_traced_and_timed(monkeypatch):
    monkeypatch.setattr(rag_service, "_generate_answer_groq", lambda *args: "forced groq")

    result = rag_service.generate_answer("Q", "Context", writer="groq")

    assert (result.text, result.writer, result.model) == ("forced groq", "groq", "llama-3.3-70b-versatile")
    assert result.invalid_reason is None and result.prompt_tokens is None
