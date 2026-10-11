"""Unit tests for auth_service token helpers (pure, no DB)."""
import uuid

from app.services.auth_service import (
    create_access_token,
    create_oauth_state,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    hash_password,
    token_expiry,
    verify_oauth_state,
    verify_password,
    verify_password_reset_token,
)


def test_access_token_roundtrip():
    uid = uuid.uuid4()
    token = create_access_token(uid)
    assert decode_token(token) == uid


def test_refresh_token_type_isolation():
    uid = uuid.uuid4()
    refresh = create_refresh_token(uid, remember_me=True)
    # A refresh token must not authenticate as an access token
    assert decode_token(refresh) is None
    assert decode_token(refresh, expected_type="refresh") == uid


def test_access_token_not_valid_as_refresh():
    uid = uuid.uuid4()
    access = create_access_token(uid)
    assert decode_token(access, expected_type="refresh") is None


def test_decode_garbage_returns_none():
    assert decode_token("not-a-token") is None
    assert decode_token("") is None


def test_token_expiry_only_reads_verified_tokens():
    token = create_access_token(uuid.uuid4())
    assert token_expiry(token) is not None
    assert token_expiry("not-a-token") is None


def test_password_reset_token_roundtrip():
    uid = uuid.uuid4()
    token = create_password_reset_token(uid)
    assert verify_password_reset_token(token) == uid


def test_password_reset_rejects_other_token_types():
    uid = uuid.uuid4()
    assert verify_password_reset_token(create_access_token(uid)) is None
    assert verify_password_reset_token("garbage") is None


def test_oauth_state_roundtrip():
    state = create_oauth_state()
    assert verify_oauth_state(state) is True
    assert verify_oauth_state("garbage") is False


def test_password_hashing():
    hashed = hash_password("s3cret-password")
    assert hashed != "s3cret-password"
    assert verify_password("s3cret-password", hashed) is True
    assert verify_password("wrong", hashed) is False
