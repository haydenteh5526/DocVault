"""Email delivery tests, including provider failure and safe development fallback."""

from app.services import email_service


class _Logger:
    def __init__(self):
        self.info_calls = []
        self.warning_calls = []

    def info(self, *args):
        self.info_calls.append(args)

    def warning(self, *args):
        self.warning_calls.append(args)


def test_verification_email_builds_frontend_link(monkeypatch):
    calls = []
    monkeypatch.setattr(email_service.settings, "FRONTEND_URL", "https://app.test")
    monkeypatch.setattr(email_service, "_send", lambda *args: calls.append(args))

    email_service.send_verification_email("person@example.com", "verify-token")

    [call] = calls
    assert call[0:2] == ("person@example.com", "Verify your DocVault account")
    assert "Verify your email" in call[2]
    assert 'href="https://app.test/verify?token=verify-token"' in call[2]
    assert call[3] == "https://app.test/verify?token=verify-token"


def test_password_reset_email_builds_expiring_link(monkeypatch):
    calls = []
    monkeypatch.setattr(email_service.settings, "FRONTEND_URL", "https://app.test")
    monkeypatch.setattr(email_service, "_send", lambda *args: calls.append(args))

    email_service.send_password_reset_email("person@example.com", "reset-token")

    [call] = calls
    assert call[0:2] == ("person@example.com", "Reset your DocVault password")
    assert "expires in 30 minutes" in call[2]
    assert 'href="https://app.test/reset-password?token=reset-token"' in call[2]
    assert call[3] == "https://app.test/reset-password?token=reset-token"


def test_2fa_email_has_no_action_link(monkeypatch):
    calls = []
    monkeypatch.setattr(email_service, "_send", lambda *args: calls.append(args))

    email_service.send_2fa_setup_email("person@example.com")

    assert calls == [(
        "person@example.com",
        "2FA enabled on your DocVault account",
        calls[0][2],
    )]
    assert "2FA Enabled" in calls[0][2]
    assert "<a " not in calls[0][2]


def test_development_fallback_logs_action_url(monkeypatch):
    logger = _Logger()
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "")
    monkeypatch.setattr("app.logging_config.get_logger", lambda name: logger)

    email_service._send("person@example.com", "Subject", "<p>body</p>", "https://app.test/action")

    assert logger.warning_calls == []
    assert logger.info_calls == [(
        "EMAIL (dev) to=%s subject=%r url=%s",
        "person@example.com",
        "Subject",
        "https://app.test/action",
    )]


def test_resend_success_sends_expected_payload(monkeypatch):
    import resend

    logger = _Logger()
    payloads = []
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "provider-key")
    monkeypatch.setattr("app.logging_config.get_logger", lambda name: logger)
    monkeypatch.setattr(resend, "api_key", None)
    monkeypatch.setattr(resend.Emails, "send", lambda payload: payloads.append(payload))
    monkeypatch.setattr("app.services.retry.with_retry", lambda operation, label: operation())

    email_service._send("person@example.com", "Subject", "<p>body</p>", "secret-url")

    assert resend.api_key == "provider-key"
    assert payloads == [{
        "from": "DocVault <onboarding@resend.dev>",
        "to": ["person@example.com"],
        "subject": "Subject",
        "html": "<p>body</p>",
    }]
    assert logger.warning_calls == []
    assert logger.info_calls == [("Sent email to %s", "person@example.com")]


def test_resend_failure_does_not_log_bearer_url(monkeypatch):
    logger = _Logger()
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "provider-key")
    monkeypatch.setattr("app.logging_config.get_logger", lambda name: logger)

    def fail(operation, label):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr("app.services.retry.with_retry", fail)

    email_service._send("person@example.com", "Subject", "<p>body</p>", "secret-token-url")

    assert logger.warning_calls == [("Resend failed (%s); email was not sent", "RuntimeError")]
    assert logger.info_calls == []
    assert "secret-token-url" not in repr(logger.warning_calls)
