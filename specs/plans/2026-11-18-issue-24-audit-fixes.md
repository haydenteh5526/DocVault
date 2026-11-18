# Issue #24: Fix the Defects Found in the 18 November Feature Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** proposed on 18 November 2026. It waits for the owner's approval of decisions D1 to D6. Nothing in it is implemented.

**Issue:** [#24](https://github.com/haydenteh5526/DocVault/issues/24). The evidence for every defect is in the audit record (`feature-audit-2026-11-18.md`, side-session notes, Architect session). The audit ran on `main` at `84730f9`, on the local `dvdemo` stack.

**Goal:** every existing web feature behaves as it says, before the redesign starts. Each task fixes one group of acceptance checks, test first. Nothing here changes the look beyond what a fix needs; the redesign (`feature/website-redesign`, on hold) comes later.

**Architecture in one paragraph.** Most fixes are local:
- a missing cache invalidation
- a wrong route
- a summary placeholder that pretends to be AI output
- a sidebar that is never moved off-screen
- a validator that is missing

Four fixes need a design:
- the Ask reply when nothing is relevant (D1)
- two-factor confirmation, which adds a pending-secret column (migration 018)
- the Google button, which needs a way to know whether Google sign-in is configured
- a bill confirmation whose reload fails

All server decisions stay on the server: ownership checks, retrieval and password rules. Document text stays evidence; nothing in this plan lets document text change behaviour.

## Decisions for the owner

1. **D1. When Ask says "I couldn't find this in your documents".**
   - *Today:* chunks are kept when their cosine similarity is at least `0.25` (`rag_service.py:139`).
   - *Measured on 18 November 2026* on `dvdemo` with the local `nomic-embed-text` model, comparing each question with the synthetic bill's text:
     - answerable: "When is this bill due?" 0.617, "How much do I owe for electricity?" 0.692, "What is the billing period?" 0.646
     - unanswerable: "When does my tenancy end?" 0.453, "How long is the washer guaranteed for?" 0.409, "What is the WiFi password?" 0.381, "Who won the World Cup?" 0.284
     - "What is this document about?" 0.517
   - *Recommended:* raise the floor to `0.55` for questions asked across all documents. A question asked inside one document's Ask tab keeps no floor, because the owner already chose the document. Keyword matches still count, as today. The value is provisional: eight questions and one document are a small sample. The retrieval benchmark (the lecturer's priority, its own plan) calibrates it on a frozen set and records the result.
   - *Alternative:* build that calibration set inside this issue first. More reliable, but it delays the other fixes.
2. **D2. Password rules on the server.**
   - *Recommended:* new passwords (sign-up and reset) must have at least 8 characters, an uppercase letter, a lowercase letter, a number and a character that is not a letter or number. These are exactly the rules the sign-up checklist shows today.
   - Existing passwords keep working; nobody is forced to change. Hayden's demo password `Demo@123` meets the rules.
   - *Alternative:* relabel the checklist as advice and keep the 8-character minimum.
3. **D3. Two-factor confirmation.**
   - *Recommended:* "Enable 2FA" stores a *pending* secret in a new column (`users.totp_pending_secret`). Sign-in ignores it. It becomes the real secret only when the owner types a correct code.
   - Recovery codes are out of scope (recorded under "Found while planning").
4. **D4. Settings in the sidebar.** *Recommended:* a "Settings" item that opens the existing Settings dialog, the same one the account menu opens. No new page.
5. **D5. Landing page, minimum honest content.**
   - *Recommended:* replace only what is untrue:
     - the Samsung manual examples become the Example Energy bill
     - the FAQ answer about AI models and the Tech Stack list name what runs locally: Tesseract, `nomic-embed-text` on Ollama, PostgreSQL with pgvector, FastAPI, React
     - the title and manifest name become "DocVault — personal document assistant"
   - The layout stays; the redesign replaces the page later.
