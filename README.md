<div align="center">
  <h1>DocVault</h1>
  <p><strong>A household document vault with source-backed bill review</strong></p>
  <a href="https://github.com/haydenteh5526/DocVault/actions/workflows/ci.yml">
    <img src="https://github.com/haydenteh5526/DocVault/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status on main">
  </a>
</div>

## Features

- **Upload documents** — Extract text from PDFs and photos with local OCR.
- **Review electricity bills** — See the amount due, due date and billing period alongside the OCR lines and original file.
- **Find documents** — Search by keyword or meaning.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Web | React, TypeScript, Vite |
| API | Python, FastAPI |
| Data and jobs | PostgreSQL with pgvector, MinIO, Redis and ARQ |
| Local processing | Tesseract OCR, Ollama embeddings |
| Mobile companion | React Native, Expo |

## Getting Started

The local demo uses Docker Compose and needs no API keys. The current Compose
setup needs a cached MinIO image because the public image pull fails. See the
[setup limitation](specs/Repo_Current_State.md#runtime).

From the repository root in PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec ollama ollama pull nomic-embed-text
```

Open the [web app](http://localhost:3000) and verify your demo account using the
[local inbox](http://localhost:8025). Follow the [Demo 1 walkthrough](evaluation/demo-1/README.md)
to upload the synthetic bill and open **Summary → Bill review**.
The [API reference](http://localhost:8000/docs) is available when the stack is running.

## Project Status

Demo 1 covers read-only bill review. Confirmed records, bill splitting and
approved reminders are planned. This is a TUS Athlone final year project.

[MVP design](specs/MVP_Technical_Design.md) · [Tickets](specs/Tickets.md) · [Current state](specs/Repo_Current_State.md)

## License

[MIT](LICENSE)
