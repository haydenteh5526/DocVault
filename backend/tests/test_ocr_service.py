from types import SimpleNamespace

import boto3
import httpx
import pdf2image

from app.config import settings
from app.services import ocr_service


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def test_mistral_dispatches_pdf_and_image(monkeypatch):
    backend = ocr_service.MistralBackend()
    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "test-key")
    monkeypatch.setattr(backend, "_ocr_pdf", lambda encoded, headers, size: f"pdf:{encoded}:{size}:{headers['Authorization']}")
    monkeypatch.setattr(
        backend,
        "_ocr_image",
        lambda encoded, mime, headers, size: f"image:{mime}:{encoded}:{size}:{headers['Authorization']}",
    )

    assert backend.extract_text(b"pdf", "application/pdf") == "pdf:cGRm:3:Bearer test-key"
    assert backend.extract_text(b"img", "") == "pdf:aW1n:3:Bearer test-key"
    assert backend.extract_text(b"img", "image/png") == "image:image/png:aW1n:3:Bearer test-key"


def test_mistral_pdf_collects_markdown_pages(monkeypatch):
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return _Response({"pages": [{"markdown": " Page one "}, {"markdown": "Page two"}]})

    monkeypatch.setattr(httpx, "post", post)
    result = ocr_service.MistralBackend()._ocr_pdf("encoded", {"Authorization": "Bearer key"}, 12)

    assert result == "Page one \n\nPage two"
    assert calls[0][0].endswith("/v1/ocr")
    assert calls[0][1]["json"]["document"]["type"] == "document_url"
    assert calls[0][1]["timeout"] == 180


def test_mistral_image_collects_markdown_pages(monkeypatch):
    calls = []

    def post(url, **kwargs):
        calls.append(kwargs)
        return _Response({"pages": [{"markdown": "Image text"}]})

    monkeypatch.setattr(httpx, "post", post)
    result = ocr_service.MistralBackend()._ocr_image("encoded", "image/webp", {}, 9)

    assert result == "Image text"
    assert calls[0]["json"]["document"] == {
        "type": "image_url",
        "image_url": "data:image/webp;base64,encoded",
    }
    assert calls[0]["timeout"] == 120


def test_tesseract_handles_images_and_pdfs(monkeypatch):
    opened = object()
    monkeypatch.setattr(ocr_service.Image, "open", lambda stream: opened)
    monkeypatch.setattr(ocr_service.pytesseract, "image_to_string", lambda image: f" text-{id(image)} ")

    image_result = ocr_service.TesseractBackend().extract_text(b"image", "image/png")
    assert image_result == f"text-{id(opened)}"

    pages = [object(), object(), object()]
    monkeypatch.setattr(pdf2image, "convert_from_bytes", lambda value: pages)
    responses = iter([" first ", "  ", "third"])
    monkeypatch.setattr(ocr_service.pytesseract, "image_to_string", lambda page: next(responses))
    assert ocr_service.TesseractBackend().extract_text(b"pdf", "application/pdf") == "first\n\nthird"


def test_textract_returns_only_line_blocks(monkeypatch):
    client = SimpleNamespace(
        detect_document_text=lambda **kwargs: {
            "Blocks": [
                {"BlockType": "WORD", "Text": "ignore"},
                {"BlockType": "LINE", "Text": "First line"},
                {"BlockType": "LINE", "Text": "Second line"},
            ]
        }
    )
    monkeypatch.setattr(boto3, "client", lambda service, region_name: client)
    monkeypatch.setattr(settings, "AWS_REGION", "eu-west-1")

    assert ocr_service.TextractBackend().extract_text(b"doc", "image/png") == "First line\nSecond line"


def test_backend_selection(monkeypatch):
    monkeypatch.setattr(settings, "OCR_BACKEND", "mistral")
    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "")
    assert isinstance(ocr_service.get_ocr_backend(), ocr_service.TesseractBackend)

    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "key")
    assert isinstance(ocr_service.get_ocr_backend(), ocr_service.MistralBackend)

    monkeypatch.setattr(settings, "OCR_BACKEND", "textract")
    assert isinstance(ocr_service.get_ocr_backend(), ocr_service.TextractBackend)

    monkeypatch.setattr(settings, "OCR_BACKEND", "unknown")
    assert isinstance(ocr_service.get_ocr_backend(), ocr_service.TesseractBackend)


def test_extract_text_uses_selected_backend(monkeypatch):
    backend = SimpleNamespace(extract_text=lambda value, mime: f"{value.decode()}:{mime}")
    monkeypatch.setattr(ocr_service, "get_ocr_backend", lambda: backend)
    assert ocr_service.extract_text(b"payload", "text/plain") == "payload:text/plain"