6. **D6. Two pull requests.**
   - **PR 1** (Tasks 1 to 6, frontend only) starts now on `feature/issue-24-audit-fixes`. It avoids `AskAI.tsx`, `AssistantAction.tsx`, `lib/api.ts` and `e2e/app.spec.ts`, which issue #5's PR 23 changes.
   - **PR 2** (Tasks 7 to 12, server and the screens that call it) starts from `main` after PR 23 merges, on `feature/issue-24-server-fixes`.
   - Neither merges before 21 November 2026. `Closes #24` goes only on PR 2, and only when every check is verified.

## Global constraints

- Test first: write each failing test, see it fail for the stated reason, then implement.
- No AI or tool attribution in commits, pull requests or branch names.
- Keep the copy that existing tests match on, except where a task lists the change. Before changing any visible string, grep `frontend/e2e/*.ts`, `frontend/src/**/*.test.tsx` and `backend/tests/`.
- No new dependencies. `pyotp` and `qrcode` are already installed.
- Gates for every task:
  - Frontend: `npm ci`, `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`.
  - Backend (PR 2): `python -m ruff check app/ tests/` and `python -m pytest tests/ --cov=app --cov-fail-under=65`, against a disposable `pgvector/pgvector:pg16`.
  - The migration round trip on a fresh database (Task 8).
  - The browser suite against a disposable stack, **never `dvdemo`**.
- Synthetic data and disposable accounts only.

## Review focus (the inputs most likely to break it)

| Risk | Covered by |
| --- | --- |
| An upload shown in Documents only after the 30 s cache expires | Task 1: the test views the list, uploads, and returns within the stale window |
| A real AI summary hidden by the new check | Task 3: a summary with any non-empty list, or one that is not JSON, still renders |
| The sidebar off-screen on desktop | Task 4: at 1366 px the sidebar has no off-screen class |
| A summer timestamp shown on the wrong day | Task 6: `2026-06-30T23:30:00` (UTC) shows 1 July 2026 |
| A saved confirmation reported as failed, or a failed reload reported as current | Task 5: the save succeeds and the reload fails, then "Load latest" succeeds |
| Abandoned 2FA setup locking the owner out | Task 8: setup without confirmation, then sign-in, returns tokens |
| A real answer lost to the new floor | Task 7: a scoped question with similarity 0.30 still answers; an unscoped one at 0.62 answers |
| A document deleted mid-save leaving a 500 | Task 11: the lock test deletes the row while the save waits, and expects 404 |

## File structure

PR 1 (frontend only):
- `frontend/src/pages/Upload.tsx`, `Upload.test.tsx` (new)
- `frontend/src/pages/Dashboard.tsx`, `Dashboard.test.tsx` (new)
- `frontend/src/pages/DocumentDetail.tsx`, `DocumentDetail.test.tsx`
- `frontend/src/lib/summary.ts` (new), `summary.test.ts` (new)
- `frontend/src/App.tsx`, `AppShell.test.tsx` (new)
- `frontend/src/lib/auth.tsx`, `auth.test.tsx`
- `frontend/src/pages/Landing.tsx`, `Landing.test.tsx` (new), `frontend/index.html`, `frontend/public/manifest.json`
- `frontend/src/lib/billConfirm.ts`, `billConfirm.test.ts` (new); `frontend/src/components/BillReview.tsx`, `BillReview.test.tsx`
- `frontend/src/lib/dates.ts` (new), `dates.test.ts` (new); `BillSplit.tsx`, `BillReminder.tsx`

PR 2 (server and its screens):
- `backend/app/services/rag_service.py`, `backend/tests/test_rag_service.py`
- `backend/app/services/document_processor.py`, `backend/tests/test_document_processor.py`
- `backend/app/models/base.py`, `backend/alembic/versions/018_add_totp_pending_secret.py`, `backend/app/routers/auth.py`, `backend/tests/test_two_factor.py` (new)
- `frontend/src/pages/Settings.tsx`, `Settings.test.tsx` (new); `frontend/src/lib/api.ts`
- `frontend/src/pages/Auth.tsx`, `frontend/e2e/app.spec.ts` (one assertion)
- `backend/app/schemas/document.py`, `backend/tests/test_api.py`
- `backend/app/services/locking.py` (new), `bill_revisions.py`, `bill_split.py`, `reminders.py`, `backend/app/main.py`, the lock tests
- `backend/pyproject.toml`

