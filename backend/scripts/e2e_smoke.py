"""End-to-end smoke test against the running stack (run inside the api container).

Exercises the REAL pipeline over HTTP: register -> verify -> login -> upload
-> background OCR/categorise/embed (worker) -> search -> AI ask.

Prerequisites: the full docker compose stack running (api, worker, redis, db,
minio, ollama) and AI keys configured in .env (GROQ/GEMINI for Q&A, MISTRAL for
categorisation). Ollama must have `nomic-embed-text` pulled for embeddings.

Usage:  docker compose exec -T api python scripts/e2e_smoke.py

Exit code 0 = all checks passed. Handy as a pre-demo sanity check. Not a pytest
test (needs the live stack + external AI keys), so it is not collected by CI.
"""
import asyncio
import io
import os
import secrets
import sys
import time

# Ensure the backend root (which contains the `app` package) is importable
# regardless of the directory this script is launched from.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select

from app.dependencies import async_session
from app.models.base import User

BASE = "http://localhost:8000/api/v1"
EMAIL = f"smoke_{secrets.token_hex(4)}@example.com"
PASSWORD = "SmokeTest123!"

MANUAL_TEXT = [
    "ACME WashMaster 3000 User Manual",
    "Model: WM-3000  Brand: ACME",
    "",
    "Washing instructions:",
    "Wash cotton garments at 40 degrees Celsius.",
    "Use the delicate cycle for wool.",
    "Maximum load capacity is 9 kilograms.",
    "",
    "Warranty: This product is covered by a 2 year warranty",
    "from the date of purchase. Purchased 15 January 2026.",
]

results = {}


def make_manual_image() -> bytes:
    """Render the manual text onto a white PNG so Tesseract has clean text to read."""
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
    line_h = 50
    img = Image.new("RGB", (1100, len(MANUAL_TEXT) * line_h + 60), "white")
    draw = ImageDraw.Draw(img)
    y = 30
    for line in MANUAL_TEXT:
        draw.text((40, y), line, fill="black", font=font)
        y += line_h
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def get_verification_token(email: str) -> str:
    async with async_session() as db:
        row = await db.execute(select(User).where(User.email == email))
        user = row.scalar_one()
        return user.verification_token


def check(name: str, ok: bool, detail: str = ""):
    results[name] = ok
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}" + (f" :: {detail}" if detail else ""), flush=True)


async def main():
    async with httpx.AsyncClient(timeout=60) as c:
        # 1. Register
        r = await c.post(f"{BASE}/auth/register",
                         json={"email": EMAIL, "password": PASSWORD, "display_name": "Smoke Tester"})
        check("register", r.status_code in (200, 201), f"{r.status_code} {r.text[:120]}")

        # 2. Verify email (simulate the emailed link using the DB token)
        token = await get_verification_token(EMAIL)
        r = await c.get(f"{BASE}/auth/verify", params={"token": token})
        check("verify_email", r.status_code == 200, f"{r.status_code}")

        # 3. Login
        r = await c.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
        access = r.json().get("access_token") if r.status_code == 200 else None
        check("login", bool(access), f"{r.status_code}")
        if not access:
            return
        auth = {"Authorization": f"Bearer {access}"}

        # 4. Upload a document
        img = make_manual_image()
        r = await c.post(f"{BASE}/documents", headers=auth,
                         files={"file": ("manual.png", img, "image/png")},
                         data={"title": "ACME WashMaster Manual"})
        doc = r.json() if r.status_code in (200, 201) else {}
        doc_id = doc.get("id")
        check("upload", bool(doc_id), f"{r.status_code} status={doc.get('processing_status')}")
        if not doc_id:
            return

        # 5. Poll until the worker finishes processing (OCR + categorise + embed)
        final = {}
        for _ in range(40):  # up to ~80s
            r = await c.get(f"{BASE}/documents/{doc_id}", headers=auth)
            final = r.json()
            if final.get("processing_status") in ("complete", "failed"):
                break
            await asyncio.sleep(2)
        status = final.get("processing_status")
        check("processing_complete", status == "complete", f"status={status}")
        raw = (final.get("raw_text") or "")
        check("ocr_extracted_text", "cotton" in raw.lower() or "acme" in raw.lower(),
              f"raw_text[:80]={raw[:80]!r}")
        check("categorised", bool(final.get("brand") or final.get("document_type")),
              f"brand={final.get('brand')} type={final.get('document_type')}")

        # 6. Search (hybrid) — should find the doc by the word 'cotton'
        r = await c.get(f"{BASE}/search", headers=auth, params={"q": "cotton washing temperature"})
        sres = r.json().get("results", []) if r.status_code == 200 else []
        check("search_finds_doc", any(str(x.get("document_id")) == str(doc_id) for x in sres),
              f"{len(sres)} results")

        # 7. AI ask (RAG) — grounded answer
        r = await c.post(f"{BASE}/ai/ask", headers=auth,
                         json={"question": "What temperature should I wash cotton at?"})
        ans = r.json().get("answer", "") if r.status_code == 200 else ""
        srcs = r.json().get("sources", []) if r.status_code == 200 else []
        check("ai_ask", r.status_code == 200 and len(ans) > 0,
              f"{r.status_code} answer[:100]={ans[:100]!r}")
        check("ai_answer_grounded", "40" in ans or len(srcs) > 0,
              f"sources={len(srcs)}")

        # 8. Export (JSON) — the uploaded doc should appear in the export
        r = await c.get(f"{BASE}/documents/export", headers=auth, params={"format": "json"})
        check("export_json", r.status_code == 200 and str(doc_id) in r.text,
              f"{r.status_code} bytes={len(r.text)}")

        # Cleanup through the real account-deletion path. This removes the
        # database rows and the complete S3/MinIO user prefix.
        cleanup = await c.delete(f"{BASE}/auth/account", headers=auth)
        check("cleanup_test_account", cleanup.status_code == 204, f"{cleanup.status_code}")

    print("\n=== SMOKE TEST SUMMARY ===", flush=True)
    passed = sum(1 for v in results.values() if v)
    for k, v in results.items():
        print(f"  {'ok ' if v else 'XX '} {k}")
    print(f"{passed}/{len(results)} checks passed", flush=True)
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    t0 = time.time()
    try:
        asyncio.run(main())
    finally:
        print(f"(elapsed {time.time() - t0:.1f}s)")
