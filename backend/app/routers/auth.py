import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user_id, get_db
from app.models.base import User
from app.rate_limit import limiter
from app.services.auth_service import (
    create_access_token,
    create_oauth_state,
    create_password_reset_token,
    create_refresh_token,
    decode_token_claims,
    hash_password,
    token_expiry,
    verify_oauth_state,
    verify_password,
    verify_password_reset_token,
)

router = APIRouter()


def _utcnow() -> datetime:
    """Naive UTC, matching how the users table stores timestamps."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


PASSWORD_RULES_MESSAGE = (
    "Use at least 8 characters with an uppercase letter, a lowercase letter, "
    "a number and a special character."
)


def check_password_rules(password: str) -> str:
    """The rules the sign-up checklist shows, enforced on the server (new passwords only)."""
    if not (
        8 <= len(password) <= 128
        and re.search(r"[A-Z]", password)
        and re.search(r"[a-z]", password)
        and re.search(r"[0-9]", password)
        and re.search(r"[^A-Za-z0-9]", password)
    ):
        raise ValueError(PASSWORD_RULES_MESSAGE)
    return password


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str | None = None

    @field_validator("password")
    @classmethod
    def password_follows_the_rules(cls, value: str) -> str:
        return check_password_rules(value)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_follows_the_rules(cls, value: str) -> str:
        return check_password_rules(value)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"


class RegisterResponse(BaseModel):
    message: str
    requires_verification: bool = True


@router.post("/register", response_model=RegisterResponse, status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Email already registered")

    token = secrets.token_urlsafe(32)

    user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
        display_name=req.display_name,
        verification_token=token,
        verification_sent_at=_utcnow(),
        is_verified=False,
    )
    db.add(user)
    await db.commit()

    # Send verification email
    from app.services.email_service import send_verification_email
    send_verification_email(req.email, token)

    return RegisterResponse(message="Verification email sent. Please check your inbox.")


@router.get("/verify")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.verification_token == token))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(400, "Invalid or expired verification link")
    sent_at = user.verification_sent_at
    if sent_at is None or _utcnow() - sent_at > timedelta(hours=settings.VERIFICATION_EXPIRY_HOURS):
        raise HTTPException(400, "This verification link has expired. Request a new one.")

    user.is_verified = True
    user.verification_token = None
    await db.commit()
    return {"message": "Email verified successfully. You can now sign in."}


# True whether or not a link went out: the server sends at most one a minute per account.
RESEND_VERIFICATION_MESSAGE = (
    "If that account still needs verifying, a new link is on its way. We send at most one a minute."
)


@router.post("/resend-verification")
@limiter.limit("3/minute")
async def resend_verification(
    request: Request,
    req: ResendVerificationRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Send a new verification link. The reply is the same whatever the account's state,
    so the endpoint cannot be used to learn which emails are registered or verified.

    The row is locked so two requests at once cannot both pass the cooldown and send two
    links, and the email goes out after the reply so its timing reveals nothing.
    """
    user = (
        await db.execute(select(User).where(User.email == req.email).with_for_update())
    ).scalar_one_or_none()
    generic = {"message": RESEND_VERIFICATION_MESSAGE}
    if not user or user.is_verified:
        return generic
    cooldown = timedelta(seconds=settings.VERIFICATION_RESEND_COOLDOWN_S)
    if user.verification_sent_at and _utcnow() - user.verification_sent_at < cooldown:
        return generic

    # A new link replaces the old one, so only the latest email works.
    user.verification_token = secrets.token_urlsafe(32)
    user.verification_sent_at = _utcnow()
    await db.commit()

    from app.services.email_service import send_verification_email
    background.add_task(send_verification_email, user.email, user.verification_token)
    return generic


