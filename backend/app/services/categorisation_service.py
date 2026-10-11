import json

from app.config import settings


class DocumentMetadata:
    def __init__(self, brand: str | None = None, model: str | None = None,
                 document_type: str | None = None, title: str | None = None):
        self.brand = brand
        self.model = model
        self.document_type = document_type
        self.title = title


def categorise_document(text: str) -> DocumentMetadata:
    """Extract brand, model, document type from document text using LLM."""
    if not text:
        return DocumentMetadata()

    if settings.GROQ_API_KEY:
        return _categorise_groq(text)
    if settings.GEMINI_API_KEY:
        return _categorise_gemini(text)
    if settings.MISTRAL_API_KEY:
        return _categorise_mistral(text)
    return _fallback_categorise(text)


def _categorise_groq(text: str) -> DocumentMetadata:
    """Use Groq (Llama 3.3 70B) for metadata extraction."""
    from openai import OpenAI

    from app.services.retry import with_retry

    try:
        client = OpenAI(api_key=settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")

        def _call():
            return client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Extract metadata from this document text. Return JSON only with these fields: "
                            "brand, model, document_type (e.g. 'User Manual', 'Quick Start Guide', 'Warranty Card'), "
                            "suggested_title. Use null for fields you cannot determine. "
                            "For 'model', extract the specific product model number/name "
                            "(e.g. 'DR-HSH004', 'Galaxy S24')."
                        ),
                    },
                    {"role": "user", "content": text[:2000]},
                ],
                temperature=0,
                response_format={"type": "json_object"},
            )

        response = with_retry(_call, label="groq.categorise", attempts=2)
        data = json.loads(response.choices[0].message.content)
        return DocumentMetadata(
            brand=data.get("brand"),
            model=data.get("model"),
            document_type=data.get("document_type"),
            title=data.get("suggested_title"),
        )
    except Exception:
        return _fallback_categorise(text)


def _categorise_gemini(text: str) -> DocumentMetadata:
    """Use Gemini for metadata extraction."""
    from google import genai

    from app.services.retry import with_retry

    prompt = (
        "Extract metadata from this document text. Return JSON only with these fields: "
        "brand, model, document_type (e.g. 'User Manual', 'Quick Start Guide', 'Warranty Card'), "
        "suggested_title. Use null for fields you cannot determine. "
        "For 'model', extract the specific product model number/name (e.g. 'DR-HSH004', 'Galaxy S24').\n\n"
        f"{text[:2000]}"
    )

    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        response = with_retry(lambda: client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config={
                "temperature": 0,
                "response_mime_type": "application/json",
            },
        ), label="gemini.categorise", attempts=2)

        data = json.loads(response.text)
        return DocumentMetadata(
            brand=data.get("brand"),
            model=data.get("model"),
            document_type=data.get("document_type"),
            title=data.get("suggested_title"),
        )
    except Exception:
        return _fallback_categorise(text)


def _categorise_mistral(text: str) -> DocumentMetadata:
    """Use Mistral for metadata extraction."""
    import httpx

    from app.services.retry import with_retry

    def _call():
        resp = httpx.post(
            "https://api.mistral.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.MISTRAL_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "mistral-small-latest",
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Extract metadata from this document text. Return JSON only with these fields: "
                            "brand, model, document_type (e.g. 'User Manual', 'Quick Start Guide', 'Warranty Card'), "
                            "suggested_title. Use null for fields you cannot determine. "
                            "For 'model', extract the specific product model number/name (e.g. 'DR-HSH004', 'Galaxy S24')."
                        ),
                    },
                    {"role": "user", "content": text[:2000]},
                ],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    try:
        result = with_retry(_call, label="mistral.categorise", attempts=2)
        content = result["choices"][0]["message"]["content"]
        data = json.loads(content)
        return DocumentMetadata(
            brand=data.get("brand"),
            model=data.get("model"),
            document_type=data.get("document_type"),
            title=data.get("suggested_title"),
        )
    except Exception:
        return _fallback_categorise(text)


def _fallback_categorise(text: str) -> DocumentMetadata:
    """Simple keyword-based fallback when no LLM available."""
    if not text:
        return DocumentMetadata()

    text_lower = text.lower()

    # Detect common brands (match whole words to avoid false positives)
    brands = ["samsung", "dreo", "bosch", "siemens", "philips", "sony", "apple",
              "dell", "lenovo", "asus", "ikea", "dyson", "nikon", "canon",
              "xiaomi", "huawei", "panasonic", "sharp", "toshiba", "whirlpool", "lg", "hp"]
    import re
    brand = next((b.title() for b in brands if re.search(r'(?<![a-z])' + re.escape(b) + r'(?![a-z])', text_lower)), None)

    # Detect document type
    doc_type = None
    if "manual" in text_lower or "instruction" in text_lower:
        doc_type = "User Manual"
    elif "warranty" in text_lower or "guarantee" in text_lower:
        doc_type = "Warranty Card"
    elif "quick start" in text_lower or "setup" in text_lower:
        doc_type = "Quick Start Guide"
    elif "specification" in text_lower or "spec" in text_lower:
        doc_type = "Specification Sheet"

    return DocumentMetadata(brand=brand, document_type=doc_type)
