"""Unit tests for the Expo push service — pure payload logic, no network."""
from app.services import push_service


def test_build_messages_shape():
    msgs = push_service.build_messages(["ExponentPushToken[abc]"], "Title", "Body", {"k": "v"})
    assert len(msgs) == 1
    m = msgs[0]
    assert m["to"] == "ExponentPushToken[abc]"
    assert m["title"] == "Title"
    assert m["body"] == "Body"
    assert m["sound"] == "default"
    assert m["data"] == {"k": "v"}


def test_build_messages_multiple_tokens():
    msgs = push_service.build_messages(["a", "b", "c"], "T", "B")
    assert len(msgs) == 3
    assert {m["to"] for m in msgs} == {"a", "b", "c"}


def test_build_messages_filters_empty_tokens():
    msgs = push_service.build_messages(["a", "", None], "T", "B")  # type: ignore[list-item]
    assert len(msgs) == 1


def test_build_messages_defaults_data_to_empty_dict():
    msgs = push_service.build_messages(["a"], "T", "B")
    assert msgs[0]["data"] == {}


def test_send_push_no_tokens_returns_zero():
    assert push_service.send_push([], "T", "B") == 0


def test_send_push_posts_messages_and_returns_count(monkeypatch):
    import httpx

    requests = []

    def fake_post(url, **kwargs):
        requests.append((url, kwargs))
        return httpx.Response(200, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setattr(push_service, "with_retry", lambda operation, label: operation())

    sent = push_service.send_push(["token-a", "token-b"], "Title", "Body", {"document_id": "123"})

    assert sent == 2
    assert requests == [(
        push_service.EXPO_PUSH_URL,
        {
            "json": [
                {
                    "to": "token-a",
                    "title": "Title",
                    "body": "Body",
                    "sound": "default",
                    "data": {"document_id": "123"},
                },
                {
                    "to": "token-b",
                    "title": "Title",
                    "body": "Body",
                    "sound": "default",
                    "data": {"document_id": "123"},
                },
            ],
            "headers": {"Content-Type": "application/json"},
            "timeout": 15,
        },
    )]


def test_send_push_swallows_errors(monkeypatch):
    # Force httpx.post to raise — send_push must return 0, never raise
    import httpx

    def boom(*a, **k):
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(httpx, "post", boom)
    # with_retry will retry then give up; send_push swallows the final error
    monkeypatch.setattr("time.sleep", lambda _: None)
    assert push_service.send_push(["ExponentPushToken[x]"], "T", "B") == 0
