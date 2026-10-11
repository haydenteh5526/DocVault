# Current FYP roadmap

**Updated:** 2026-09-15

The feature set is frozen unless evaluation exposes a necessary change. Work
from top to bottom: correctness and evidence are worth more than additional UI
features. See [specs/IMPLEMENTATION_STATUS.md](specs/IMPLEMENTATION_STATUS.md)
for verified completion and [specs/TRACEABILITY.md](specs/TRACEABILITY.md) for
requirement-level gaps.

## Completed foundation

- [x] Full local Docker stack starts and reports ready dependencies.
- [x] Backend, frontend, mobile and browser checks run in CI.
- [x] Backend coverage cannot fall below the 65% baseline.
- [x] Full-stack synthetic smoke journey passes 12/12 checks.
- [x] Mobile email-verification, 2FA, secure access/refresh sessions and API error handling are implemented.
- [x] Account deletion removes database data and the complete object-storage user prefix.
- [x] Cross-user document read/edit/share/delete isolation is integration-tested.
- [x] Frontend lint is clean and fabricated testimonials/privacy claims are removed.

## Priority 1 — critical-path confidence

- [x] Raise backend coverage to at least 65%. The 2026-09-15 baseline is 72.71%
      across 161 tests; categorisation, document processing, email, image preprocessing,
      notifications, OCR, push, RAG, storage, queueing, worker and warranty extraction
      have full line coverage.
- [x] Cover storage adapters, queue success/fallback/cleanup and the worker entry point.
- [x] Cover external email and notification success/failure handling, including
      safe provider degradation without bearer-token logging.
- [ ] Add a browser upload workflow backed by MinIO/Tesseract in CI, or document
      why the Docker smoke test is the integration gate.
- [x] Block automated WCAG 2.1 A/AA violations on landing, login, onboarding,
      Ask AI and document-library browser states with axe/Playwright.
- [ ] Manually verify keyboard order, focus, dialogs and screen-reader flows.
- [x] Test migration upgrade/downgrade behaviour against a fresh database in CI.
- [ ] Test mobile registration, session refresh, camera upload and 2FA on one Android and one iOS device.
- [ ] Validate push receipt in an EAS/development build.

## Priority 2 — reproducible AI evaluation

- [x] Define frozen result schemas and a tested analyser for OCR, retrieval,
      RAG, categorisation and usability metrics.
- [ ] Configure Groq or Gemini for generated-answer evaluation. Do not present
      the development excerpt fallback as an LLM result.
- [ ] Freeze an anonymised dataset manifest and ground truth before tuning.
- [ ] Benchmark OCR on 20 representative documents and report word-error rate,
      latency, median/range and failure cases.
- [ ] Compare keyword-only, semantic-only and hybrid retrieval on a fixed query set.
- [ ] Evaluate 50 RAG questions for correctness, citation support and safe declines.
- [ ] Evaluate brand/model/type categorisation on 30 labelled documents.
- [ ] Record commit SHA, prompt revision and every provider/model version.

Protocol: [specs/EVALUATION_PLAN.md](specs/EVALUATION_PLAN.md).

## Priority 3 — performance, accessibility and users

- [ ] Run Locust progressively through 50 concurrent users and record error rate and p50/p95 latency.
- [ ] Record Lighthouse desktop/mobile results and complete a manual WCAG audit.
- [ ] Run the consented five-participant task study and SUS questionnaire.
- [ ] Convert observed issues into labelled bug/usability PRs and rerun affected tasks.

Protocol: [specs/USABILITY_TEST_PLAN.md](specs/USABILITY_TEST_PLAN.md).

## Priority 4 — cloud evidence

- [ ] Ask the supervisor whether cloud credits are available.
- [ ] Set an AWS Budget alert before creating chargeable resources.
- [ ] Remove or justify the unused Cognito module.
- [ ] Review CloudFront-to-ALB TLS, backups, secrets, logging and teardown settings.
- [ ] Apply Terraform in a temporary environment and record outputs/costs without committing secrets.
- [ ] Run migrations and the 12-check smoke test against the deployed environment.
- [ ] Verify the CD job redeploys API and worker and publishes the web build.
- [ ] Capture anonymised evidence, then destroy temporary resources when appropriate.

Terraform source is not deployment evidence; this section requires a real AWS account.

## Priority 5 — report and submission

- [ ] Literature review: OCR, image preprocessing, RAG/retrieval, cloud architecture and comparable systems.
- [ ] Design chapter: explain original-versus-as-built decisions using the architecture change table.
- [ ] Implementation chapter: focus on processing, retrieval, security boundaries and trade-offs.
- [ ] Evaluation chapter: include raw methodology, results, baselines, limitations and threats to validity.
- [ ] Conclusion: answer the research questions and separate supported findings from future work.
- [ ] Prepare a deterministic demo dataset and five-minute demo script.
- [ ] Prepare viva slides and rehearse twice, including a fallback recording.

## Deliberately deferred

- Offline cache and upload queue
- Multi-page camera scanning flow and alignment overlay
- Apple OAuth
- Dedicated search-result filter UI
- Family/household sharing and monetisation

Deferred work should remain future work unless evaluation shows it is essential.