class LoginResponse(BaseModel):
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    requires_2fa: bool = False


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password")

    if not user.is_verified:
        raise HTTPException(403, "Please verify your email before signing in")

    if user.totp_secret:
        # 2FA enabled — require TOTP code
        return LoginResponse(requires_2fa=True)

    return LoginResponse(
        access_token=create_access_token(user.id, user.token_version),
        refresh_token=create_refresh_token(user.id, req.remember_me, user.token_version),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a valid refresh token for a fresh access + refresh token pair.

    Refresh tokens are rotated on every use: the returned refresh token
    preserves the remaining lifetime of the presented one (we keep the same
    30-day window by decoding its expiry rather than resetting it).
    """
    claims = decode_token_claims(req.refresh_token, expected_type="refresh")
    if not claims:
        raise HTTPException(401, "Invalid or expired refresh token")
    user_id, version = claims

    # The account must still exist and the token must not predate a password reset.
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user or user.token_version != version:
        raise HTTPException(401, "Invalid or expired refresh token")

    # Preserve the original refresh window rather than extending a session
    # indefinitely.  The payload is verified before its expiry is read.
    from datetime import datetime, timezone

    expires_at = token_expiry(req.refresh_token)
    if not expires_at:
        raise HTTPException(401, "Invalid or expired refresh token")
    remaining_days = (expires_at - datetime.now(timezone.utc)).days
    remember = remaining_days > settings.REFRESH_TOKEN_EXPIRY_DAYS_SHORT

    return TokenResponse(
        access_token=create_access_token(user_id, user.token_version),
        refresh_token=create_refresh_token(user_id, remember_me=remember, version=user.token_version),
    )


class Verify2FARequest(BaseModel):
    email: EmailStr
    password: str
    code: str
    remember_me: bool = False


@router.post("/login/2fa", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login_2fa(request: Request, req: Verify2FARequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")

    if not user.is_verified:
        raise HTTPException(403, "Please verify your email before signing in")

    # An account without 2FA gets the same refusal as a wrong code, not a 500.
    import pyotp
    if not user.totp_secret or not pyotp.TOTP(user.totp_secret).verify(req.code, valid_window=1):
        raise HTTPException(401, "Invalid 2FA code")

    return TokenResponse(
        access_token=create_access_token(user.id, user.token_version),
        refresh_token=create_refresh_token(user.id, req.remember_me, user.token_version),
    )


@router.post("/2fa/setup")
async def setup_2fa(db: AsyncSession = Depends(get_db), user_id=Depends(get_current_user_id)):
    import base64
    import io

    import pyotp
    import qrcode

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()

    # The secret stays pending until the owner types a correct code
    # (POST /2fa/confirm), so an abandoned setup can never lock them out.
    secret = pyotp.random_base32()
    user.totp_pending_secret = secret
    await db.commit()

    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user.email, issuer_name="DocVault")

    # Generate QR code as base64
    qr = qrcode.make(uri)
    buf = io.BytesIO()
    qr.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return {"secret": secret, "qr_code": f"data:image/png;base64,{qr_b64}", "uri": uri}


class Confirm2FARequest(BaseModel):
    code: str


@router.post("/2fa/confirm")
async def confirm_2fa(
    req: Confirm2FARequest,
    db: AsyncSession = Depends(get_db),
    user_id=Depends(get_current_user_id),
):
    import pyotp

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()

    if not user.totp_pending_secret:
        raise HTTPException(409, "Start two-factor setup first.")

    if not pyotp.TOTP(user.totp_pending_secret).verify(req.code, valid_window=1):
        raise HTTPException(400, "That code didn't match. Check the time on your phone and try again.")

    user.totp_secret = user.totp_pending_secret
    user.totp_pending_secret = None
    await db.commit()
    return {"message": "Two-factor sign-in is on."}


@router.post("/2fa/disable")
async def disable_2fa(db: AsyncSession = Depends(get_db), user_id=Depends(get_current_user_id)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()
    user.totp_secret = None
    user.totp_pending_secret = None
    await db.commit()
    return {"message": "2FA disabled"}


@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Send a password reset link if the email belongs to an account.

    Always returns the same generic response so the endpoint cannot be used to
    enumerate which emails are registered.
    """
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    generic = {"message": "If an account exists for that email, a reset link has been sent."}
    if not user:
        return generic

    from app.services.email_service import send_password_reset_email
    token = create_password_reset_token(user.id, user.token_version)
    send_password_reset_email(user.email, token)
    return generic


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Reset a password using a valid, signed reset token from the email link.

    The token carries the account's `token_version`. Bumping it here makes the link single use
    and signs out every existing session.
    """
    claims = verify_password_reset_token(req.token)
    if not claims:
        raise HTTPException(400, "Invalid or expired reset link")
    user_id, version = claims

    user = (
        await db.execute(select(User).where(User.id == user_id).with_for_update())
    ).scalar_one_or_none()
    if not user or user.token_version != version:
        raise HTTPException(400, "Invalid or expired reset link")

    user.hashed_password = hash_password(req.new_password)
    user.token_version += 1
    await db.commit()
    return {"message": "Your password has been reset. You can now sign in."}


@router.get("/me")
async def get_profile(db: AsyncSession = Depends(get_db), user_id=Depends(get_current_user_id)):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    return {
        "email": user.email,
        "display_name": user.display_name,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None


@router.patch("/me")
async def update_profile(req: UpdateProfileRequest, db: AsyncSession = Depends(get_db), user_id=Depends(get_current_user_id)):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if req.display_name is not None:
        user.display_name = req.display_name
    await db.commit()
    return {"email": user.email, "display_name": user.display_name}


@router.delete("/account", status_code=204)
async def delete_account(
    db: AsyncSession = Depends(get_db),
    user_id=Depends(get_current_user_id),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        # Database cascades cannot remove objects from object storage. Delete the
        # entire user prefix first, including any orphaned upload objects.
        from app.services import storage_service

        storage_service.delete_user_files(str(user_id))
        await db.delete(user)
        await db.commit()


@router.get("/providers")
async def auth_providers():
    """Which optional sign-in methods this server can offer. Public: no session."""
    return {"google": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)}


@router.get("/oauth/google")
async def oauth_google_redirect():
    """Kick off Google OAuth: redirect the browser to Google's consent screen."""
    from urllib.parse import urlencode

    from fastapi.responses import RedirectResponse

    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(501, "Google OAuth is not configured")

    params = urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": create_oauth_state(),
        "access_type": "online",
        "prompt": "select_account",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/oauth/google/callback")
async def oauth_google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle Google's redirect: exchange the code, find/create the user, then
    redirect back to the frontend with freshly minted app tokens in the URL
    fragment (fragments are never sent to servers, keeping tokens out of logs).
    """
    import httpx
    from fastapi.responses import RedirectResponse

    frontend = settings.FRONTEND_URL.rstrip("/")

    def fail(reason: str) -> RedirectResponse:
        return RedirectResponse(f"{frontend}/auth/callback#error={reason}")

    if error or not code or not state:
        return fail("oauth_denied")
    if not verify_oauth_state(state):
        return fail("invalid_state")

    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            return fail("token_exchange_failed")
        google_access = token_resp.json().get("access_token")
        if not google_access:
            return fail("token_exchange_failed")

        userinfo_resp = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {google_access}"},
        )
        if userinfo_resp.status_code != 200:
            return fail("userinfo_failed")
        info = userinfo_resp.json()

    email = info.get("email")
    if not email or not info.get("email_verified", True):
        return fail("email_unverified")
    # Cut Google's name to the column's 100 characters so a long one cannot fail the sign-in.
    name = (info.get("name") or "")[:100] or None

    # Find existing account by email (links Google to an existing password
    # account) or create a new, already-verified account. The row is locked so a
    # concurrent password reset cannot interleave with the takeover lock-out below.
    result = await db.execute(select(User).where(User.email == email).with_for_update())
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            email=email,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            display_name=name,
            is_verified=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif not user.is_verified:
        # Google proved who owns the email, but not who chose the password: anyone
        # could have registered this address first. Replace that password and
        # revoke any earlier session so only the Google sign-in holds the account.
        # Also drop everything else the first registrant chose or started.
        user.is_verified = True
        user.hashed_password = hash_password(secrets.token_urlsafe(32))
        user.token_version += 1
        user.verification_token = None
        user.verification_sent_at = None
        user.totp_pending_secret = None
        user.display_name = name
        await db.commit()
        await db.refresh(user)

    access = create_access_token(user.id, user.token_version)
    refresh = create_refresh_token(user.id, remember_me=True, version=user.token_version)
    return RedirectResponse(
        f"{frontend}/auth/callback#access_token={access}&refresh_token={refresh}"
    )
