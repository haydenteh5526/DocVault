# Verified implementation status

**Last verified:** 2026-09-15
**Verification baseline:** `f5dbb6e`
**Overall status:** Web/backend MVP implemented; evaluation, physical-device validation and live-cloud evidence remain.

This is the canonical status document for the system as built. The original
proposal remains in [REQUIREMENTS.md](REQUIREMENTS.md), [DESIGN.md](DESIGN.md)
and [TASKS.md](TASKS.md). Differences between the proposal and implementation
are intentional evidence of the project's design evolution.

## Verification snapshot

| Area | Verified result | Meaning |
|---|---|---|
| Git | `main` clean and synchronized with `origin/main` | No uncommitted production work at verification time |
| Local runtime | API, worker, PostgreSQL/pgvector, Redis, MinIO, Ollama and web running | Full Docker development stack operational |
| Readiness | Database, storage, Ollama embeddings and Redis reported healthy | Dependencies reachable |
| Backend | 161 tests; ruff clean; 72.71% coverage with a 65% CI floor | Core processing, email/notifications, OCR, categorisation, RAG, storage, queueing, worker and warranty extraction modules have full line coverage |
| Frontend | 25 Vitest tests; ESLint clean; production build succeeds | Build and component/utility baseline healthy |
| Browser E2E | 8 Playwright tests, including verified login, protected access and 3 axe WCAG scans | Public/auth/onboarding/Ask AI/document states covered; upload UI is not exercised against real OCR in CI |
| Full-stack smoke | 12/12 checks passed | Register, verify, login, upload, OCR, categorise, search, RAG retrieval, export and cleanup work locally |
| Mobile | TypeScript clean; Expo Doctor 21/21 | Static/configuration validation passes |
| Generated AI answer | Not verified in the smoke run | No Groq/Gemini key was active; the development excerpt fallback was used |
| AWS | Not deployed | Terraform and CD exist, but live infrastructure is not yet proven |

Automated success is not the same as evaluation evidence. Accuracy, latency,
accessibility, load capacity and usability targets remain unproven until the
protocol in [EVALUATION_PLAN.md](EVALUATION_PLAN.md) is executed.

## Component status

| Component | Status | Notes |
|---|---|---|
| Email/password authentication | Implemented and tested | Verification, access/refresh rotation, password reset and server-side password length validation |
| TOTP 2FA | Implemented | Web and mobile login flows support it; physical-device validation remains |
| Google OAuth | Implemented, externally unverified | Requires valid Google credentials and redirect configuration |
| Document CRUD and export | Implemented | JSON/CSV export, favourite, sharing, bulk actions and OCR history included |
| Account deletion | Implemented and tested | Removes relational data and the complete S3/MinIO user prefix |
| OCR pipeline | Implemented | Tesseract default; Mistral OCR and Textract adapters available; benchmark not run |
| Image preprocessing | Partial | Deskew, contrast enhancement and denoising exist; automatic cropping is not implemented |
| Background processing | Implemented and tested | ARQ/Redis worker with inline fallback; queue success, fallback and cleanup paths are covered |
| Categorisation and warranty extraction | Implemented, not formally evaluated | Accuracy and provider-dependent behaviour need measurement |
| Hybrid search | Implemented | PostgreSQL full-text plus pgvector semantic retrieval; comparative evaluation not run |
| RAG Q&A and conversations | Implemented, generated-answer evaluation pending | Groq or Gemini generates answers when configured; sources and safe fallback are present |
| Web client | Primary client implemented | Responsive routes for documents, upload, search, Q&A, warranties, profile and settings |
| Mobile client | Companion client implemented | Camera, documents, search, Q&A, secure sessions, 2FA and push registration; not feature-equivalent to web |
| Push notifications | Backend implemented; device delivery unverified | Requires an EAS/development build and physical device |
| Observability | Partially implemented | Structured request logs, request IDs, Prometheus metrics and optional Langfuse tracing; no deployed dashboards/alerts yet |
| Local infrastructure | Implemented and verified | Docker Compose starts the complete development stack |
| AWS infrastructure | Defined, not deployed | Terraform describes edge, compute, database, storage and secrets resources |
| CI/CD | CI verified; CD unverified | CI gates PRs; deploy job is conditional and has not deployed a live environment |

## Material architecture changes

| Proposal | As built | Rationale |
|---|---|---|
| Cognito | Custom JWT, refresh rotation, TOTP and direct Google OAuth | Demonstrates authentication design and avoids coupling local development to AWS |
| Celery and RabbitMQ | ARQ and Redis | One service provides queueing and caching with lower operational complexity |
| OpenAI/Bedrock | Groq or Gemini for Q&A, Mistral for extraction, Ollama or Gemini for embeddings | Supports local/free development and provider substitution |
| OpenSearch | PostgreSQL full-text search plus pgvector | Keeps relational, keyword and vector data in one database |
| Textract as primary OCR | Tesseract locally, with Mistral/Textract adapters | Enables repeatable local evaluation before paid-cloud comparison |
| LocalStack | MinIO | Smaller S3-compatible local service |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the current system view and
[TRACEABILITY.md](TRACEABILITY.md) for requirement-level completion.

## Known gaps and risks

1. No formal OCR, retrieval, RAG or categorisation results have been collected.
2. The mobile app has not been validated on real iOS and Android devices.
3. Search filters are available for document listing but not the dedicated
   search results page.
4. Offline document access and an offline upload queue are not implemented.
5. Terraform and CD have not been exercised in an AWS account.
6. Automated WCAG scans cover selected browser states, but manual accessibility,
   Lighthouse and the 50-concurrent-user target have not been measured.
7. CloudFront terminates public TLS, but the current proposed CloudFront-to-ALB
   path requires review before claiming end-to-end encryption.

## Definition of project completion

The implementation should only be called FYP-complete when:

- every Must requirement is implemented or explicitly renegotiated;
- the automated gate is green and critical-path coverage is at least 65%;
- OCR, retrieval/RAG, categorisation, performance and accessibility results are recorded;
- one physical-device mobile test matrix is complete;
- a live cloud deployment has been smoke-tested and evidenced;
- the usability study has consented participants and anonymised results;
- the report, demo script and limitations are consistent with measured evidence.
