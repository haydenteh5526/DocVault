"""Expo push notifications.

`build_messages` is a pure function (unit-testable). `send_push` posts to the
Expo push API and degrades gracefully — any failure is logged, never raised,
so notification problems can't break the request or worker.
"""
from app.logging_config import get_logger
from app.services.retry import with_retry

logger = get_logger("push")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def build_messages(tokens: list[str], title: str, body: str, data: dict | None = None) -> list[dict]:
    """Build Expo push message payloads for a set of device tokens."""
    return [
        {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
            "data": data or {},
        }
        for token in tokens
        if token
    ]


def send_push(tokens: list[str], title: str, body: str, data: dict | None = None) -> int:
    """Send a push to the given Expo tokens. Returns the number of messages sent.

    Never raises — logs and returns 0 on failure so callers degrade gracefully.
    """
    messages = build_messages(tokens, title, body, data)
    if not messages:
        return 0
    try:
        import httpx

        def _post():
            resp = httpx.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={"Content-Type": "application/json"},
                timeout=15,
            )
            resp.raise_for_status()
            return resp

        with_retry(_post, label="expo.push")
        logger.info("Sent %d push notification(s)", len(messages))
        return len(messages)
    except Exception as e:  # noqa: BLE001 - notifications must never break callers
        logger.warning("Push send failed (%s); skipping", type(e).__name__)
        return 0
