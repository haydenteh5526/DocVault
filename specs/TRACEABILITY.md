# Requirements traceability

**Reviewed:** 2026-09-15

Status meanings:

- **Verified** — implementation exists and has automated or full-stack evidence.
- **Implemented** — code exists but the relevant real-device/provider evidence is pending.
- **Partial** — only part of the stated requirement is present.
- **Deferred** — intentionally outside the current implementation.
- **Unverified** — infrastructure or measurable target has not been demonstrated.

## Functional requirements

| ID | Status | Evidence or gap |
|---|---|---|
| FR-01–04 | Verified | Registration, JWT sessions, reset and complete account-data deletion |
| FR-05 | Partial | Google OAuth implemented; Apple OAuth not implemented; external configuration unverified |
| FR-06 | Verified | JPEG, PNG, WebP and PDF validation/upload paths |
| FR-07 | Implemented | Expo camera capture exists; physical-device matrix pending |
| FR-08 | Partial | Deskew, contrast and denoising exist; automatic crop does not |
| FR-09 | Partial | Multi-page PDF processing exists; multi-page camera scanning flow does not |
| FR-10 | Deferred | Camera alignment overlay |
| FR-11 | Verified | Tesseract pipeline passes the synthetic full-stack smoke test |
| FR-12 | Partial | Heading-aware chunking exists; table/complex-layout preservation is not proven |
| FR-13–14 | Verified | Original/text views, editing and reversible OCR text history |
| FR-15 | Unverified | Multi-column accuracy needs benchmark cases |
| FR-16–18 | Implemented | Brand/model/type/title extraction paths exist; formal accuracy evaluation pending |
| FR-19–20 | Verified | Metadata/category override and custom categories |
| FR-21–23 | Verified | Keyword/semantic/hybrid search, excerpts and highlighting |
| FR-24 | Partial | Document list filters exist; dedicated search-result filters are deferred |
| FR-25–29 | Implemented | Grounded Q&A, sources and safe-decline prompt exist; generated answers require provider evaluation |
| FR-30–33 | Verified | List, edit, tag, delete and detail workflows |
| FR-34 | Partial | Scan/update dates exist; distinct last-accessed reporting needs clarification |
| FR-35–37 | Implemented | Warranty CRUD, scheduled reminder backend and date extraction; device delivery pending |
| FR-38–39 | Unverified | Shared API supports multiple clients, but no live cloud synchronisation deployment exists |
| FR-40 | Deferred | Offline cache/upload queue |

## Non-functional requirements

| ID | Status | Evidence or gap |
|---|---|---|
| NFR-01–04 | Unverified | Measure OCR, search, Q&A and page-load latency using the evaluation protocol |
| NFR-05 | Unverified | Locust scenario exists; 50 concurrent users not yet demonstrated |
| NFR-06–07 | Unverified | Terraform configures cloud controls; live TLS/encryption evidence pending |
| NFR-08 | Verified | User-scoped queries plus cross-user read/edit/share/delete integration tests |
| NFR-09 | Partial | Environment-based local secrets and AWS Secrets Manager design; live AWS pending |
| NFR-10–11 | Verified | Rate limiting and content/size/type validation |
| NFR-12–14 | Partial | Horizontally scalable design and provider adapters exist; no live scale test |
| NFR-15–17 | Unverified | Uptime, durability and backups require a deployed evaluation environment |
| NFR-18 | Implemented | Responsive web plus mobile companion; physical devices pending |
| NFR-19 | Unverified | The click-count target requires a structured workflow audit |
| NFR-20 | Partial | Axe reports no WCAG 2.1 A/AA violations on selected public/authenticated states; manual and Lighthouse audits remain |
| NFR-21 | Implemented | Loading, polling, empty and error states exist |
| NFR-22 | Verified | Style gates pass, current documentation is organised, and CI enforces 65% backend coverage |
| NFR-23–24 | Verified locally | Docker Compose and Terraform source exist; AWS apply remains unverified |
| NFR-25 | Partial | CI runs automatically; conditional CD has not completed a real deployment |

## Evidence map

| Evidence | Location |
|---|---|
| Automated CI | `.github/workflows/ci.yml` |
| Backend tests | `backend/tests/` |
| Browser tests | `frontend/e2e/` |
| Full-stack smoke | `backend/scripts/e2e_smoke.py` |
| Evaluation protocol | `specs/EVALUATION_PLAN.md` |
| Usability protocol | `specs/USABILITY_TEST_PLAN.md` |
| Current architecture | `specs/ARCHITECTURE.md` |
