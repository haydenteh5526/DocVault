# Testing and verification guide

**Updated:** 2026-09-15

Use this guide for engineering verification. Formal academic measurements use
[specs/EVALUATION_PLAN.md](specs/EVALUATION_PLAN.md); do not mix smoke-test
success with accuracy or usability results.

## Start and check the stack

```powershell
cd C:\FYP
docker compose up --build -d
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec api alembic upgrade head
curl.exe http://localhost:8000/health/ready
```

Expected services: `api`, `worker`, `db`, `redis`, `minio`, `ollama`, `web`.
Open the web client at <http://localhost:3000> and Swagger at
<http://localhost:8000/docs>.

## Automated gate

Run backend tests with explicit development-database credentials so a stale
shell environment cannot substitute the placeholder defaults:

```powershell
cd C:\FYP\backend
$env:DATABASE_URL='postgresql+asyncpg://docvault:docvault@localhost:5432/docvault'
$env:S3_ENDPOINT='http://localhost:9000'
$env:S3_ACCESS_KEY='minioadmin'
$env:S3_SECRET_KEY='minioadmin'
$env:S3_BUCKET='documents'
$env:JWT_SECRET='test-secret-that-is-at-least-32-bytes-long'
$env:OCR_BACKEND='tesseract'
C:\venv\fyp\Scripts\python.exe -m pytest tests -v --cov=app --cov-report=term-missing --cov-fail-under=65
C:\venv\fyp\Scripts\python.exe -m ruff check app tests scripts

cd C:\FYP\frontend
npm run lint
npm test -- --run
npm run build
npx playwright test

cd C:\FYP\mobile
npm run typecheck
npm run doctor
```

Verified baseline: 161 backend tests, 72.71% coverage, 25 frontend tests and
eight Playwright scenarios, including three axe-based WCAG scans. Authenticated
Playwright scenarios are seeded in CI and skip locally unless `E2E_EMAIL` and
`E2E_PASSWORD` are supplied.
The backend CI job also upgrades a fresh database to head, downgrades it to
base, then upgrades it again before running tests.

## Full-stack smoke test

```powershell
cd C:\FYP
docker compose exec -T api python scripts/e2e_smoke.py
```

The script creates and verifies an isolated account, uploads a generated
document, waits for OCR, checks categorisation/search/Q&A/export, and deletes
the account plus object-storage prefix. The verified baseline is 12/12.

Without `GROQ_API_KEY` or `GEMINI_API_KEY`, Q&A deliberately returns retrieved
excerpts in development mode. That verifies retrieval wiring but is not proof
of LLM answer quality. Ollama provides local embeddings independently.

## Evaluation result validation

After collecting anonymised rows using the schemas under `evaluation/templates`,
derive the report metrics with:

```powershell
C:\venv\fyp\Scripts\python.exe backend\scripts\analyse_evaluation.py `
  evaluation\results\YYYY-MM-DD `
  --output evaluation\results\YYYY-MM-DD\summary.json
```

The analyser is covered by `backend/tests/test_evaluation_analysis.py`. See
`evaluation/README.md` and `specs/EVALUATION_PLAN.md` for field conventions and
the experimental protocol.

## Manual web acceptance path

1. Register and open the verification link from email or development API logs.
2. Sign in and confirm an unverified account is rejected.
3. Upload a real JPEG/PNG/WebP and a multi-page PDF.
4. Confirm pending → complete/failed feedback, OCR text, original preview and metadata.
5. Correct OCR text, restore a previous version, add tags/category and favourite it.
6. Search by an exact term and a semantic paraphrase; inspect excerpts/highlights.
7. Ask an answerable and an unanswerable question; verify every citation manually.
8. Export JSON/CSV, create a signed share link, then delete the document.
9. Delete a disposable account and confirm its database rows and storage objects are gone.

Record failures as reproducible issues rather than changing evaluation data.

## Mobile acceptance path

Set `EXPO_PUBLIC_API_URL` to an address reachable from the device. Android
emulators default to `10.0.2.2`; a physical device normally needs the host's LAN
address or a deployed HTTPS URL.

Test registration/verification, login, 2FA, biometric restart, access-token
refresh, camera denial/acceptance, failed upload feedback, successful upload,
search, Q&A and sign-out. Remote push requires an EAS/development build and a
configured Expo project.

## Interpreting failures

- `InvalidPasswordError` for database user `user`/`pass`: the test process read
  placeholder defaults; set `DATABASE_URL` explicitly as above.
- Search works but generated Q&A does not: check `/api/v1/ai/status` and provider keys.
- Semantic results are empty: confirm `nomic-embed-text` exists in Ollama and do
  not mix embeddings from different providers.
- Mobile cannot reach localhost: configure `EXPO_PUBLIC_API_URL` for that device.
- Expo Doctor mismatch: run `npx expo install --check`, review, then use
  `npx expo install --fix` on a dedicated dependency branch.