---

## PR 1 — frontend fixes

### Task 1: An upload goes to the documents list and appears at once

- **Files:** `pages/Upload.tsx`; create `pages/Upload.test.tsx`.
- **Change:**
  - "View Documents" calls `navigate('/app/documents')` (was `navigate('/app')`, `Upload.tsx:332`).
  - After each successful `uploadDocument`, call `queryClient.invalidateQueries({ queryKey: ['documents'] })` (from `useQueryClient()`).
- [ ] **Tests:**
  - `view documents opens the documents list`: after a mocked successful upload, clicking "View Documents" lands on `/app/documents`.
  - `a finished upload refreshes the cached list`: seed `['documents']` with an empty list and `dataUpdatedAt = now`. Upload; expect `invalidateQueries` called with `['documents']`, and the query marked stale.
- [ ] Gates. Commit: `Open the documents list after an upload and refresh it`

### Task 2: Document rows never show raw summary JSON

- **Files:** `pages/Dashboard.tsx` (the row at `:699`); create `pages/Dashboard.test.tsx`.
- **Change:** remove the `doc.summary` paragraph from list and grid rows. When `doc.document_type` is set, show it in its place (`text-[11px] text-muted-foreground`). Title, date, and the processing or failed state stay as they are.
- [ ] **Test:** `a row shows no summary text`. A document whose `summary` is the fallback JSON (`{"overview": "EXAMPLE ENERGY…", "key_topics": []…}`) renders no text containing `{"` or `overview`.
- [ ] Gates. Commit: `Show document rows without raw summary text`

### Task 3: The document page shows real facts, not empty AI fields

- **Files:** create `lib/summary.ts` and `summary.test.ts`; `pages/DocumentDetail.tsx`, `DocumentDetail.test.tsx`.
- **Change:**
  - `isGeneratedSummary(summary: string | null | undefined): boolean`. It returns `false` for empty values. For JSON whose `key_topics`, `specifications`, `safety_warnings` and `quick_facts` are all empty arrays (the shape the no-key fallback writes) it returns `false`. Otherwise, including text that is not JSON, it returns `true`.
  - `DocumentDetail` renders `RichSummary` only when `isGeneratedSummary(doc.summary)`.
  - **Key Information** lists only fields with a value: "Type" (`document_type`), "Brand", "Model", then "File size" (always). A field without a value is not drawn, so no "—" appears.
  - For a bill, the Bill review panel (amount, due date and billing period with their source lines) stays above Key Information, unchanged.
  - The processing line "Extracting text, detecting brand, model, and document type." becomes "Extracting the text and indexing it for search."
- [ ] **Tests:**
  - `summary.test.ts`: the fallback JSON → false; `""` → false; JSON with one key topic → true; plain text → true.
  - `DocumentDetail`: a bill with the fallback summary and no brand, model or type shows no "AI Summary" heading and no "—" under Key Information. It still shows "File size" and the Bill review values.
- [ ] Gates. Commit: `Show only real summaries and filled document facts`

### Task 4: Search, Warranties and Settings in the sidebar; the phone sidebar starts closed

- **Files:** `App.tsx`; create `AppShell.test.tsx`.
- **Change:**
  - After "Upload", add sidebar buttons "Search" (`/app/search`, icon `Search`), "Warranties" (`/app/warranties`, icon `ShieldCheck`) and "Settings". Settings calls `setSettingsOpen(true); setSettingsTab('general')`. Each button closes the phone sidebar, as the existing ones do.
  - The `<aside>` (`App.tsx:154`) adds `${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform`. The existing backdrop (`:151`) is unchanged. The phone button keeps `aria-label="Open menu"`.
