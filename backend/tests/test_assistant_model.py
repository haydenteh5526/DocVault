"""The local model selector: what it is sent, how replies are checked, and how failures fall back."""
import json

import httpx
import pytest

from app.config import settings
from app.schemas.assistant import TOOLS, Selection
from app.services.assistant.model import (
    SELECTOR_OPTIONS,
    SelectorInput,
    build_selector_request,
    parse_selection,
    select_by_model,
)


def _input(**overrides):
    values = {
        "question": "When is this due?",
        "history": [("user", "How much is the October bill?"), ("assistant", "[bill_facts for bill-1]")],
        "bills": [("bill-1", "October electricity bill")],
        "focus_ref": "bill-1",
        "housemates": ["Aoife", "Ben"],
    }
    return SelectorInput(**{**values, **overrides})


def _call(name, arguments):
    return {"function": {"name": name, "arguments": arguments}}


def _reply(*calls):
    return {"message": {"role": "assistant", "content": "", "tool_calls": list(calls)}}


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_MODEL", "test-model")
    monkeypatch.setattr(settings, "OLLAMA_URL", "http://ollama.test")


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def _select(body, status=200):
    def handler(request):
        return httpx.Response(status, json=body)

    async with _client(handler) as client:
        return await select_by_model(_input(), client)


@pytest.mark.asyncio
async def test_the_request_holds_only_the_allowed_inputs(configured):
    captured = []

    def handler(request):
        captured.append(request)
        return httpx.Response(200, json=_reply(_call("get_bill_facts", {})))

    async with _client(handler) as client:
        await select_by_model(_input(), client)
    assert str(captured[0].url) == "http://ollama.test/api/chat"
    body = json.loads(captured[0].content)
    assert body["model"] == "test-model"
    assert body["stream"] is False and body["think"] is False and body["keep_alive"] == "30m"
    assert body["options"] == SELECTOR_OPTIONS
    assert [tool["function"]["name"] for tool in body["tools"]] == list(TOOLS)
    text = json.dumps(body)
    for allowed in ("bill-1", "October electricity bill", "Aoife", "Ben", "How much is the October bill?"):
        assert allowed in text
    assert "[bill_facts for bill-1]" in text
    for forbidden in ("Total amount due", "EUR 123.47", "Standing charge"):
        assert forbidden not in text


def test_the_request_keeps_at_most_six_history_items():
    history = [("user", f"message {n}") for n in range(9)]
    request = build_selector_request("m", _input(history=history))
    text = json.dumps(request)
    assert "message 2" not in text and "message 3" in text and "message 8" in text


@pytest.mark.asyncio
async def test_a_single_valid_call_is_parsed(configured):
    selection, reason = await _select(_reply(_call("propose_reminder", {"days_before_due": 2, "document_ref": "bill-1"})))
    assert reason is None
    assert selection == Selection(tool="propose_reminder", days_before_due=2, document_ref="bill-1")
    selection, reason = await _select(_reply(_call("propose_reminder", '{"days_before_due": 2}')))
    assert reason is None and selection.days_before_due == 2


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body, expected",
    [
        ({"message": {"role": "assistant", "content": "I think so"}}, "no tool call"),
        (_reply(_call("get_bill_facts", {}), _call("split_bill", {})), "multiple tool calls"),
        (_reply(_call("pay_bill", {})), "unknown tool"),
        (_reply(_call("get_bill_facts", "{not json")), "arguments not valid JSON"),
        (_reply(_call("propose_reminder", {"days_before_due": "2"})), "invalid arguments"),
        (_reply(_call("propose_reminder", {"days_before_due": 99})), "invalid arguments"),
        (_reply(_call("get_bill_facts", {"when": "tomorrow"})), "invalid arguments"),
        (_reply(_call("decline", {})), "invalid arguments"),
        (_reply(_call("split_bill", {"people": [f"P{n}" for n in range(13)]})), "invalid arguments"),
        (_reply(_call("get_bill_facts", {"tool": "decline"})), "invalid arguments"),
        ({"message": None}, "no reply"),
        ({}, "no reply"),
    ],
)
async def test_invalid_replies_give_a_reason(configured, body, expected):
    assert await _select(body) == (None, expected)


def test_parse_selection_never_raises_on_odd_input():
    assert parse_selection(None) == (None, "no reply")
    assert parse_selection({"tool_calls": "nope"})[0] is None
    assert parse_selection({"tool_calls": [None]})[0] is None
    assert parse_selection({"tool_calls": [{"function": {"name": "decline", "arguments": [1]}}]})[0] is None


@pytest.mark.asyncio
async def test_a_reference_the_owner_does_not_have_is_kept_for_the_server_to_refuse(configured):
    selection, reason = await _select(_reply(_call("get_bill_facts", {"document_ref": "bill-7"})))
    assert reason is None and selection.document_ref == "bill-7"


@pytest.mark.asyncio
async def test_no_model_timeout_and_errors_fall_back(monkeypatch, configured):
    calls = []

    def handler(request):
        calls.append(request)
        raise AssertionError("no request expected")

    monkeypatch.setattr(settings, "ASSISTANT_MODEL", "")
    async with _client(handler) as client:
        assert await select_by_model(_input(), client) == (None, "no model configured")
    assert calls == []

    monkeypatch.setattr(settings, "ASSISTANT_MODEL", "test-model")
    monkeypatch.setattr(settings, "OLLAMA_URL", "")
    async with _client(handler) as client:
        assert await select_by_model(_input(), client) == (None, "no model configured")

    monkeypatch.setattr(settings, "OLLAMA_URL", "http://ollama.test")
    for error, expected in (
        (httpx.ReadTimeout("slow"), "timeout"),
        (httpx.ConnectError("refused"), "error: ConnectError"),
    ):

        def failing(request, error=error):
            raise error

        async with _client(failing) as client:
            assert await select_by_model(_input(), client) == (None, expected)

    assert await _select({"error": "boom"}, status=500) == (None, "error: HTTPStatusError")
    assert await _select("not an object", status=200) == (None, "no reply")


@pytest.mark.asyncio
async def test_an_unreadable_body_falls_back(configured):
    def handler(request):
        return httpx.Response(200, content=b"<html>")

    async with _client(handler) as client:
        selection, reason = await select_by_model(_input(), client)
    assert selection is None and reason.startswith("error: ")
