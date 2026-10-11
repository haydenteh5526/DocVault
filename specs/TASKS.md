# Task Breakdown & Project Plan

> **Document role:** Original estimated plan, retained for retrospective
> comparison. Empty sprint status cells are historical and are not the current
> backlog. Use [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) and the
> root [TODO.md](../TODO.md) for current work.

## AI Cloud Document Vault

**Project:** Final Year Project — Software Design with AI for Cloud Computing (Level 8)  
**Institution:** TUS Athlone  
**Version:** 1.0  
**Date:** 2026-06-11

---

## 1. Work Breakdown Structure (WBS)

### Phase 1: Foundation (Weeks 1–4)

| ID | Task | Estimated Hours | Dependencies |
|----|------|----------------|--------------|
| 1.1 | Literature review (OCR, RAG, cloud architecture) | 20 | — |
| 1.2 | Set up GitHub repo, branch strategy, PR templates | 2 | — |
| 1.3 | Set up development environment (Docker Compose, local DB, MinIO) | 4 | — |
| 1.4 | Write Terraform modules (VPC, RDS, S3, ECS, Cognito) | 16 | — |
| 1.5 | Set up CI/CD pipeline (GitHub Actions) | 6 | 1.2 |
| 1.6 | Configure AWS Cognito (user pool, app client) | 4 | 1.4 |
| 1.7 | Create FastAPI project skeleton with auth middleware | 8 | 1.3, 1.6 |
| 1.8 | Design and create database schema (migrations) | 4 | 1.3 |

### Phase 2: Core Backend (Weeks 5–8)

| ID | Task | Estimated Hours | Dependencies |
|----|------|----------------|--------------|
| 2.1 | Document upload endpoint (multipart, S3 storage) | 6 | 1.7, 1.8 |
| 2.2 | Document CRUD endpoints (list, get, update, delete) | 8 | 1.7, 1.8 |
| 2.3 | Image pre-processing service (OpenCV: deskew, crop, enhance) | 10 | 2.1 |
| 2.4 | AWS Textract integration (OCR extraction) | 8 | 2.1 |
| 2.5 | Tesseract fallback for local development | 4 | 2.4 |
| 2.6 | Text structuring (section/heading detection) | 6 | 2.4 |
| 2.7 | Category CRUD endpoints | 4 | 1.7 |
| 2.8 | Unit tests for all Phase 2 work | 8 | 2.1–2.7 |

### Phase 3: AI Features (Weeks 9–13)

| ID | Task | Estimated Hours | Dependencies |
|----|------|----------------|--------------|
| 3.1 | Document chunking service (split text, overlap, metadata) | 6 | 2.6 |
| 3.2 | Embedding generation (OpenAI text-embedding-3-small) | 6 | 3.1 |
| 3.3 | pgvector setup and vector storage | 4 | 3.2 |
| 3.4 | Semantic search endpoint (embed query → vector search) | 6 | 3.3 |
| 3.5 | Full-text search endpoint (PostgreSQL tsvector) | 4 | 2.6 |
| 3.6 | Hybrid search (blend full-text + semantic results) | 4 | 3.4, 3.5 |
| 3.7 | RAG pipeline (retrieve chunks → assemble prompt → LLM call) | 12 | 3.4 |
| 3.8 | Auto-categorisation service (LLM-based brand/model detection) | 8 | 2.6 |
| 3.9 | Prompt engineering and testing for Q&A accuracy | 8 | 3.7 |
| 3.10 | Ollama integration for local development | 4 | 3.7 |
| 3.11 | Unit + integration tests for AI features | 8 | 3.1–3.10 |

### Phase 4: Frontend (Weeks 14–17)

