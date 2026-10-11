from abc import ABC, abstractmethod
from io import BytesIO

import pytesseract
from PIL import Image

from app.config import settings
from app.logging_config import get_logger

logger = get_logger("ocr")


class OCRBackend(ABC):
    @abstractmethod
    def extract_text(self, file_bytes: bytes, content_type: str) -> str:
        ...


class MistralBackend(OCRBackend):
    """Mistral OCR — uses /v1/ocr for PDFs, pixtral vision for images."""

    def extract_text(self, file_bytes: bytes, content_type: str) -> str:
        import base64


        b64 = base64.standard_b64encode(file_bytes).decode("utf-8")
        mime = content_type or "application/pdf"
        headers = {
            "Authorization": f"Bearer {settings.MISTRAL_API_KEY}",
            "Content-Type": "application/json",
        }

        if mime == "application/pdf":
            return self._ocr_pdf(b64, headers, len(file_bytes))
        return self._ocr_image(b64, mime, headers, len(file_bytes))

    def _ocr_pdf(self, b64: str, headers: dict, size: int) -> str:
        import httpx

        from app.services.retry import with_retry

        def _call():
            resp = httpx.post(
                "https://api.mistral.ai/v1/ocr",
                headers=headers,
                json={
                    "model": "mistral-ocr-latest",
                    "document": {
                        "type": "document_url",
                        "document_url": f"data:application/pdf;base64,{b64}",
                    },
                },
                timeout=180,
            )
            resp.raise_for_status()
            return resp.json()

        logger.info("Mistral OCR (PDF): processing %d bytes", size)
        result = with_retry(_call, label="mistral.ocr.pdf", attempts=2)
        pages = result.get("pages", [])
        text = "\n\n".join(p.get("markdown", "") for p in pages)
        logger.info("Mistral OCR: extracted %d chars from %d pages", len(text), len(pages))
        return text.strip()

    def _ocr_image(self, b64: str, mime: str, headers: dict, size: int) -> str:
        import httpx

        from app.services.retry import with_retry

        data_url = f"data:{mime};base64,{b64}"

        def _call():
            resp = httpx.post(
                "https://api.mistral.ai/v1/ocr",
                headers=headers,
                json={
                    "model": "mistral-ocr-latest",
                    "document": {
                        "type": "image_url",
                        "image_url": data_url,
                    },
                },
                timeout=120,
            )
            resp.raise_for_status()
            return resp.json()

        logger.info("Mistral OCR (image): processing %s (%d bytes)", mime, size)
        result = with_retry(_call, label="mistral.ocr.image", attempts=2)
        pages = result.get("pages", [])
        text = "\n\n".join(p.get("markdown", "") for p in pages)
        logger.info("Mistral OCR: extracted %d chars", len(text))
        return text.strip()


class TesseractBackend(OCRBackend):
    def extract_text(self, file_bytes: bytes, content_type: str) -> str:
        if content_type == "application/pdf":
            return self._extract_from_pdf(file_bytes)
        image = Image.open(BytesIO(file_bytes))
        return pytesseract.image_to_string(image).strip()

    def _extract_from_pdf(self, file_bytes: bytes) -> str:
        from pdf2image import convert_from_bytes
        pages = convert_from_bytes(file_bytes)
        texts = [pytesseract.image_to_string(page).strip() for page in pages]
        return "\n\n".join(t for t in texts if t)


class TextractBackend(OCRBackend):
    def extract_text(self, file_bytes: bytes, content_type: str) -> str:
        import boto3
        client = boto3.client("textract", region_name=settings.AWS_REGION)
        response = client.detect_document_text(Document={"Bytes": file_bytes})
        lines = [
            block["Text"]
            for block in response["Blocks"]
            if block["BlockType"] == "LINE"
        ]
        return "\n".join(lines)


def get_ocr_backend() -> OCRBackend:
    if settings.OCR_BACKEND == "mistral" and settings.MISTRAL_API_KEY:
        return MistralBackend()
    if settings.OCR_BACKEND == "textract":
        return TextractBackend()
    return TesseractBackend()


def extract_text(file_bytes: bytes, content_type: str) -> str:
    backend = get_ocr_backend()
    return backend.extract_text(file_bytes, content_type)
