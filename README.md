<div align="center">
  <img src="frontend/public/docvault-logo.svg" width="80" height="80" alt="DocVault logo">
  <h1>DocVault</h1>
  <p><strong>A personal AI assistant for your documents</strong></p>
  <p>A TUS Athlone final year project to help you find facts in your files and approve actions based on them.</p>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/haydenteh5526/DocVault" alt="MIT license"></a>
  <a href="https://github.com/haydenteh5526/DocVault/commits/main"><img src="https://img.shields.io/github/last-commit/haydenteh5526/DocVault/main" alt="Last commit"></a>
  <img src="https://img.shields.io/github/languages/top/haydenteh5526/DocVault" alt="Top language">
</div>

---

## Key Features

- **Capture and search** — Extract text from PDFs and photos with local OCR, then search by keyword or meaning.
- **Ask about your documents** — Retrieve relevant excerpts and get answers with sources when a Q&A provider is configured.
- **Review bill facts** — Compare the amount due, due date and billing period with their source lines and the original bill.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Web | React, TypeScript, Vite |
| API | Python, FastAPI |
| Data and jobs | PostgreSQL with pgvector, MinIO, Redis and ARQ |
| Local processing | Tesseract OCR, Ollama embeddings |
| Mobile companion | React Native, Expo |

---

## Quick Start

The local demo uses Docker Compose and needs no API keys. The current setup
requires a cached MinIO image. See the [setup limitation](specs/Repo_Current_State.md#runtime).

From the repository root in PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec ollama ollama pull nomic-embed-text
```

Open the [web app](http://localhost:3000) and verify your account in the
[local inbox](http://localhost:8025). Use the [Demo 1 walkthrough](evaluation/demo-1/README.md)
to review the synthetic bill. Demo 1 shows read-only bill review. Bill
confirmation, splitting, enquiry drafts and approved reminders are planned.

---

## Project Structure

```text
backend/      FastAPI, OCR and background jobs
frontend/     Web app
mobile/       Expo companion app
specs/        Design, tickets and current state
evaluation/   Demo fixture and assessment evidence
```

---

## Documentation

[MVP design](specs/MVP_Technical_Design.md) · [Tickets](specs/Tickets.md) · [Current state](specs/Repo_Current_State.md) · [Local API reference](http://localhost:8000/docs)

---

## License

[MIT](LICENSE)