| ID | Task | Estimated Hours | Dependencies |
|----|------|----------------|--------------|
| 4.1 | React project setup (Vite, TypeScript, routing, Tailwind) | 4 | — |
| 4.2 | Auth flow (login, register, token management) | 8 | 4.1 |
| 4.3 | Dashboard page (document grid, categories sidebar) | 8 | 4.2 |
| 4.4 | Document upload / camera capture component | 10 | 4.2 |
| 4.5 | Document detail view (image + text + metadata tabs) | 8 | 4.3 |
| 4.6 | Search page (search bar, results with highlights) | 6 | 4.3 |
| 4.7 | Ask AI page (chat interface, source citations) | 8 | 4.3 |
| 4.8 | Category management UI | 4 | 4.3 |
| 4.9 | Responsive design and mobile optimisation | 6 | 4.3–4.8 |
| 4.10 | Loading states, error handling, empty states | 4 | 4.3–4.8 |
| 4.11 | React Native mobile app (camera capture, core screens) | 16 | 4.1–4.8 |

### Phase 5: Polish & Extras (Weeks 18–19)

| ID | Task | Estimated Hours | Dependencies |
|----|------|----------------|--------------|
| 5.1 | Warranty tracking feature (CRUD + expiry display) | 6 | 2.2, 4.5 |
| 5.2 | Document reprocessing endpoint | 3 | 2.4 |
| 5.3 | Pagination and filtering on document list | 4 | 2.2, 4.3 |
| 5.4 | Pre-signed URL generation for secure image access | 3 | 2.1 |
| 5.5 | CloudWatch monitoring and alarms | 4 | 1.4 |
| 5.6 | Rate limiting configuration | 2 | 1.7 |
| 5.7 | Accessibility audit and fixes (WCAG 2.1 AA) | 4 | 4.3–4.8 |

### Phase 6: Testing & Evaluation (Weeks 20–21)

| ID | Task | Estimated Hours | Dependencies |
|----|------|----------------|--------------|
| 6.1 | OCR accuracy benchmark (20 test documents) | 6 | 2.4 |
| 6.2 | RAG Q&A accuracy evaluation (50 test questions) | 8 | 3.7 |
| 6.3 | Categorisation accuracy evaluation (30 test docs) | 4 | 3.8 |
| 6.4 | Load testing (k6 or Locust) | 4 | All backend |
| 6.5 | End-to-end tests (Playwright) | 8 | All frontend |
| 6.6 | Security review (OWASP checklist) | 4 | All |
| 6.7 | Usability testing (5 participants, SUS questionnaire) | 6 | 4.11 |
| 6.8 | Fix bugs found during testing | 10 | 6.1–6.7 |

### Phase 7: Documentation & Submission (Weeks 22–24)

| ID | Task | Estimated Hours | Dependencies |
|----|------|----------------|--------------|
| 7.1 | FYP report — Introduction, literature review | 12 | 1.1 |
| 7.2 | FYP report — Design chapter | 10 | Phase 2–3 |
| 7.3 | FYP report — Implementation chapter | 12 | Phase 2–5 |
| 7.4 | FYP report — Testing & evaluation chapter | 8 | Phase 6 |
| 7.5 | FYP report — Conclusion & future work | 4 | 7.1–7.4 |
| 7.6 | Record demo video (5 minutes) | 4 | Phase 5 |
| 7.7 | Prepare viva presentation (slides + live demo script) | 8 | 7.6 |
| 7.8 | User documentation / README | 4 | Phase 5 |
| 7.9 | Final code cleanup and documentation | 4 | All |

---

## 2. Sprint Plan (2-Week Sprints)

### Sprint 1 — Weeks 1–2: Setup & Research

**Goal:** Dev environment running, AWS infrastructure defined, literature review started.

| Task | Status |
|------|--------|
| 1.1 Literature review (start) | |
| 1.2 GitHub repo setup | |
| 1.3 Docker Compose environment | |
| 1.4 Terraform modules (start) | |

**Sprint Review Criteria:** `docker compose up` runs the full local stack.

---

### Sprint 2 — Weeks 3–4: Infrastructure & API Skeleton

**Goal:** AWS infra deployable, FastAPI running with auth, database migrated.

| Task | Status |
|------|--------|
| 1.4 Terraform modules (complete) | |
| 1.5 CI/CD pipeline | |
| 1.6 Cognito configuration | |
| 1.7 FastAPI skeleton + auth | |
| 1.8 Database schema | |