- [ ] **Tests:**
  - `the sidebar links to search, warranties and settings`: clicking "Search" lands on `/app/search`; clicking "Settings" opens the dialog named "Settings".
  - `on a phone the sidebar starts off-screen`: with `matchMedia` at 390 px, the `aside` has `-translate-x-full`. Clicking "Open menu" removes it and shows the backdrop; clicking the backdrop restores it.
  - `on a desktop the sidebar is in place`: the `aside` has `lg:translate-x-0`.
- [ ] Gates. Commit: `Link search, warranties and settings, and keep the phone sidebar closed`

### Task 5: Sign-in changes reach other tabs; a failed reload after a confirmation is reported

- **Files:** `lib/auth.tsx`, `auth.test.tsx`; `lib/billConfirm.ts`, create `billConfirm.test.ts`; `components/BillReview.tsx`, `BillReview.test.tsx`.
- **Tab sync:** `AuthProvider` adds a `storage` listener. When `event.key === 'token'`, it calls `setToken(event.newValue)`. When the token is removed, `queryClient.clear()` runs, as on logout today.
- **Confirmation reload:**
  - `confirmBillAndRefresh` returns the `BillRevision` from `confirmBill`. On success:
    1. write it into the cached document with a new `storeConfirmedRevision(queryClient, documentId, revision)`, which sets `confirmed_bill`
    2. refetch `['document', documentId]` with `throwOnError: true`, checking `dataUpdateCount` the way `refreshBillData` does (offline counts as a failure)
    3. if the reload fails, throw `new ReloadFailedError(revision)`
  - On a save error, the document is still refetched before the error is rethrown (today's behaviour, which the 409 path relies on).
  - `BillReviewPanel` catches `ReloadFailedError`. It closes the editor and shows "Saved as revision {n}. The latest version could not be loaded, so this page may be out of date." with a "Load latest" button. The button refetches; on success the notice clears.
- [ ] **Tests:**
  - `a token removed in another tab signs this tab out`: dispatch `new StorageEvent('storage', { key: 'token', newValue: null })`; `isAuthenticated` becomes false.
  - `billConfirm`, `a saved confirmation survives a failed reload`: `confirmBill` resolves revision 2 and the refetch rejects. Expect `ReloadFailedError`, and the cached `confirmed_bill.revision_number === 2`.
  - `BillReview`, `shows the saved revision when the reload fails`: the notice text above, then "Load latest" succeeds and the notice disappears.
  - The existing 409 tests pass unchanged.
- [ ] Gates. Commit: `Follow sign-in changes across tabs and report a failed reload after confirming`

### Task 6: Timestamps in Irish time; an honest landing page

- **Files:** create `lib/dates.ts` and `dates.test.ts`; `BillReview.tsx`, `BillSplit.tsx`, `BillReminder.tsx`; `pages/Landing.tsx`, create `Landing.test.tsx`; `index.html`, `public/manifest.json`.
- **Dates:**
  - `formatTimestamp(value: string): string` replaces the three identical `formatCreatedAt` functions. It treats a value without an offset as UTC, as today, and formats with `timeZone: 'Europe/Dublin'`.
  - `formatBillDate` (date-only values such as due dates) keeps `timeZone: 'UTC'`, because those are calendar dates, not instants.
- **Landing (D5):**
  - Every "Samsung", "WW90T" and "Samsung Manual" example becomes the Example Energy electricity bill: "Total amount due: EUR 123.47", "Payment due date: 23 November 2026".
  - The FAQ answer to "What AI models are used?" becomes: "Text is read with Tesseract OCR and searched with the nomic-embed-text model on Ollama, all on your own computer. Answers written by a language model need a provider key, which this build does not set."
  - The Tech Stack list drops "Groq / Gemini" and "Mistral" and adds "Ollama — local embeddings".
  - `<title>` and the manifest `name` become "DocVault — personal document assistant".
- [ ] **Tests:**
  - `dates.test.ts`: `formatTimestamp('2026-06-30T23:30:00') === '1 July 2026'` and `formatTimestamp('2026-11-17T23:30:00') === '17 November 2026'`.
  - `Landing.test.tsx`: the page text contains none of "Samsung", "Groq", "Gemini", "Mistral", "Llama", and contains "EUR 123.47".
  - `e2e/accessibility.spec.ts` (landing `h1` visible, no axe violations) passes unchanged.
- [ ] Gates, including Playwright on a disposable stack. Update `specs/Repo_Current_State.md` with a verified-results row. Commit: `Show timestamps in Irish time and describe the local build truthfully`

**PR 1:** the Reviewer checks Tasks 1 to 6 against the acceptance checks they cover. The body starts `Part of #24`.

---

## PR 2 — server fixes (after PR 23 merges)

### Task 7: Ask says plainly when it has no answer, and names the line

- **Files:** `backend/app/services/rag_service.py`, `backend/tests/test_rag_service.py`.
- **Change:**
  1. `SIMILARITY_FLOOR` becomes a module constant `0.55` (D1). It applies only when `document_id is None`. With `document_id` set, every fused chunk counts. Keyword matches keep today's rule.
  2. When nothing clears the floor and there is no keyword match, the answer is "I couldn't find this in your documents." (was "I don't have information about that in your documents."), with no sources.
  3. The retrieval queries also select `d.raw_text`. Each `Source` gains `line: int | None`: the 1-based index, in `raw_text.splitlines()`, of the first line that the chunk's first non-blank line starts with. This is the same numbering as the bill review's "OCR line". If nothing matches, it is `None`. `to_dict` includes `line`.
  4. Without a provider key, `_generate_answer` returns:
     - the line "No answer could be written because no language model is set up. These passages match your question:"
     - then, for each top chunk, a blank line, `"{title}, line {n}:"` (or `"{title}:"` when the line is unknown), and the first 200 characters of the chunk
     - the text "[Dev mode" no longer appears.
- [ ] **Tests** (update the two existing "Dev mode" assertions to the new text):
  - `an unscoped question below the floor is not found`: similarity 0.45, no keyword rows → the answer above, no sources.
  - `an unscoped question above the floor answers`: 0.62 → sources kept.
  - `a scoped question has no floor`: `document_id` set, similarity 0.30 → sources kept.
  - `a keyword match still answers below the floor`: keeps today's behaviour.
  - `sources carry the OCR line`: chunk "Total amount due: EUR 123.47…" in a `raw_text` where that is line 15 → `line == 15`.
  - `the no-key answer names each passage`: it starts with "No answer could be written", contains "Example Energy, line 15:", and does not contain "[Dev mode".
- [ ] Gates. Commit: `Say when nothing was found and name each passage's line`

### Task 8: Two-factor sign-in turns on only after a correct code

- **Files:**
  - `backend/app/models/base.py`: `totp_pending_secret: Mapped[str | None] = mapped_column(String(255))`
  - create `backend/alembic/versions/018_add_totp_pending_secret.py`: adds the nullable column; downgrade drops it
  - `backend/app/routers/auth.py`
  - create `backend/tests/test_two_factor.py`
  - `frontend/src/lib/api.ts`, `frontend/src/pages/Settings.tsx`, create `Settings.test.tsx`
- **API:**
  - `POST /auth/2fa/setup` stores the new secret in `totp_pending_secret` and leaves `totp_secret` unchanged. The response is unchanged.
  - New `POST /auth/2fa/confirm` takes body `{"code": str}`:
    - no pending secret → 409 `{"detail": "Start two-factor setup first."}`
    - wrong code (`pyotp.TOTP(...).verify(code, valid_window=1)` false) → 400 `{"detail": "That code didn't match. Check the time on your phone and try again."}`
    - otherwise, move the pending secret to `totp_secret`, clear the pending one, and return 200 `{"message": "Two-factor sign-in is on."}`
  - `POST /auth/2fa/disable` also clears `totp_pending_secret`.
- **Frontend:**
  - `confirm2FA(code: string): Promise<void>` in `api.ts`.
  - In Settings, after "Enable 2FA": the QR code and secret, an input labelled "Code from your authenticator app" (6 digits, `inputMode="numeric"`), and a button "Turn on 2FA".
  - `twoFAEnabled` becomes true only after `confirm2FA` succeeds; then a toast reads "Two-factor sign-in is on." An error shows the API's `detail` under the input.
- [ ] **Tests:**
  - `setup without confirming leaves sign-in unchanged`: setup, then `POST /auth/login` → 200 with tokens and `requires_2fa: false`.
  - `a correct code turns it on`: setup, then confirm with `pyotp.TOTP(pending).now()` → 200. Login now returns `requires_2fa: true`, and `POST /auth/login/2fa` with a fresh code returns tokens.
  - `a wrong code changes nothing`: confirm with `000000` → 400; login still returns tokens.
  - `confirm without setup is a conflict`: 409.
  - `disable clears both secrets`: after confirm, disable → login returns tokens.
  - Frontend: "Turn on 2FA" is disabled until 6 digits are entered; a 400 shows its message; success shows "2FA is enabled".
  - Migration round trip on a fresh database: upgrade to head, downgrade to `017`, upgrade again.
- [ ] Gates. Commit: `Turn on two-factor sign-in only after a correct code`

### Task 9: The Google button appears only when Google sign-in is configured

- **Files:** `backend/app/routers/auth.py`, `backend/tests/test_api.py`; `frontend/src/lib/api.ts`, `pages/Auth.tsx`, `frontend/e2e/app.spec.ts` (line 13).
- **Change:**
  - `GET /auth/providers` (public) → `{"google": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)}`.
  - `getAuthProviders()` in `api.ts`, called without a session (AGENTS.md: public account calls stay independent of a session).
  - `Auth.tsx` renders the "or" divider and "Continue with Google" only when `google` is true. While loading, or if the call fails, it renders neither.
- [ ] **Tests:**
  - API: unset → `{"google": false}`; both set → `true`.
  - Frontend: `false` → no button named "Continue with Google"; `true` → the button is shown.
  - e2e line 13 changes from `toBeVisible()` to `toHaveCount(0)`, because CI sets no Google keys. This is the only e2e change in this issue apart from Task 7's text, which no e2e test matches.
- [ ] Gates. Commit: `Show Google sign-in only when it is configured`

### Task 10: The server enforces the password rules; blank titles are rejected

- **Files:** `backend/app/routers/auth.py`, `backend/app/schemas/document.py`, `backend/tests/test_api.py`, `backend/tests/locustfile.py`.
- **Passwords (D2):**
  - A `field_validator` on `RegisterRequest.password` and `ResetPasswordRequest.new_password` requires: length 8–128, `[A-Z]`, `[a-z]`, `[0-9]` and `[^A-Za-z0-9]`.
  - Failure → 422 with the message "Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character."
  - Login is unchanged.
  - Update the test passwords that no longer qualify (`pass123456`, `newpass123`, `loadtest123`) to `Pass123456!`, `NewPass123!` and `LoadTest123!`. The e2e passwords (`TestPass123!`, `ChangedPassword456!`) already qualify.
- **Blank titles:**
  - `DocumentUpdate.title` gets a `field_validator`. It strips whitespace; if the result is empty → 422 "Title cannot be blank."; otherwise it stores the stripped title. `None` still means "not changing".
  - The rename control in `DocumentDetail.tsx` shows the API's message in a toast.
- [ ] **Tests:**
  - Register with each missing class → 422 with the message; a compliant password → 201. The same for reset.
  - `PATCH` with title `"   "` → 422 "Title cannot be blank."; `"  October bill  "` → 200, title `"October bill"`.
- [ ] Gates. Commit: `Enforce the password rules and reject blank titles`

### Task 11: A document deleted during a save returns "not found"

- **Files:** create `backend/app/services/locking.py`; `bill_revisions.py`, `bill_split.py`, `reminders.py`, `backend/app/main.py`; the lock tests next to each service's tests.
- **Change:**
  - `class DocumentGoneError(Exception)`.
  - `async def lock_document(db: AsyncSession, document_id: uuid.UUID) -> Document` runs today's locked select with `.scalar_one_or_none()`. If the row is gone, it rolls back and raises `DocumentGoneError`.
  - `save_revision`, `save_split` and `reminders._lock_document` use it.
  - `main.py` registers a handler: `DocumentGoneError` → 404 `{"detail": "Document not found"}`, the same body as `_get_doc_or_404`.
- [ ] **Tests**, using the existing lock-test pattern (`with_for_update(key_share=True)` and `wait_until_blocked`): while a confirmation, a split save and a reminder approval each wait on the lock, delete the document in the locking session and commit. Each request returns 404, and no row is written.
- [ ] Gates. Commit: `Return not found when a document is deleted during a save`

### Task 12: Stop storing a placeholder summary; enable the invisible-character rules

- **Files:** `backend/app/services/document_processor.py`, `backend/tests/test_document_processor.py`; `backend/pyproject.toml`.
- **Change:**
  - `_generate_summary` returns `None` when no provider key is set or the call fails, instead of the fallback JSON (`document_processor.py:173-182`). Existing rows keep their old value; Task 3 already hides it.
  - Ruff: `select = ["E", "F", "I", "PLE251"]`. Fix any finding.
- [ ] **Tests:** `no key stores no summary`: with every provider key empty, `_generate_summary("text")` is `None`. Update any test that expected the fallback JSON.
- [ ] Gates. Update `specs/Repo_Current_State.md`, and the README's "Document Q&A" line if its wording changes. Commit: `Store no placeholder summary and check for invisible characters`

**PR 2:** the body starts `Closes #24` only if every acceptance check below is verified and the owner agrees; otherwise `Part of #24`. It records the Reviewer's full report.

## Acceptance check coverage

| Acceptance check in #24 | Task | Verified by |
| --- | --- | --- |
| "View Documents" opens the list; the new upload is there without a refresh | 1 | `Upload.test.tsx` (both tests); browser check |
| A row never shows raw summary JSON | 2 | `Dashboard.test.tsx` |
| The document page shows its own facts, not empty brand/model/type; no fake summary | 3, 12 | `summary.test.ts`, `DocumentDetail.test.tsx`, `test_document_processor.py` |
| No "[Dev mode - no AI key]"; the no-answer reply lists passages with document and line | 7 | `test_rag_service.py` (no-key answer, source line) |
| An unanswerable question gets "I couldn't find this in your documents" | 7 | `test_rag_service.py` (below floor); D1 measurement recorded above |
| 2FA turns on only after a correct code; tests cover setup, confirm, code sign-in, wrong code, disable | 8 | `test_two_factor.py`, `Settings.test.tsx`, migration round trip |
| The Google button only when configured | 9 | API and `Auth` tests; e2e line 13 |
| The server enforces the checklist's password rules on sign-up and reset | 10 | `test_api.py` password tests |
| Sign-in or sign-out in one tab reaches the others | 5 | `auth.test.tsx` |
| Search, Warranties and Settings in the main navigation | 4 | `AppShell.test.tsx` |
| The phone navigation starts closed, and its backdrop closes it | 4 | `AppShell.test.tsx` |
| The landing page and title describe the local €0 build | 6 | `Landing.test.tsx`; accessibility e2e unchanged |
| A blank title is rejected with a clear message | 10 | `test_api.py` title tests |
| A failed reload after a confirmation is reported, not shown as current | 5 | `billConfirm.test.ts`, `BillReview.test.tsx` |
| A document deleted mid-save returns "not found" | 11 | The three lock tests |
| Reminder history dates in Irish time | 6 | `dates.test.ts` |
| Ruff `PLE251x` runs in CI and passes | 12 | The CI backend job (Ruff step) |

## Found while planning, not in this plan

- No recovery codes for two-factor sign-in (D3).
- The D1 floor needs calibrating on a frozen set: the retrieval benchmark plan.
- Answers written by a local model (Ollama): their own plan with an accuracy check (owner, 18 November 2026).
- The welcome tour's "seen" flag is per browser, not per account (audit D13); the redesign removes the tour.
- Content waits for entrance animations (audit D14); the redesign removes them.
