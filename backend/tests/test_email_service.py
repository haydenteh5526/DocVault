"""Email delivery tests, including provider failure and safe development fallback."""

from unittest.mock import MagicMock

import pytest

from app.services import email_service


@pytest.fixture(autouse=True)
def _email_settings(monkeypatch):
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "")
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "")
    monkeypatch.setattr(email_service.settings, "SMTP_USER", "")


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
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "unused-smtp")
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


@pytest.mark.parametrize("starttls,username", [(False, ""), (True, "sender")])
def test_smtp_sends_text_and_html_with_optional_tls_and_login(monkeypatch, starttls, username):
    logger = _Logger()
    connection = MagicMock()
    smtp = connection.return_value.__enter__.return_value
    monkeypatch.setattr(email_service.smtplib, "SMTP", connection)
    monkeypatch.setattr("app.logging_config.get_logger", lambda name: logger)
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "mail.test")
    monkeypatch.setattr(email_service.settings, "SMTP_PORT", 1025)
    monkeypatch.setattr(email_service.settings, "SMTP_FROM", "sender@example.com")
    monkeypatch.setattr(email_service.settings, "SMTP_STARTTLS", starttls)
    monkeypatch.setattr(email_service.settings, "SMTP_USER", username)
    monkeypatch.setattr(email_service.settings, "SMTP_PASS", "smtp-password")

    email_service._send("person@example.com", "Reset password", "<a>Reset</a>", "https://app.test/reset")

    connection.assert_called_once_with("mail.test", 1025, timeout=10)
    if starttls:
        smtp.starttls.assert_called_once()
    else:
        smtp.starttls.assert_not_called()
    if username:
        smtp.login.assert_called_once_with(username, "smtp-password")
        assert [call[0] for call in smtp.method_calls] == ["starttls", "login", "send_message"]
    else:
        smtp.login.assert_not_called()
    [message] = smtp.send_message.call_args.args
    assert message["From"] == "sender@example.com"
    assert message["To"] == "person@example.com"
    assert message["Subject"] == "Reset password"
    assert "https://app.test/reset" in message.get_body(preferencelist=("plain",)).get_content()
    assert message.get_body(preferencelist=("html",)).get_content().strip() == "<a>Reset</a>"
    assert logger.info_calls == [("Sent email to %s via SMTP", "person@example.com")]
    assert logger.warning_calls == []


def test_smtp_failure_does_not_log_bearer_url_or_credentials(monkeypatch):
    logger = _Logger()
    connection = MagicMock()
    connection.return_value.__enter__.return_value.send_message.side_effect = RuntimeError("secret-token-url")
    monkeypatch.setattr(email_service.smtplib, "SMTP", connection)
    monkeypatch.setattr("app.logging_config.get_logger", lambda name: logger)
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "mail.test")

    email_service._send("person@example.com", "Subject", "<p>body</p>", "secret-token-url")

    assert logger.warning_calls == [("SMTP failed (%s); email was not sent", "RuntimeError")]
    assert logger.info_calls == []
    assert "secret-token-url" not in repr(logger.warning_calls)