**Sprint Review Criteria:** API deployed to AWS, `/health` endpoint responds, auth flow works.

---

### Sprint 3 — Weeks 5–6: Document Upload & OCR

**Goal:** Users can upload a document and get OCR text back.

| Task | Status |
|------|--------|
| 2.1 Upload endpoint | |
| 2.2 Document CRUD | |
| 2.3 Image pre-processing | |
| 2.4 Textract integration | |
| 2.5 Tesseract fallback | |

**Sprint Review Criteria:** Upload an image → get extracted text in response within 30 seconds.

---

### Sprint 4 — Weeks 7–8: Text Processing & Categories

**Goal:** Uploaded documents have structured text and can be categorised.

| Task | Status |
|------|--------|
| 2.6 Text structuring | |
| 2.7 Category endpoints | |
| 2.8 Unit tests | |
| 1.1 Literature review (complete) | |

**Sprint Review Criteria:** All Phase 2 tests pass. Document text is sectioned.

---

### Sprint 5 — Weeks 9–10: Embeddings & Search

**Goal:** Documents are chunked and searchable by keyword and meaning.

| Task | Status |
|------|--------|
| 3.1 Chunking service | |
| 3.2 Embedding generation | |
| 3.3 pgvector setup | |
| 3.4 Semantic search | |
| 3.5 Full-text search | |

**Sprint Review Criteria:** Search for a keyword or concept → correct document returned.

---

### Sprint 6 — Weeks 11–13: RAG & Auto-Categorisation

**Goal:** Users can ask questions and get sourced answers. Documents auto-categorise.

| Task | Status |
|------|--------|
| 3.6 Hybrid search | |
| 3.7 RAG pipeline | |
| 3.8 Auto-categorisation | |
| 3.9 Prompt engineering | |
| 3.10 Ollama integration | |
| 3.11 AI tests | |

**Sprint Review Criteria:** Ask a question about a stored manual → get correct, sourced answer.

---

### Sprint 7 — Weeks 14–15: Frontend Core

**Goal:** Web app has working auth, document list, upload, and detail view.

| Task | Status |
|------|--------|
| 4.1 React setup | |
| 4.2 Auth flow | |
| 4.3 Dashboard | |
| 4.4 Upload component | |
| 4.5 Document detail view | |

**Sprint Review Criteria:** Log in → see documents → upload new → view detail.

---

### Sprint 8 — Weeks 16–17: Frontend AI & Mobile

**Goal:** Search and AI Q&A working in UI. Mobile app captures documents.

| Task | Status |
|------|--------|
| 4.6 Search page | |
| 4.7 Ask AI page | |
| 4.8 Category management | |
| 4.9 Responsive design | |
| 4.10 Loading/error states | |
| 4.11 React Native app (start) | |

**Sprint Review Criteria:** Full user journey works end-to-end in browser and on phone.

---

### Sprint 9 — Weeks 18–19: Polish & Extras

**Goal:** Feature-complete. All nice-to-haves that fit are added.

| Task | Status |
|------|--------|
| 4.11 React Native app (complete) | |
| 5.1 Warranty tracking | |
| 5.2 Document reprocessing | |
| 5.3 Pagination/filtering | |
| 5.4 Pre-signed URLs | |
| 5.5 CloudWatch monitoring | |
| 5.6 Rate limiting | |
| 5.7 Accessibility audit | |

**Sprint Review Criteria:** App is feature-complete and polished.

---

### Sprint 10 — Weeks 20–21: Testing & Evaluation

**Goal:** System fully tested, metrics collected, bugs fixed.

| Task | Status |
|------|--------|
| 6.1–6.7 All testing tasks | |
| 6.8 Bug fixes | |

**Sprint Review Criteria:** All test suites pass. Evaluation metrics documented.

---

### Sprint 11 — Weeks 22–24: Documentation & Submission

**Goal:** FYP report complete, demo ready, viva prepared.

| Task | Status |
|------|--------|
| 7.1–7.9 All documentation tasks | |

