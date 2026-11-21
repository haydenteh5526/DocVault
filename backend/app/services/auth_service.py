import uuid
from datetime import datetime, timedelta, timezone

import jwt
from jwt import InvalidTokenError
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: uuid.UUID, version: int = 0) -> str:
    """`version` is the account's `token_version`; a password reset bumps it and every older token stops working."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRY_MINUTES)
    payload = {"sub": str(user_id), "exp": expire, "type": "access", "ver": version}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def create_refresh_token(user_id: uuid.UUID, remember_me: bool = False, version: int = 0) -> str:
    days = (
        settings.REFRESH_TOKEN_EXPIRY_DAYS
        if remember_me
        else settings.REFRESH_TOKEN_EXPIRY_DAYS_SHORT
    )
    expire = datetime.now(timezone.utc) + timedelta(days=days)
    payload = {"sub": str(user_id), "exp": expire, "type": "refresh", "ver": version}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def decode_token_claims(token: str, expected_type: str = "access") -> tuple[uuid.UUID, int] | None:
    """Return the token's user id and version, or ``None`` if it is invalid or the wrong type.

    Tokens minted before typing existed have no "type" claim and count as access tokens.
    Tokens minted before versioning existed have no "ver" claim and count as version 0.
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        if payload.get("type", "access") != expected_type:
            return None
        version = payload.get("ver", 0)
        if not isinstance(version, int) or isinstance(version, bool):
            return None
        return uuid.UUID(payload["sub"]), version
    except (InvalidTokenError, ValueError, KeyError, TypeError):
        return None


def decode_token(token: str, expected_type: str = "access") -> uuid.UUID | None:
    claims = decode_token_claims(token, expected_type)
    return claims[0] if claims else None


def create_oauth_state() -> str:
    """Short-lived signed token used as the OAuth `state` param (CSRF guard)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {"exp": expire, "type": "oauth_state"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_oauth_state(state: str) -> bool:
    try:
        payload = jwt.decode(state, settings.JWT_SECRET, algorithms=["HS256"])
        return payload.get("type") == "oauth_state"
    except InvalidTokenError:
        return False


def create_password_reset_token(user_id: uuid.UUID, version: int) -> str:
    """Signed, short-lived (30 min) token emailed to the user to reset a password.

    It carries the account's `token_version`. A successful reset bumps that version, so the link works once.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=30)
    payload = {"sub": str(user_id), "exp": expire, "type": "password_reset", "ver": version}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_password_reset_token(token: str) -> tuple[uuid.UUID, int] | None:
    """Return the reset token's user id and version. A token without a version is refused."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        if payload.get("type") != "password_reset":
            return None
        version = payload["ver"]
        if not isinstance(version, int) or isinstance(version, bool):
            return None
        return uuid.UUID(payload["sub"]), version
    except (InvalidTokenError, ValueError, KeyError, TypeError):
        return None


def token_expiry(token: str) -> datetime | None:
    """Return a verified token's expiry, or ``None`` if it is invalid."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    except (InvalidTokenError, KeyError, TypeError, ValueError):
        return None
