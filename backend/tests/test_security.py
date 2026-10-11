"""Tests for upload content validation and security response headers."""
import io

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from PIL import Image

from app.main import app
from app.routers.documents import _validate_file_content

BASE = "http://test"


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buf, format="PNG")
    return buf.getvalue()


# --- content validation (pure function, no DB/S3) --------------------------

def test_valid_png_passes():
    _validate_file_content(_png_bytes(), "image/png")  # should not raise


def test_valid_pdf_passes():
    _validate_file_content(b"%PDF-1.7\n...", "application/pdf")  # should not raise


def test_empty_file_rejected():
    with pytest.raises(HTTPException) as exc:
        _validate_file_content(b"", "image/png")
    assert exc.value.status_code == 400


def test_spoofed_image_rejected():
    # Declares image/png but the bytes are plain text.
    with pytest.raises(HTTPException) as exc:
        _validate_file_content(b"this is not an image", "image/png")
    assert exc.value.status_code == 400


def test_spoofed_pdf_rejected():
    with pytest.raises(HTTPException) as exc:
        _validate_file_content(b"not really a pdf", "application/pdf")
    assert exc.value.status_code == 400


# --- security headers ------------------------------------------------------

@pytest.mark.asyncio
async def test_security_headers_present():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        res = await c.get("/health")
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "max-age=" in res.headers.get("Strict-Transport-Security", "")