**Sprint Review Criteria:** Report submitted, demo video uploaded, viva rehearsed.

---

## 3. Milestones

| # | Milestone | Target Week | Deliverable |
|---|-----------|-------------|-------------|
| M1 | Infrastructure Ready | Week 4 | AWS deployed, CI/CD running, auth working |
| M2 | OCR Pipeline Working | Week 6 | Upload photo → get text (end-to-end) |
| M3 | AI Features Complete | Week 13 | Search + Q&A + categorisation all functional |
| M4 | Frontend MVP | Week 15 | Usable web app with core features |
| M5 | Feature Freeze | Week 19 | No new features after this — only fixes |
| M6 | Testing Complete | Week 21 | All tests pass, evaluation metrics collected |
| M7 | Submission | Week 24 | Report, code, demo video submitted |

---

## 4. Risk Register

| ID | Risk | Probability | Impact | Mitigation | Contingency |
|----|------|-------------|--------|-----------|-------------|
| R1 | OCR accuracy too low on phone photos | Medium | High | Image pre-processing pipeline; camera overlay guide | Allow manual text correction; use higher-quality Textract mode |
| R2 | OpenAI API costs exceed budget | Medium | Medium | Use GPT-4o-mini (cheapest), cache responses, use Ollama locally | Switch to fully local model (Ollama + Llama 3) for all environments |
| R3 | Scope creep — too many features | High | High | Strict MoSCoW prioritisation; "Could Have" items are future work | Cut mobile app, focus on web only |
| R4 | React Native too complex / slow to develop | Medium | Medium | Start with web app (higher priority); mobile is stretch goal | Drop mobile app; demonstrate responsive web app on phone instead |
| R5 | AWS free tier exceeded | Medium | Low | Set billing alarms at €10, €25, €50; tear down dev env when not in use | Switch to cheaper services or local-only demo |
| R6 | RAG answers are inaccurate / hallucinate | Medium | High | Strict prompt engineering; "I don't know" fallback; show source chunks for verification | Reduce scope to search-only (no generative answers) |
| R7 | Textract not available in chosen region | Low | Medium | Check region availability early; use eu-west-1 (Ireland) | Use Tesseract as primary OCR engine |
| R8 | Time lost to debugging infrastructure | Medium | Medium | Use Docker Compose for most development; only deploy to AWS for integration testing | Simplify infra (skip ECS, deploy to single EC2 instance) |
| R9 | Database performance with vector search | Low | Medium | Index tuning; limit vector dimensions; use IVFFlat index | Reduce chunk count per document; use external vector DB |
| R10 | Burnout / time management | Medium | High | Consistent schedule; 2-week sprints with clear goals; no weekend work unless behind | De-scope to MVP; move extras to "future work" section of report |

---

## 5. Definition of Done

A task is **done** when:

1. Code is written and follows project style guidelines
2. Unit tests pass (where applicable)
3. Code is committed to a feature branch
4. PR is created with description of changes
5. CI pipeline passes (tests + lint)
6. Merged to main branch
7. Deployed to dev environment (for backend/infra tasks)
8. Documented (API docs updated, README if needed)

---

## 6. Tools & Project Management

| Tool | Purpose |
|------|---------|
| GitHub Issues | Task tracking (labels: phase, priority, type) |
| GitHub Projects (Kanban board) | Sprint board (To Do, In Progress, Done) |
| GitHub Actions | CI/CD |
| GitHub Wiki or `docs/` folder | Design decisions, meeting notes |

---

## 7. Estimated Total Effort

| Phase | Hours |
|-------|-------|
| Phase 1: Foundation | 64 |
| Phase 2: Core Backend | 54 |
| Phase 3: AI Features | 66 |
| Phase 4: Frontend | 82 |
| Phase 5: Polish | 26 |
| Phase 6: Testing | 50 |
| Phase 7: Documentation | 66 |
| **Total** | **408** |

At ~17 hours/week over 24 weeks = 408 hours. This is realistic for a final year project alongside other modules.
