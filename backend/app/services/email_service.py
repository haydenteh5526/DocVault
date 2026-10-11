from app.config import settings


def send_verification_email(to_email: str, token: str) -> None:
    verify_url = f"{settings.FRONTEND_URL}/verify?token={token}"
    html = _build_html("Verify your email", "Click below to verify your DocVault account.", "Verify Email", verify_url)

    _send(to_email, "Verify your DocVault account", html, verify_url)


def send_2fa_setup_email(to_email: str) -> None:
    html = _build_html("2FA Enabled", "Two-factor authentication has been enabled on your account.", None, None)
    _send(to_email, "2FA enabled on your DocVault account", html)


def send_password_reset_email(to_email: str, token: str) -> None:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    html = _build_html(
        "Reset your password",
        "We received a request to reset your DocVault password. This link expires in 30 minutes. "
        "If you didn't request this, you can safely ignore this email.",
        "Reset Password",
        reset_url,
    )
    _send(to_email, "Reset your DocVault password", html, reset_url)


def _send(to_email: str, subject: str, html: str, fallback_url: str | None = None) -> None:
    from app.logging_config import get_logger
    logger = get_logger("email")

    if settings.RESEND_API_KEY:
        try:
            import resend

            from app.services.retry import with_retry
            resend.api_key = settings.RESEND_API_KEY
            with_retry(lambda: resend.Emails.send({
                "from": "DocVault <onboarding@resend.dev>",
                "to": [to_email],
                "subject": subject,
                "html": html,
            }), label="resend.send")
            logger.info("Sent email to %s", to_email)
            return
        except Exception as e:  # noqa: BLE001
            # Verification and reset URLs contain bearer tokens. A configured
            # production provider failing must never expose those URLs in logs.
            logger.warning("Resend failed (%s); email was not sent", type(e).__name__)
            return

    # Explicit development fallback only — this is intentionally unavailable
    # when a production email provider has been configured.
    logger.info("EMAIL (dev) to=%s subject=%r url=%s", to_email, subject, fallback_url or "-")


def _build_html(heading: str, message: str, button_text: str | None, button_url: str | None) -> str:
    button = ""
    if button_text and button_url:
        button = f'<a href="{button_url}" style="display:inline-block;background:linear-gradient(135deg,#5b21b6,#7c3aed);color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;">{button_text}</a>'
    return f"""
    <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
        <h2 style="margin-bottom:8px;">{heading}</h2>
        <p style="color:#666;margin-bottom:24px;">{message}</p>
        {button}
        <p style="color:#999;font-size:12px;margin-top:32px;">— DocVault Team</p>
    </div>
    """
