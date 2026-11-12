# Confirmed Bill Revisions (Issue #1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a document owner correct and explicitly confirm a bill's amount, billing period and due date, and reopen that confirmed record with the evidence they reviewed.

**Architecture:** OCR candidates stay derived and read-only (`extract_bill_review`). A confirmation appends a row to a new `bill_revisions` table holding the owner's values in integer cents and ISO dates plus a JSON snapshot of the evidence they reviewed. Each save is bound to the evidence and the revision number the owner had on screen when editing started; the server checks both under a row lock in the transaction that inserts. The document detail response gains `confirmed_bill` (the latest revision). The web bill panel moves into its own component with four views: candidates, edit, compare, confirmed.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2, PostgreSQL; React, TypeScript, TanStack Query, Vitest with Testing Library, Playwright.

**Spec:** [Issue #1](https://github.com/haydenteh5526/DocVault/issues/1) acceptance checks and the #1 row of [MVP_Technical_Design.md](../MVP_Technical_Design.md#design-for-the-next-increments). Read both, and [AGENTS.md](../../AGENTS.md), before starting.

## Decisions

1. **A save is bound to what the owner reviewed.** When editing starts, the panel captures the displayed `bill_review` and the current revision number (`0` if none). The request carries both. The server locks the document row, recomputes the review, reads the current revision number, and saves only if both match. Otherwise it answers 409 with a reason code and saves nothing.
2. **After a 409 the bill is reloaded before the owner tries again.** The page refetches the document detail, the panel discards the draft, shows the fresh data and says what changed.
3. **A confirmed bill is shown whenever one exists**, including when the current transcript produces no candidates or the document is being reprocessed.
4. **The endpoint stays in the documents router**, because it needs `_get_doc_or_404`. The logic lives in a new service.
5. **Amounts travel as decimal strings and are stored as integer cents.** The API accepts and returns `"123.47"`; the table stores `12347`.

## Global Constraints

- Branch `feature/confirm-bill-revision` from `main` after PR #10 is merged. Open a PR to protected `main`; do not merge and do not enable auto-merge.
- Commits and the PR carry the configured Git identity only. No `Co-Authored-By` trailer and no "Generated with" line.
- Every new read or write checks ownership on the server through `_get_doc_or_404`. A non-owner gets 404.
- OCR evidence is never overwritten. A correction is a new revision; existing revisions are never updated or deleted by this feature.
- Amounts are stored and compared in integer cents. No floats.
- Use synthetic bill text and disposable accounts only. Local stack, €0 additional spend. No new dependencies.
- Frontend calls go through `authorizedFetch` in `frontend/src/lib/api.ts`; refetch `['document', id]` after every save attempt, successful or not.
- Backend gate: `python -m ruff check app/ tests/` and `python -m pytest tests/ --cov=app --cov-fail-under=65`, run from `backend/` against a disposable database (a throwaway `pgvector/pgvector:pg16` container, with the backend environment variables from `.github/workflows/ci.yml`).
- Frontend gate, from `frontend/`: `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`.
- Use `Closes #1` in the PR only if all four acceptance checks are verified; otherwise `Part of #1`.

## Review Focus

1. **The document query refetches while the form is open** (window focus, polling). The save must carry the evidence and revision captured when editing started, and the form must keep showing that evidence. (Task 4)
2. **A stale tab saves after another save finished.** Expect 409 `revision_changed` and no new row, even though the next revision number is free. (Task 2)
3. **Transcript edited or reprocessed between opening and confirming.** Expect 409 `transcript_changed`, no saved row, and a reloaded panel that says so. (Tasks 2, 3, 4)
4. **Candidates disappear after confirmation** (reprocessing, or an edit that removes the bill labels). The confirmed values and saved evidence stay visible. (Tasks 2, 4)
5. **Malformed input** (`123.4`, `1,234.05`, `-5.00`, `€12.00`, empty; period ending before it starts; impossible date). Expect rejection with a clear message, never silent coercion. (Tasks 2, 4)

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/app/models/base.py` (modify) | Add `BillRevision`. |
| `backend/alembic/versions/014_add_bill_revisions.py` (create) | Create and drop `bill_revisions`. |
| `backend/app/schemas/document.py` (modify) | `BillConfirmation`, `BillRevisionOut`, `DocumentDetailOut.confirmed_bill`. |
| `backend/app/services/bill_revisions.py` (create) | Cents conversion, latest-revision lookup, locked and validated append. |
| `backend/app/routers/documents.py` (modify) | `POST /{document_id}/bill-revisions`; add `confirmed_bill` to the detail response. |
| `backend/tests/accounts.py` (create) | Two-account helpers shared by isolation and revision tests. |
| `backend/tests/test_data_isolation.py` (modify) | Import the helpers instead of defining them. |
| `backend/tests/test_bill_revisions.py` (create) | Service unit tests and API tests. |
| `frontend/src/lib/api.ts` (modify) | Bill types, `ApiError`, `confirmBill`. |
| `frontend/src/lib/billConfirm.ts` (create) | `confirmBillAndRefresh`: save, then refetch the document whatever the outcome. |
| `frontend/src/lib/billConfirm.test.ts` (create) | Tests for the refetch on success and on conflict. |
| `frontend/src/components/BillReview.tsx` (create) | `BillReviewPanel`: candidates, edit, compare, confirmed views. |
| `frontend/src/components/BillReview.test.tsx` (create) | Component tests. |
| `frontend/src/pages/DocumentDetail.tsx` (modify) | Render `BillReviewPanel`; remove the inline panel, `BillReviewField` and `formatBillDate`. |
| `frontend/e2e/app.spec.ts` (modify) | Extend the bill scenario through confirm and reload. |
| `specs/Repo_Current_State.md`, `specs/Tickets.md`, `specs/MVP_Technical_Design.md` (modify) | Record what is implemented and verified. |

---

### Task 1: Revision table and shared test accounts

**Files:**
- Modify: `backend/app/models/base.py`
- Create: `backend/alembic/versions/014_add_bill_revisions.py`
- Create: `backend/tests/accounts.py`
- Modify: `backend/tests/test_data_isolation.py`

**Interfaces:**
- Produces: `app.models.base.BillRevision` with columns `id: uuid` (pk), `document_id: uuid` (FK `documents.id`, `ondelete="CASCADE"`, not null), `revision_number: int`, `amount_due_cents: int`, `due_date: date`, `billing_period_start: date`, `billing_period_end: date`, `evidence: dict` (JSON, not null), `created_at: datetime` (server default now). Table `bill_revisions`, unique constraint `uq_bill_revisions_document_revision` on `(document_id, revision_number)`. No ORM relationship on `Document`; the database cascade removes revisions.
- Produces: `tests.accounts.create_users_and_document(raw_text: str | None = None, processing_status: str = "complete") -> tuple[UUID, UUID, UUID]` (owner id, other id, document id) and `tests.accounts.delete_users(*user_ids) -> None`.

- [ ] **Step 1: Move the helpers.** Move `_create_users_and_document` and `_delete_users` from `test_data_isolation.py` to `tests/accounts.py` under the public names above, adding the two keyword parameters and passing them to `Document(...)`. Update `test_data_isolation.py` to import them.

- [ ] **Step 2: Run the isolation tests.**

Run: `python -m pytest tests/test_data_isolation.py -v`
Expected: 3 passed.

- [ ] **Step 3: Add `BillRevision` to `models/base.py`** after `DocumentVersion`, following that class's style.

- [ ] **Step 4: Write migration `014`** with `revision = "014"`, `down_revision = "013"`, in the style of `011_add_conversations.py`. `downgrade` drops the table.

- [ ] **Step 5: Run the migration round trip on a fresh database.**

Run: `python -m alembic upgrade head && python -m alembic downgrade 013 && python -m alembic upgrade head`
Expected: all three commands exit 0; `\d bill_revisions` shows the unique constraint.

- [ ] **Step 6: Commit.** `git commit -m "Add the bill revisions table"`

---

### Task 2: Save and reopen a confirmed revision

**Files:**
- Modify: `backend/app/schemas/document.py`
- Create: `backend/app/services/bill_revisions.py`
- Modify: `backend/app/routers/documents.py` (`get_document` at lines 219–227; new handler after it)
- Test: `backend/tests/test_bill_revisions.py`

**Interfaces:**
- Consumes: `BillRevision`, `tests.accounts` (Task 1); `extract_bill_review`, `BillReview`, `_get_doc_or_404` (existing).
- Produces, in `schemas/document.py`:
  - `BillConfirmation`: `amount_due: str` (pattern `^\d{1,7}\.\d{2}$`), `due_date: date`, `billing_period_start: date`, `billing_period_end: date`, `reviewed: BillReview`, `base_revision: int` (`ge=0`; `0` means no revision existed when editing started). A model validator rejects `billing_period_end < billing_period_start`.
  - `BillRevisionOut`: `id`, `document_id`, `revision_number: int`, `amount_due: str`, `due_date: date`, `billing_period_start: date`, `billing_period_end: date`, `evidence: BillReview`, `created_at: datetime`.
  - `DocumentDetailOut.confirmed_bill: BillRevisionOut | None = None`.
- Produces, in `services/bill_revisions.py`:
  - `to_cents(amount: str) -> int` and `from_cents(cents: int) -> str` (via `Decimal`; `from_cents(12347) == "123.47"`).
  - `class BillReviewConflict(Exception)` with attributes `code: str` and `message: str`.
  - `async def latest_revision(db: AsyncSession, document_id: UUID) -> BillRevisionOut | None`.
  - `async def save_revision(db: AsyncSession, doc: Document, confirmation: BillConfirmation) -> BillRevisionOut`.
  - `async def _current_revision_number(db: AsyncSession, document_id: UUID) -> int` (highest revision number, `0` when none).
- Produces, HTTP: `POST /api/v1/documents/{document_id}/bill-revisions` → 201 `BillRevisionOut`; 404 non-owner; 422 invalid body; 409 with `detail == {"code": <code>, "message": <message>}`. `GET /api/v1/documents/{document_id}` includes `confirmed_bill`, independent of whether `bill_review` is `null`.

`save_revision` runs these steps in the request's single transaction, in order, and commits only at the end:

1. Re-read the document row with a lock so a concurrent confirmation or transcript edit waits: `select(Document).where(Document.id == doc.id).with_for_update().execution_options(populate_existing=True)`.
2. If `processing_status != "complete"` or `extract_bill_review(raw_text)` is `None`: conflict `no_bill_review`, "This document no longer produces a bill review."
3. If `await _current_revision_number(...) != confirmation.base_revision`: conflict `revision_changed`, "Another confirmation was saved while you were reviewing."
4. If the recomputed review `!= confirmation.reviewed`: conflict `transcript_changed`, "The bill text changed while you were reviewing."
5. Insert with `evidence = review.model_dump()` and `revision_number = confirmation.base_revision + 1`. On `IntegrityError` (backstop for the lock), roll back and raise conflict `revision_changed`.

Every conflict path rolls back. The router maps `BillReviewConflict` to `HTTPException(409, {"code": exc.code, "message": exc.message})`.

- [ ] **Step 1: Write the failing tests** in `tests/test_bill_revisions.py`. Shared fixtures:

```python
BILL = ("Electricity bill\nTotal amount due: EUR 123.47\n"
        "Billing period: 1 October 2026 to 31 October 2026\nPayment due date: 23 November 2026")
UNCLEAR = BILL.replace("Payment due date: 23 November 2026", "Due date: 2026-11-23\nPay by: 2026-11-24")
VALUES = {"amount_due": "125.00", "due_date": "2026-11-23", "billing_period_start": "2026-10-01",
          "billing_period_end": "2026-10-31", "base_revision": 0}
EMPTY_REVIEW = {name: {"value": None, "sources": []} for name in ("amount_due", "due_date", "billing_period")}
```

Each API test creates accounts with `create_users_and_document(raw_text=...)`, calls through `AsyncClient(transport=ASGITransport(app=app))` with `create_access_token`, and cleans up with `delete_users` in `finally`, as `test_data_isolation.py` does. `review` below means `GET /documents/{id}` → `["bill_review"]`. "Code" means `response.json()["detail"]["code"]`.

| Test | Assertions |
| --- | --- |
| `test_cents_round_trip` | `to_cents("123.47") == 12347`; `to_cents("0.05") == 5`; `from_cents(12347) == "123.47"`; `from_cents(5) == "0.05"`. |
| `test_owner_confirms_a_correction_and_reopens_it` | POST `{**VALUES, "reviewed": review}` → 201; body has `revision_number == 1`, `amount_due == "125.00"`, `document_id` of the document, `evidence == review`. The row's `amount_due_cents == 12500`. A second GET returns `confirmed_bill` equal to the POST body and `bill_review["amount_due"]["value"] == "123.47"`. |
| `test_a_later_edit_adds_a_revision_and_keeps_the_first` | POST, then POST with `amount_due` `"126.50"` and `base_revision` `1` → `revision_number == 2`. Two rows exist; revision 1 still has `amount_due_cents == 12500`. GET returns revision 2. |
| `test_a_stale_tab_cannot_append_after_another_save` | POST (revision 1), then POST again with `base_revision` `0` and the same `review` → 409, code `revision_changed`; exactly one row. |
| `test_concurrent_confirmations_save_exactly_one` | `asyncio.gather` two identical POSTs with `base_revision` `0` → statuses sorted are `[201, 409]`, the 409's code is `revision_changed`; exactly one row. |
| `test_another_account_cannot_save_or_read_a_revision` | Other account's POST → 404 and zero rows. After the owner confirms, the other account's GET → 404. |
| `test_unclear_due_date_needs_an_owner_decision` | With `UNCLEAR`: `review["due_date"]["value"] is None` and it has 2 sources. POST without `due_date` → 422, zero rows. POST with `due_date` `"2026-11-24"` → 201 and `evidence["due_date"]["sources"]` has both lines. |
| `test_changed_transcript_is_rejected` | Read `review`, then change the document's `raw_text` in the database (amount `EUR 130.00`). POST with the old `review` → 409, code `transcript_changed`; zero rows. |
| `test_invalid_values_are_rejected` (parametrised) | Each → 422 and zero rows: `amount_due` in `"123.4"`, `"1,234.05"`, `"-5.00"`, `"€12.00"`, `""`; `billing_period_end` `"2026-09-30"`; `due_date` `"2026-02-31"`; `base_revision` `-1`. |
| `test_documents_without_a_bill_review_cannot_be_confirmed` (parametrised) | `raw_text="User manual"`, and `raw_text=BILL` with `processing_status="processing"`: POST `{**VALUES, "reviewed": EMPTY_REVIEW}` → 409, code `no_bill_review`; zero rows. |
| `test_confirmed_bill_reopens_after_candidates_disappear` (parametrised) | Confirm, then in the database set `raw_text="User manual"`, or set `processing_status="processing"`. GET → `bill_review is None` and `confirmed_bill` equals the POST body, including its `evidence`. |
| `test_a_duplicate_revision_number_is_a_conflict` | After one confirmation, monkeypatch `app.services.bill_revisions._current_revision_number` to return `0`. POST with `base_revision` `0` → 409, code `revision_changed`; exactly one row. |

- [ ] **Step 2: Run them to see them fail.**

Run: `python -m pytest tests/test_bill_revisions.py -v`
Expected: collection error or failures (module and route do not exist).

- [ ] **Step 3: Add the schemas, the service and the route; add `confirmed_bill` to `get_document`** using `latest_revision`.

- [ ] **Step 4: Run the backend gate.**

Run: `python -m ruff check app/ tests/` then `python -m pytest tests/ --cov=app --cov-fail-under=65`
Expected: ruff clean; all tests pass (178 existing plus the new ones); coverage at or above 65%.

- [ ] **Step 5: Commit.** `git commit -m "Save and reopen owner-confirmed bill revisions"`

---

### Task 3: API client, refresh-after-save and panel extraction

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/billConfirm.ts`, `frontend/src/lib/billConfirm.test.ts`
- Create: `frontend/src/components/BillReview.tsx`, `frontend/src/components/BillReview.test.tsx`
- Modify: `frontend/src/pages/DocumentDetail.tsx` (lines 6, 257–283, 354–378)

**Interfaces:**
- Produces, in `api.ts`:
  - `interface BillReview { amount_due: BillField; due_date: BillField; billing_period: BillField }`
  - `interface BillRevision { id: string; document_id: string; revision_number: number; amount_due: string; due_date: string; billing_period_start: string; billing_period_end: string; evidence: BillReview; created_at: string }`
  - `interface BillConfirmation { amount_due: string; due_date: string; billing_period_start: string; billing_period_end: string; reviewed: BillReview; base_revision: number }`
  - `class ApiError extends Error { status: number; code?: string; constructor(status: number, message: string, code?: string) }`
  - `confirmBill(documentId: string, body: BillConfirmation): Promise<BillRevision>`; POSTs JSON through `authorizedFetch`; when `!res.ok` throws `ApiError(res.status, detail.message, detail.code)`, tolerating a string or missing `detail`.
  - `Document.bill_review?: BillReview | null` and `Document.confirmed_bill?: BillRevision | null`.
- Produces, in `billConfirm.ts`: `confirmBillAndRefresh(queryClient: QueryClient, documentId: string, body: BillConfirmation): Promise<void>`. It calls `confirmBill`, then in a `finally` awaits `queryClient.refetchQueries({ queryKey: ['document', documentId] })`, so the caller receives the result or the error only after fresh document data is in the cache.
- Produces, in `BillReview.tsx`: `BillReviewPanel(props: { review: BillReview | null; confirmed: BillRevision | null; onViewOriginal: () => void; onConfirm: (body: BillConfirmation) => Promise<void> })`. The component needs no router, query or toast provider. It is rendered only when `review` or `confirmed` is present.

- [ ] **Step 1: Write the failing tests.**

In `billConfirm.test.ts`, with `vi.mock('./api')` and a real `QueryClient` whose `refetchQueries` is spied:

| Test | Assertions |
| --- | --- |
| `refetches the document after a successful save` | `confirmBill` resolves → `refetchQueries` called once with `{ queryKey: ['document', 'doc-1'] }`; the promise resolves. |
| `refetches the document before reporting a conflict` | `confirmBill` rejects with `new ApiError(409, 'changed', 'transcript_changed')` → the promise rejects with that same error, and `refetchQueries` had already been called when the rejection was observed. |

In `BillReview.test.tsx` (header as in `QueryError.test.tsx`), with a review whose values are `"123.47"`, `"2026-11-23"`, `"2026-10-01/2026-10-31"`, each with one source line:

| Test | Assertions |
| --- | --- |
| `shows candidates with their OCR evidence` | `confirmed={null}`: the region named `Bill review` contains `€123.47`, `23 November 2026`, `1 October 2026 – 31 October 2026`, three `blockquote` elements and `Not confirmed yet`. |
| `shows 'Check the original bill' for an unresolved field` | With `due_date.value = null`. |

- [ ] **Step 2: Run to see them fail.** Run: `npm test -- billConfirm BillReview` · Expected: FAIL, modules not found.

- [ ] **Step 3: Add the `api.ts` items and `billConfirm.ts`. Move the panel markup, `BillReviewField` and `formatBillDate` into `BillReview.tsx`** unchanged apart from the `Not confirmed yet` status line.

- [ ] **Step 4: Wire `DocumentDetail.tsx`.** Render `<BillReviewPanel>` when `doc.bill_review || doc.confirmed_bill`, with `onConfirm={body => confirmBillAndRefresh(queryClient, doc.id, body)}`. Move it above the `isProcessing` branch so a confirmed bill stays on screen while the document is reprocessed; the "Analysing document..." card still renders below it. If the save fails with code `no_bill_review`, also show the error's message with `toast` before rethrowing, because the panel unmounts when the refreshed document has neither candidates nor a confirmed bill.

- [ ] **Step 5: Run the frontend gate.** Run: `npx tsc -b`, `npm run lint`, `npm test`, `npm run build` · Expected: all pass.

- [ ] **Step 6: Commit.** `git commit -m "Move the bill review panel into its own component"`

---

### Task 4: Edit, compare and explicit confirm

**Files:**
- Modify: `frontend/src/components/BillReview.tsx`
- Test: `frontend/src/components/BillReview.test.tsx`

**Interfaces:**
- Consumes: `BillReviewPanel` props, `BillConfirmation`, `ApiError` (Task 3).

**Session capture.** Clicking `Review and confirm` or `Edit confirmed values` starts an editing session that stores, in component state, a copy of the `review` prop and `confirmed?.revision_number ?? 0` as they are at that moment. The edit and compare views read evidence and OCR candidates only from that captured copy, never from the live props. `onConfirm` sends `reviewed` and `base_revision` from the capture. Prop changes during a session do not alter the form.

The panel's views. Exact copy, because the tests and the browser scenario match on it:

| View | Content |
| --- | --- |
| **Candidates** (`review` present, no `confirmed`, not editing) | Values and evidence as today, `Not confirmed yet`, button `Review and confirm`. |
| **Edit** | Inputs labelled `Amount due (€)` (text), `Due date`, `Billing period start`, `Billing period end` (all `type="date"`), each beside its captured evidence lines. Prefill from `confirmed` if present, otherwise from the captured candidate; leave empty when the candidate is `null`. Buttons `Check values` and `Cancel`. |
| **Compare** | Heading `Confirm these values`. Each value formatted as in the candidates view. Where it differs from the captured OCR candidate: `OCR read: <candidate>`, or `OCR could not read this` when the candidate is `null`. Buttons `Confirm and save` and `Back`. |
| **Confirmed** (`confirmed` present, not editing) | `Confirmed · revision <n> · <created_at as d MMMM yyyy>`. Values from `confirmed`, evidence from `confirmed.evidence`. `Corrected from <candidate>` where the value differs from `confirmed.evidence`. Then one of: (a) `review` equals `confirmed.evidence` (compare with `JSON.stringify`): button `Edit confirmed values`; (b) `review` present but different: notice `The transcript has changed since this was confirmed.` and button `Edit confirmed values`; (c) `review` is `null`: notice `The current transcript no longer produces bill candidates. These are the values and evidence you confirmed.` and no edit button. |

Validation runs on `Check values` and blocks the compare view, shown in an element with `role="alert"`:
- amount not matching `^\d{1,7}\.\d{2}$`: `Enter the amount as euros and cents, for example 123.47.`
- any date empty: `Enter every date.`
- period end before start: `The billing period must end on or after it starts.`

`onConfirm` is called only from `Confirm and save`. While it is pending the button is disabled. On success the session ends and the confirmed view shows the new props.

**After a failed save.** `onConfirm` rejects only after the document has been refetched (Task 3), so the props are already fresh.
- `ApiError` with status 409: end the session, discard the draft, show the view that fits the fresh props, and show one message in a `role="alert"` element chosen by `code`:
  - `transcript_changed`: `The bill text changed while you were reviewing. Nothing was saved. The values below come from the updated text.`
  - `revision_changed`: `Another confirmation was saved while you were reviewing. Nothing was saved. The latest confirmed values are shown below.`
  - `no_bill_review`: `This document no longer produces a bill review. Nothing was saved.`
  - any other or missing code: `This bill changed while you were reviewing. Nothing was saved. The latest version is shown below.`
- Any other error: stay on compare, keep the draft, show `Could not save. Try again.`

The message clears when the owner starts a new session.

- [ ] **Step 1: Write the failing tests.** `review` is the Task 3 fixture; `changedReview` is the same with amount `"130.00"` and a different source line.

| Test | Assertions |
| --- | --- |
| `a correction is saved only after explicit confirmation` | Click `Review and confirm`; the amount input holds `123.47`. Replace with `125.00`; click `Check values`. `Confirm these values`, `€125.00` and `OCR read: €123.47` are shown; `onConfirm` not called. Click `Confirm and save`; `onConfirm` called once with `{ amount_due: '125.00', due_date: '2026-11-23', billing_period_start: '2026-10-01', billing_period_end: '2026-10-31', reviewed: review, base_revision: 0 }`. |
| `the save carries the evidence and revision captured when editing started` | With `confirmed` at revision 1: click `Edit confirmed values`, then `rerender` with `review={changedReview}` and `confirmed` at revision 2. The edit view still shows the original source line and not the changed one. `Check values`, `Confirm and save`: `onConfirm` called with `reviewed` equal to the original `review` and `base_revision: 1`. |
| `an unreadable date must be decided by the owner` | With `due_date.value = null`: the `Due date` input is empty; `Check values` shows `Enter every date.`; `onConfirm` not called. After entering `2026-11-24`, compare shows `OCR could not read this`. |
| `malformed amounts and reversed periods are rejected` | `123.4` → the amount message; period end `2026-09-30` → the period message. |
| `a confirmed revision reopens with its saved evidence` | With `confirmed` (revision 2, amount `125.00`, evidence equal to `review`): shows `Confirmed · revision 2`, `€125.00`, `Corrected from €123.47`, three `blockquote` elements; no notice. With `review={changedReview}`: the transcript-changed notice is shown and the blockquotes still show `confirmed.evidence`. |
| `a confirmed revision reopens when the transcript has no candidates` | `review={null}` with the same `confirmed`: shows `Confirmed · revision 2`, `€125.00`, three `blockquote` elements with `confirmed.evidence` text, the no-candidates notice, and no `Edit confirmed values` button. |
| `a changed transcript reloads the candidates and explains` | `onConfirm` is a mock that calls `rerender` with `review={changedReview}` and then rejects with `new ApiError(409, 'changed', 'transcript_changed')`. After `Confirm and save`: the `transcript_changed` message is in a `role="alert"` element, `€130.00` and `Review and confirm` are visible, and the amount input is gone. |
| `another saved confirmation reloads the confirmed bill and explains` | `onConfirm` calls `rerender` with `confirmed` at revision 1 (amount `126.50`) and rejects with `new ApiError(409, 'changed', 'revision_changed')`: the `revision_changed` message, `Confirmed · revision 1` and `€126.50` are shown. |
| `other save errors keep the draft` | `onConfirm` rejects with `new Error('network')`: `Could not save. Try again.` is shown and the compare view still shows `€125.00`. |
| `cancel leaves nothing saved` | Edit, change the amount, `Cancel`: candidates view shows `€123.47`; `onConfirm` not called. |

- [ ] **Step 2: Run to see them fail.** Run: `npm test -- BillReview` · Expected: the ten new tests fail.

- [ ] **Step 3: Implement the session capture, the views, the validation and the conflict handling** in `BillReview.tsx` with local `useState`; no new dependencies.

- [ ] **Step 4: Run the frontend gate.** Run: `npx tsc -b`, `npm run lint`, `npm test`, `npm run build` · Expected: all pass.

- [ ] **Step 5: Commit.** `git commit -m "Let the owner correct and confirm bill values"`

---

### Task 5: Browser scenario, evidence and pull request

**Files:**
- Modify: `frontend/e2e/app.spec.ts` (scenario at line 60, after the quotes loop ending line 122)
- Modify: `specs/Repo_Current_State.md`, `specs/Tickets.md`, `specs/MVP_Technical_Design.md`

- [ ] **Step 1: Extend the scenario** `verified user can review a bill image against its OCR evidence` after the existing evidence loop:

```ts
await review.getByRole('button', { name: 'Review and confirm' }).click();
await review.getByLabel('Amount due (€)').fill('125.00');
await review.getByRole('button', { name: 'Check values' }).click();
await expect(review).toContainText('OCR read: €123.47');
await review.getByRole('button', { name: 'Confirm and save' }).click();
await expect(review).toContainText('Confirmed · revision 1');
await page.reload();
await expect(review).toContainText('Confirmed · revision 1', { timeout: 30_000 });
await expect(review).toContainText('€125.00');
await expect(review).toContainText('Corrected from €123.47');
await expect(review.locator('blockquote')).toHaveCount(3);
```

- [ ] **Step 2: Run the browser checks against the local stack** with `/health/ready` passing and `E2E_BASE_URL`, `E2E_EMAIL`, `E2E_PASSWORD` set for a verified synthetic account.

Run: `npx playwright test`
Expected: all scenarios pass (the inbox scenario also needs `E2E_MAILPIT_URL`).

- [ ] **Step 3: Check by hand with the synthetic PDF.** Upload `evaluation/demo-1/synthetic-electricity-bill.pdf`, correct one value, confirm, reload, and check the saved values and evidence. Then, with the form open in one tab, save a confirmation from a second tab and try to save in the first: check that nothing is saved, the panel reloads to the second tab's revision and the `revision_changed` message appears. Record the commit and what was observed.

- [ ] **Step 4: Update the specs.** In `Repo_Current_State.md`, move confirmed revisions from "next increments" to the capability text and add a verified-results row with the commit, test counts and coverage. In `Tickets.md`, update the #1 row. In `MVP_Technical_Design.md`, note in "Architecture and evidence flow" that confirmation is implemented and that a save is bound to the reviewed evidence and revision. State only what was run.

- [ ] **Step 5: Commit, push and open the PR** to `main`. Title: `Save and reopen owner-confirmed bill revisions`. The body maps each of issue #1's four acceptance checks to the test or observation that verifies it, lists what was not run, and starts with `Closes #1` only if all four are verified. Wait for the backend, frontend, mobile and e2e checks. Do not merge.

---

## Acceptance check coverage

| Issue #1 acceptance check | Verified by |
| --- | --- |
| Candidates and exact source excerpts shown; conflicting or unreadable fields require review | Task 3 panel tests; Task 2 `test_unclear_due_date_needs_an_owner_decision`; Task 4 `an unreadable date must be decided by the owner` |
| Owner can correct, see the original evidence, and confirm exact values before saving | Task 4 `a correction is saved only after explicit confirmation`, `the save carries the evidence and revision captured when editing started`, `cancel leaves nothing saved`; Task 2 stale-tab, concurrent and changed-transcript tests; Task 5 browser scenario |
| Reopening preserves confirmed values and the source link; another account cannot read or change it | Task 2 `test_owner_confirms_a_correction_and_reopens_it`, `test_confirmed_bill_reopens_after_candidates_disappear`, `test_another_account_cannot_save_or_read_a_revision`; Task 4 both reopen tests; Task 5 reload |
| Synthetic fixture and a missing or conflicting date exercised | Task 2 `BILL` and `UNCLEAR` tests; Task 5 Step 3 |
