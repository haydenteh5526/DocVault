<div align="center">
  <img src="frontend/public/favicon.svg" width="80" height="80" alt="DocVault logo">
  <h1>DocVault</h1>
  <p><strong>Personal AI Document Assistant</strong></p>
  <p>Final year project that helps users turn the documents they keep into a personal knowledge base they can talk to. DocVault is designed to use those files as its long-term memory. Users describe what they need in their own words, and the assistant draws on their records to answer with evidence, connect information across documents, and propose actions for their approval.</p>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/haydenteh5526/DocVault" alt="MIT license"></a>
  <a href="https://github.com/haydenteh5526/DocVault/commits/main"><img src="https://img.shields.io/github/last-commit/haydenteh5526/DocVault/main" alt="Last commit"></a>
  <img src="https://img.shields.io/github/languages/top/haydenteh5526/DocVault" alt="Top language">
</div>

---

## Key Features

- **Document capture** — Upload PDFs or photos. A background worker extracts text with Tesseract while you continue using the vault.
- **Document library** — Organise files with categories, tags and favourites. Compare the original with extracted text and restore earlier text versions.
- **Hybrid search** — Find documents by exact words or meaning using PostgreSQL full-text search and local embeddings.
- **Document Q&A** — Retrieve relevant excerpts and get answers with sources when a Q&A provider is configured.
- **Bill review** — Compare the amount due, due date and billing period with their source lines and the original bill.
- **Private accounts** — Sign in to your own vault and use the local inbox for account verification and password recovery.

Demo 1 covers read-only bill review. Confirmed bill records, splitting, enquiry
drafts and approved reminders are described in the [MVP design](specs/MVP_Technical_Design.md).
Forecasting is an optional experiment that depends on having enough comparable bills.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, TanStack Query |
| Backend | Python, FastAPI, Pydantic, SQLAlchemy, Alembic |
| Database | PostgreSQL with pgvector |
| File storage | S3 API, served locally by RustFS |
| Background jobs | Redis, ARQ |
| Document processing | Tesseract OCR, Ollama embeddings |
| Answer generation | Groq or Gemini when a key is set. Local generation with Ollama is under evaluation in [#5](https://github.com/haydenteh5526/DocVault/issues/5). |
| Local email | Mailpit |
| Testing and CI | pytest, Ruff, Vitest, Playwright, GitHub Actions |
| Runtime | Docker Compose |
| Mobile companion | React Native, Expo |

---

## Quick Start

### Prerequisites

- Git and Docker with Docker Compose. The local demo needs no API keys.
- Node.js 22.13 or newer and npm for host web development, Expo, or JavaScript checks.

### Start the web stack

Clone the repository in PowerShell:

```powershell
git clone https://github.com/haydenteh5526/DocVault.git
cd DocVault
```

From the repository root, start the services:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec ollama ollama pull nomic-embed-text
```

### Verify

1. Check [API readiness](http://localhost:8000/health/ready).
2. Register in the [web app](http://localhost:3000) and verify your account in the [local inbox](http://localhost:8025).
3. Upload the [synthetic electricity bill](evaluation/demo-1/synthetic-electricity-bill.pdf). When processing finishes, open **Summary → Bill review** and compare the three fields with the original. See the [Demo 1 walkthrough](evaluation/demo-1/README.md) for the expected values.

### Web development

To run Vite on the host, use `docker compose up -d --build api worker` in place
of the full stack command above. Keep the migration and model setup steps.
If the Compose web service is already running, free port 3000 with
`docker compose stop web`.

```powershell
cd frontend
npm ci
npm run dev
```

Vite serves the web app at <http://localhost:3000> and forwards `/api` requests
to FastAPI on port 8000.

### Mobile companion

With the API running, start Expo from the repository root:

```powershell
cd mobile
npm ci
npm start
```

For a physical device, set `EXPO_PUBLIC_API_URL` to the computer's LAN address
and API port, for example `http://192.168.1.10:8000`, before starting Expo.

---

## Environment Variables

Use [`.env.example`](.env.example) for the full local configuration.

| Variable | Default or use |
| --- | --- |
| `OCR_BACKEND` | `tesseract` for local text extraction |
| `EMBEDDING_PROVIDER` | `auto`. Set `ollama` to pin local embeddings for an evaluation run. |
| `GROQ_API_KEY` or `GEMINI_API_KEY` | Optional. Enable generated Q&A. Without a key, development mode returns retrieved excerpts. |
| `FRONTEND_URL` | `http://localhost:3000`. Used in verification and recovery links. |
| `EXPO_PUBLIC_API_URL` | Optional API base URL for the mobile client. Set it in the shell that starts Expo. |

---

## Project Structure

```text
DocVault/
├── backend/
│   ├── app/              # API, document processing and background jobs
│   ├── alembic/          # Database migrations
│   └── tests/            # Python tests
├── frontend/
│   ├── src/pages/        # React web screens
│   ├── src/components/   # Shared UI
│   ├── src/lib/          # API client, sessions and query state
│   └── e2e/              # Playwright browser tests
├── mobile/               # Expo companion app
├── specs/                # Design, tickets and current state
├── evaluation/           # Demo fixture and assessment evidence
├── scripts/              # Restore pinned research references
├── terraform/            # Optional AWS infrastructure
└── docker-compose.yml    # Local development stack
```

---

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health/ready` | Check service dependencies |
| POST | `/api/v1/auth/register` | Create an account and send a verification link |
| POST | `/api/v1/auth/login` | Start a session |
| POST | `/api/v1/auth/forgot-password` | Request a reset link |
| GET | `/api/v1/documents` | List your documents |
| POST | `/api/v1/documents` | Upload a document for processing |
| GET | `/api/v1/documents/{document_id}` | Get document details and bill candidates when available |
| GET | `/api/v1/search?q=...` | Search your documents |
| POST | `/api/v1/ai/ask` | Ask a question and retrieve source excerpts |

See the full [API reference](http://localhost:8000/docs) while the stack is running.

---

## Documentation

| Document | Contents |
| --- | --- |
| [MVP technical design](specs/MVP_Technical_Design.md) | Evidence flow, planned workflow and approval rules |
| [Tickets](specs/Tickets.md) | Epic and stories linked to GitHub Issues |
| [Repository current state](specs/Repo_Current_State.md) | Verified capabilities, results and limits |
| [Evaluation](evaluation/README.md) | Assessment protocols, fixtures and results |

---

## Testing

Install the component dependencies and configure disposable test services using
the [verification guide](AGENTS.md#verification). Run each command from the
directory shown.

```powershell
# backend/
python -m pytest tests/ --cov=app --cov-fail-under=65

# frontend/
npm test
npx playwright test

# mobile/
npm run typecheck
npm run doctor
```

The [CI workflow](.github/workflows/ci.yml) also checks dependencies, migrations
and the production web build.

---

## License

[MIT](LICENSE)
