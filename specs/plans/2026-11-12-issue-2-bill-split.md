# Bill Split (Issue #2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** revision 2, approved by the owner on 12 November 2026 with separate approvals A, B and C as recommended. Nothing in this plan is implemented. Revision 2 scopes cached housemate data to the signed-in account, handles save and reload outcomes separately, stores the full case-folded label key, keeps four housemates as the December acceptance case, and presents the 2 to 12 person UI and the saved roster as separate approvals.

**Goal:** Let a document owner split the confirmed amount of a bill equally among four housemates in a visible order, review the exact shares and total, and save that split bound to the bill revision they reviewed.

**Architecture:** A pure function divides integer cents among a count of people. Housemate labels are saved per owner in a new `housemates` table, and a split request names them by id, so the server only splits among people it can find in the caller's account. A split is first previewed (computed, nothing written) and then saved as an append-only `bill_splits` row holding the revision it used, the rule, the total and a snapshot of the labels and cents. A save locks the document row, like a bill confirmation, and is rejected with a reason code if the revision, the latest split, the housemates or the shares differ from what the owner reviewed. A saved split is never recalculated: when a newer revision is confirmed it is reported as stale. In the browser, the split returned by a successful save is shown whether or not the page can then be refreshed, and after a conflict the draft is kept until the latest data has actually loaded. Cached housemate data is keyed by the signed-in account and all cached queries are dropped on sign-in and sign-out.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2, PostgreSQL; React, TypeScript, TanStack Query, Vitest with Testing Library, Playwright. No new dependencies.

**Spec:** [Issue #2](https://github.com/haydenteh5526/DocVault/issues/2) acceptance checks, and the #2 row and "Constraints on planned writes" in [MVP_Technical_Design.md](../MVP_Technical_Design.md#design-for-the-next-increments). Read both, [AGENTS.md](../../AGENTS.md) and the [issue #1 plan](2026-11-11-issue-1-confirm-bill-revision.md) before starting. This plan builds on `backend/app/services/bill_revisions.py` and `frontend/src/components/BillReview.tsx` from PR #13 and follows their patterns.

## Decisions

### Fixed by the owner

1. **Four housemates is the December acceptance case.** The issue title, the issue text and the design wording stay as they are. €123.47 among four labels in order gives €30.87, €30.87, €30.87, €30.86, verified at the calculator, the API, the panel and in the browser. The calculator takes a count internally.
2. **Integer-cent calculation, visible remainder order, and an explicit save tied to the confirmed bill revision.**
3. **Local stack, synthetic data, €0 additional spend, no new dependencies.**

### Separate approvals

Each of A, B and C can be approved or declined on its own. The tasks below implement the recommendation. If one is declined, the plan comes back to Plan for revision before Build starts; the parts affected are named.

- **A. The panel and API accept 2 to 12 people, not exactly four.** *Recommended.* Four is the tested acceptance case, and the same code path covers two or five. The limit of 12 guards against oversized input. *If declined:* `housemate_ids` must have exactly four items, the panel requires exactly four ticked (`Choose exactly four people.`), and the two- and five-person API tests are removed. Affects Tasks 3 and 6.
- **B. Housemate labels are a saved roster in the owner's account, and a split names them by id.** *Recommended.* The server rejects any id it cannot find in the caller's own roster, so a typed or invented name never reaches the calculator. This is the fault the 12 November local-model run showed (`split_bill` called with `Person 1` to `Person 4`).
  - A label is a name only. It is not linked to a user account, and the owner adds one for themself if they share the bill.
  - Labels can be added and removed but not renamed, so an id always means the label the owner saw. Order is the order added; there is no reorder control. The API accepts ids in any order, so one can be added later without changing the contract.
  - A saved split keeps its own copy of the labels. Removing a housemate later does not alter or invalidate it.
  - *If declined:* labels are typed for each split, checked for shape only, and stored in the split. The `housemates` table, routes, roster UI and the housemate cache work are removed. Affects Tasks 2 to 7.
- **C. The service worker stops storing API responses.** *Recommended, and wider than this feature.* `frontend/public/sw.js` stores every `GET /api/` response in a cache keyed by URL and serves it when the network fails. The key has no account in it, so after account B signs in on the same browser, a failed request can be answered with account A's stored response. That would include A's housemates and A's document detail with its split. Scoping the in-memory query cache does not close this. The change: the worker no longer handles `/api/` requests, and stored API responses are deleted on activation. Offline reads of API data stop working; static assets are still cached. *If declined:* Task 4 Step 5 and its test are removed, and this path stays open and is recorded as a known limit in `Repo_Current_State.md`.

### Design decisions to confirm

4. **The calculator is one pure function over integers.** `split_equally(total_cents, count)` returns `total_cents // count` each, plus one cent for each of the first `total_cents % count` positions. No floats or `Decimal` inside it. The result is in the order of the labels sent, the response lists shares in that order with `remainder_cents`, and the service refuses to return a result whose shares do not sum to the total.
5. **A split is previewed, then saved, and binds to one confirmed revision.** Preview writes nothing. Save appends a `bill_splits` row with `bill_revision_id`; rows are never updated or deleted by this feature. When a newer revision is confirmed, the saved split is returned with `stale: true`, still showing the amount, revision and shares it was calculated from. It is never recalculated; the owner splits again, which appends a new row. `stale` is derived on read, not stored.
6. **A save is bound to what the owner reviewed, as in issue #1.** The browser sends the revision number on screen when splitting started (`bill_revision`), the split number on screen then (`base_split`, `0` if none), the housemate ids in order, the rule, and the shares exactly as the preview showed them (`reviewed`). The server locks the document row, checks each, and on any mismatch answers 409 with a reason code and saves nothing.
7. **Save and reload are separate outcomes.**
   - *Saved, reload failed:* the panel shows the split the API returned, and the page writes it into the cached document so it survives a tab switch. A notice says the rest of the page could not be refreshed and offers `Refresh`.
   - *409, reload succeeded:* as in issue #1, the session ends, the draft is discarded and the panel shows the fresh data with the reason.
   - *409, reload failed (document or housemates):* the session and the ticked selection are kept, the panel says what happened and that the latest version could not be loaded, and `Calculate shares` and `Save split` are disabled. `Load latest` retries. Once it succeeds, the session is re-based on the fresh revision and split numbers, the selection is kept (less anyone no longer in the roster), the old preview is dropped, and the owner must calculate and review the shares again before saving. *Alternative:* after `Load latest` succeeds, end the session and discard the selection as in the reload-succeeded path. Recommended as written, because the selection does not depend on the revision and nothing is saved without a fresh review.
   - A failed preview with a 409 is handled the same way.
8. **Cached housemate data is scoped to the signed-in account.**
   - The housemates query key is `['housemates', <account id>]`, with the account id read from the access token's `sub` claim.
   - `login` and `logout` drop every cached query (`queryClient.clear()`). This is needed, not only tidy: a saved split's labels are inside the cached document detail (`['document', id]`), which B could otherwise be shown for a moment by going back to A's document URL. It also closes the same gap for the documents, categories and conversations lists.
   - The service worker is Decision C.
9. **Labels: 40 characters to display, the full case-folded key for duplicates.** A label is NFC-normalised, trimmed, 1 to 40 characters and printable. `label` is `String(40)`. `label_key` is `label.casefold()` stored in an unbounded `Text` column, because case-folding can lengthen a string (40 `ß` become 80 `s`). The browser counts characters as the server does (code points, `[...label].length`).
10. **Ownership.** Split routes go through `_get_doc_or_404`; a non-owner gets 404. Housemate routes filter by the session's user id; another owner's housemate is 404 on delete and indistinguishable from a non-existent id (`unknown_housemate`) in a split.
11. **The split has its own panel directly under `Bill review` on the Summary tab**, shown whenever the bill panel is shown, including while the document is reprocessed. Exact copy is in Task 6. The rule, the order, the remainder and the total are visible in the review and saved views.
12. **Interfaces for later issues, nothing built for them.**
    - Issue #3 references a saved split by `bill_splits.id` and may use it only if `latest_split(...)` returns that id with `stale == False`, checked after taking the same document row lock.
    - Issue #5's `split_bill(document_ref, people)` tool resolves `people` to ids by exact match against `list_housemates(db, user_id)` and calls `preview_split`. An unmatched name means the assistant asks. It never calls `save_split`.
13. **Zero and very small totals are allowed.** €0.00 splits into €0.00 each, and €0.03 among four into €0.01, €0.01, €0.01, €0.00. *Alternative:* reject a zero total.

## Global Constraints

- Branch `feature/bill-split` from `origin/main`. Open a PR to protected `main`; do not merge and do not enable auto-merge.
- Commits and the PR carry the configured Git identity only. No `Co-Authored-By` trailer, no "Generated with" line and no other tool attribution.
- Every read or write checks ownership on the server: documents through `_get_doc_or_404`, housemates by `user_id` from the session. A non-owner gets 404.
- Amounts are stored, calculated and compared in integer cents. No floats. Amounts travel as decimal strings (`"30.87"`), converted with the existing `to_cents` and `from_cents`.
- The shares of every split sum exactly to the confirmed total of the revision it names.
- `bill_revisions` and `bill_splits` rows are never updated or deleted by this feature. Do not change `save_revision`.
- No housemate data may be read from a cache entry that is not keyed to the signed-in account.
- The panel never says the latest data is shown unless the document and the housemates were both reloaded successfully.
- Bill prediction, reminders, payments and the assistant tool are out of scope.
- Use synthetic bill text and disposable accounts only. Local stack, €0 additional spend. No new dependencies.
- Frontend calls go through `authorizedFetch` in `frontend/src/lib/api.ts`.
- Backend gate, from `backend/`: `python -m ruff check app/ tests/` and `python -m pytest tests/ --cov=app --cov-fail-under=65` against a disposable `pgvector/pgvector:pg16` database with the environment from `.github/workflows/ci.yml`.
- Frontend gate, from `frontend/`: `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`.
- Use `Closes #2` in the PR only if all four acceptance checks are verified; otherwise `Part of #2`.

## Review Focus

Inputs and conditions most likely to break it. Each has a test in the task named.

1. **A second account in the same browser.** B signs in after A without a page reload: B never sees A's housemate names, not while B's own list is loading and not by returning to A's document URL. (Tasks 4, 7)
2. **The save succeeds but the reload fails.** The saved split from the API is shown, with a notice; it is not replaced by `Not split yet`. (Tasks 5, 6)
3. **A 409 and then a failed reload.** The selection is kept, saving is blocked, and `Load latest` retries. The panel does not claim to show the latest data. (Tasks 5, 6)
4. **Empty or single-person list.** `housemate_ids` of `[]` or one id: 422, nothing saved; the panel says `Choose at least two people.` (Tasks 1, 3, 6)
5. **A person the server cannot check.** A random id, or another owner's housemate id: 409 `unknown_housemate`, nothing saved. (Task 3)
6. **Duplicate, blank and very long labels.** `""`, `"   "`, 41 characters, a label with a line break: 422. `"aoife "` after `"Aoife"`: 409 `duplicate_label`. 40 `ß` is accepted and its 80-character key is stored whole; 40 `ẞ` after it is a duplicate. The same id twice in one split: 422. (Tasks 2, 3)
7. **A bill with no confirmed revision.** Preview and save: 409 `no_confirmed_bill`; the panel shows `Confirm the bill above before splitting it.` and no controls. (Tasks 3, 6)
8. **A total smaller than the number of people in cents, and a zero total.** €0.03 among four gives 1, 1, 1, 0 cents; €0.00 gives zeros. The sum still equals the total. (Tasks 1, 3)
9. **The revision changes between preview and save**, or after a split was saved. Save: 409 `revision_changed`, nothing saved. A saved split: `stale: true`, unchanged, with its own amount and revision still shown. (Tasks 3, 6, 7)
10. **A stale tab saves after another split was saved**, two saves at once, and shares altered between preview and save. 409 `split_changed` or `shares_changed`; at most one new row. (Task 3)

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/app/services/bill_split.py` (create) | `split_equally`; in Task 3, preview, locked save and latest-split lookup. |
| `backend/tests/test_bill_split.py` (create) | Calculator unit tests and split API tests. |
| `backend/app/models/base.py` (modify) | Add `Housemate` and `BillSplit`. |
| `backend/alembic/versions/015_add_housemates_and_bill_splits.py` (create) | Create and drop both tables. |
| `backend/app/schemas/bill_split.py` (create) | Housemate and split request and response models. |
| `backend/app/schemas/document.py` (modify) | `DocumentDetailOut.bill_split`. |
| `backend/app/services/housemates.py` (create) | List, add and remove an owner's housemates. |
| `backend/app/routers/housemates.py` (create), `backend/app/main.py` (modify) | `/api/v1/housemates` routes and their registration. |
| `backend/tests/test_housemates.py` (create) | Housemate API tests. |
| `backend/app/routers/documents.py` (modify) | Two split routes; `bill_split` in the detail response. |
| `frontend/src/lib/auth.tsx` (modify), `auth.test.tsx` (create) | `accountId` from the token; drop cached queries on sign-in and sign-out. |
| `frontend/src/lib/housemates.ts`, `housemates.test.tsx` (create) | `housematesKey`, `useHousemates`. |
| `frontend/public/sw.js` (modify) | Stop storing and serving API responses (Decision C). |
| `frontend/src/lib/api.ts` (modify) | Housemate and split types and calls; shared error parsing. |
| `frontend/src/lib/billSplit.ts`, `billSplit.test.ts` (create) | Reload that reports failure; storing a saved split in the cached document. |
| `frontend/src/components/BillSplit.tsx`, `BillSplit.test.tsx` (create) | `BillSplitPanel`. |
| `frontend/src/pages/DocumentDetail.tsx` (modify) | Render the panel under `BillReviewPanel` and wire its callbacks. |
| `frontend/e2e/app.spec.ts` (modify) | Extend the bill scenario; add the two-account scenario. |
| `.github/workflows/ci.yml`, `AGENTS.md` (modify) | Seed and pass a second synthetic e2e account. |
| `README.md`, `specs/Repo_Current_State.md`, `specs/Tickets.md`, `specs/MVP_Technical_Design.md` (modify) | Record what is implemented and verified. |

---

### Task 1: The integer-cent calculator

**Files:**
- Create: `backend/app/services/bill_split.py`
- Test: `backend/tests/test_bill_split.py`

**Interfaces:**
- Produces: `split_equally(total_cents: int, count: int) -> list[int]`. Raises `ValueError` if either argument is not an `int` (a `bool` is rejected), if `total_cents < 0`, or if `count < 2`. Uses `divmod` only. Position `i` receives `total_cents // count + (1 if i < total_cents % count else 0)`.

- [ ] **Step 1: Write the failing tests.**

| Test | Assertions |
| --- | --- |
| `test_the_issue_example_gives_the_remainder_to_the_first_three` | `split_equally(12347, 4) == [3087, 3087, 3087, 3086]`. |
| `test_exact_division_has_no_remainder` | `split_equally(12000, 4) == [3000, 3000, 3000, 3000]`; `split_equally(12500, 4) == [3125] * 4`. |
| `test_two_and_five_people` | `split_equally(12347, 2) == [6174, 6173]`; `split_equally(12347, 5) == [2470, 2470, 2469, 2469, 2469]`. |
| `test_totals_smaller_than_the_number_of_people` | `split_equally(3, 4) == [1, 1, 1, 0]`; `split_equally(0, 4) == [0, 0, 0, 0]`. |
| `test_shares_always_sum_to_the_total` | For every `total` in `(0, 1, 2, 99, 100, 101, 12347, 999999999)` and `count` in `range(2, 13)`: `sum(shares) == total`, `len(shares) == count`, `max(shares) - min(shares) <= 1`, `shares == sorted(shares, reverse=True)`, every share is an `int`. |
| `test_invalid_inputs_are_rejected` (parametrised) | Each raises `ValueError`: `(12347, 0)`, `(12347, 1)`, `(12347, -1)`, `(-1, 4)`, `(123.47, 4)`, `(12347, 4.0)`, `("12347", 4)`, `(True, 4)`. |

- [ ] **Step 2: Run to see them fail.** Run: `python -m pytest tests/test_bill_split.py -v` · Expected: import error.

- [ ] **Step 3: Implement `split_equally`.**

- [ ] **Step 4: Run.** `python -m ruff check app/ tests/` and `python -m pytest tests/test_bill_split.py -v` · Expected: clean; all pass.

- [ ] **Step 5: Commit.** `git commit -m "Add the integer-cent equal split calculator"`

---

### Task 2: Housemates saved per owner

**Files:**
- Modify: `backend/app/models/base.py`, `backend/app/main.py`
- Create: `backend/alembic/versions/015_add_housemates_and_bill_splits.py`, `backend/app/schemas/bill_split.py`, `backend/app/services/housemates.py`, `backend/app/routers/housemates.py`
- Test: `backend/tests/test_housemates.py`

**Interfaces:**
- Produces, in `models/base.py` after `BillRevision`, in its style:
  - `Housemate`, table `housemates`: `id: uuid` pk, `user_id: uuid` (FK `users.id`, `ondelete="CASCADE"`, not null), `label: str` (`String(40)`, not null), `label_key: str` (`Text`, not null; the whole case-folded label, never truncated), `position: int` (not null), `created_at`. Unique constraint `uq_housemates_user_label_key` on `(user_id, label_key)`.
  - `BillSplit`, table `bill_splits`: `id: uuid` pk, `document_id: uuid` (FK `documents.id`, CASCADE, not null), `bill_revision_id: uuid` (FK `bill_revisions.id`, CASCADE, not null), `split_number: int`, `rule: str` (`String(20)`), `total_cents: int`, `shares: list` (JSON, not null; `[{"housemate_id": str, "label": str, "cents": int}, ...]` in split order), `created_at`. Unique constraint `uq_bill_splits_document_split` on `(document_id, split_number)`.
  - No ORM relationships; the database cascades remove the rows.
- Produces, migration `015` (`down_revision = "014"`), in the style of `014_add_bill_revisions.py`, with `label_key` as `sa.Text()`; `downgrade` drops `bill_splits` then `housemates`.
- Produces, in `schemas/bill_split.py`:
  - `MAX_HOUSEMATES = 12`, `MAX_LABEL_LENGTH = 40`.
  - `HousemateCreate`: `label: str`. A field validator applies `unicodedata.normalize("NFC", ...)` then `.strip()`, and rejects a result that is empty, longer than 40 characters (`len`, which counts code points) or not `str.isprintable()`.
  - `HousemateOut`: `id`, `label`, `position: int`, `created_at`.
- Produces, in `services/housemates.py`:
  - `class HousemateConflict(Exception)` with `code` and `message`.
  - `def label_key(label: str) -> str`, returning `label.casefold()`.
  - `async def list_housemates(db: AsyncSession, user_id: UUID) -> list[HousemateOut]`, ordered by `position`.
  - `async def add_housemate(db: AsyncSession, user_id: UUID, label: str) -> HousemateOut`. Locks the caller's `users` row (`with_for_update`) so the count and position are consistent, then: 12 already saved → conflict `too_many_housemates`, "You can save up to 12 housemates."; `label_key(label)` already present, or `IntegrityError` on insert → conflict `duplicate_label`, "That name is already in your list."; otherwise inserts with `position` one more than the highest and commits. Every conflict rolls back.
  - `async def remove_housemate(db: AsyncSession, user_id: UUID, housemate_id: UUID) -> bool` (`False` when the caller has no such housemate).
- Produces, HTTP, router registered in `main.py` with prefix `/api/v1/housemates`:
  - `GET ""` → 200 `list[HousemateOut]`.
  - `POST ""` with `HousemateCreate` → 201 `HousemateOut`; 422 invalid label; 409 `{"code", "message"}` in `detail`.
  - `DELETE "/{housemate_id}"` → 204; 404 "Housemate not found" when not the caller's.

- [ ] **Step 1: Write the failing tests** in `tests/test_housemates.py`, with the client, header and cleanup helpers used in `test_bill_revisions.py` and accounts from `tests.accounts`. "Code" means `response.json()["detail"]["code"]`.

| Test | Assertions |
| --- | --- |
| `test_owner_adds_lists_and_removes_housemates` | POST `Aoife`, `Ben`, `Chidi`, `Dara` → 201 each. GET → those four labels in that order with positions increasing. DELETE Ben → 204; GET → `Aoife`, `Chidi`, `Dara`. POST `Ben` again → 201 and it is last. |
| `test_labels_are_trimmed` | POST `"  Aoife  "` → 201 with `label == "Aoife"`. A 40-character label → 201. |
| `test_blank_long_and_unprintable_labels_are_rejected` (parametrised) | `""`, `"   "`, `"x" * 41`, `"ß" * 41`, `"Aoife\nBen"`, missing `label`, `label` `null` → 422; GET → `[]`. |
| `test_duplicate_labels_are_rejected` | POST `Aoife`, then `aoife `, then `AOIFE` → 409, code `duplicate_label`; GET has one housemate. |
| `test_a_forty_character_label_keeps_its_full_case_folded_key` | POST `"ß" * 40` → 201; `label == "ß" * 40` and `len(label) == 40`. The row's `label_key == "s" * 80`. POST `"ẞ" * 40` (U+1E9E) → 409, code `duplicate_label`. POST `"ß" * 39 + "x"` → 201 (a key that differs only after its 40th character is not a duplicate). GET has two housemates. |
| `test_no_more_than_twelve_housemates` | Twelve POSTs → 201; the thirteenth → 409, code `too_many_housemates`; GET has twelve. |
| `test_concurrent_adds_of_one_label_save_exactly_one` | `asyncio.gather` two POSTs of `Aoife` → statuses sorted `[201, 409]`; GET has one. |
| `test_another_account_cannot_see_or_remove_housemates` | After the owner adds `Aoife`: the other account's GET → `[]`; its DELETE of that id → 404; the owner's GET still has `Aoife`. The other account can add its own `Aoife` → 201. A GET without a token is refused with the same status the documents list gives without one. |

- [ ] **Step 2: Run to see them fail.** Run: `python -m pytest tests/test_housemates.py -v` · Expected: 404s or import errors.

- [ ] **Step 3: Add the models, migration, schemas, service and router.**

- [ ] **Step 4: Run the migration round trip on a fresh database.** Run: `python -m alembic upgrade head && python -m alembic downgrade 014 && python -m alembic upgrade head && python -m alembic downgrade base && python -m alembic upgrade head` · Expected: every command exits 0.

- [ ] **Step 5: Run the backend gate.** Expected: ruff clean; all tests pass; coverage at or above 65%.

- [ ] **Step 6: Commit.** `git commit -m "Save housemate labels in the owner's account"`

---

### Task 3: Preview, save and reopen a split

**Files:**
- Modify: `backend/app/schemas/bill_split.py`, `backend/app/schemas/document.py`, `backend/app/services/bill_split.py`, `backend/app/routers/documents.py` (`get_document`; two handlers after `confirm_bill_revision`)
- Test: `backend/tests/test_bill_split.py`

**Interfaces:**
- Consumes: `split_equally` (Task 1); `Housemate`, `BillSplit`, `MAX_HOUSEMATES` (Task 2); `latest_revision`, `to_cents`, `from_cents`, `_get_doc_or_404` (existing).
- Produces, in `schemas/bill_split.py`:
  - `BillSplitRequest`: `bill_revision: int` (`ge=1`; the revision number on screen when splitting started), `rule: Literal["equal"]`, `housemate_ids: list[UUID]` (2 to 12 items; a validator rejects repeated ids).
  - `BillShare`: `housemate_id: UUID`, `label: str`, `amount: str`.
  - `BillSplitSave(BillSplitRequest)`: adds `base_split: int` (`ge=0`; `0` means no split existed when splitting started) and `reviewed: list[BillShare]` (the shares the preview showed).
  - `BillSplitPreview`: `bill_revision: int`, `rule: str`, `total: str`, `remainder_cents: int`, `shares: list[BillShare]` (in the order of `housemate_ids`).
  - `BillSplitOut(BillSplitPreview)`: adds `id`, `document_id`, `split_number: int`, `stale: bool`, `created_at`.
  - `DocumentDetailOut.bill_split: BillSplitOut | None = None` in `schemas/document.py`.
- Produces, in `services/bill_split.py`:
  - `class BillSplitConflict(Exception)` with `code` and `message`.
  - `async def preview_split(db: AsyncSession, doc: Document, user_id: UUID, request: BillSplitRequest) -> BillSplitPreview`. Writes nothing.
  - `async def save_split(db: AsyncSession, doc: Document, user_id: UUID, request: BillSplitSave) -> BillSplitOut`.
  - `async def latest_split(db: AsyncSession, document_id: UUID) -> BillSplitOut | None`. `stale` is `True` when the split's `bill_revision_id` is not the id of `latest_revision(...)`. `bill_revision` is the number of the revision the split used, `total` and the share amounts come from the stored cents, and `remainder_cents` is `total_cents % len(shares)`.
  - `async def _current_split_number(db: AsyncSession, document_id: UUID) -> int` (highest, `0` when none).
- Produces, HTTP:
  - `POST /api/v1/documents/{document_id}/bill-splits/preview` with `BillSplitRequest` → 200 `BillSplitPreview`.
  - `POST /api/v1/documents/{document_id}/bill-splits` with `BillSplitSave` → 201 `BillSplitOut` (`stale` is `false`).
  - Both: 404 non-owner; 422 invalid body; 409 with `detail == {"code": <code>, "message": <message>}`.
  - `GET /api/v1/documents/{document_id}` includes `bill_split`, independent of `bill_review` and `processing_status`.

`save_split` runs these steps in the request's single transaction, in order, and commits only at the end. `preview_split` runs steps 2, 3, 5 and 6 without the lock.

1. Lock the document row with the same statement `save_revision` uses, so a concurrent confirmation or split waits.
2. `latest_revision(db, doc.id)` is `None`: conflict `no_confirmed_bill`, "Confirm the bill before splitting it."
3. Its `revision_number != request.bill_revision`: conflict `revision_changed`, "The confirmed bill changed while you were splitting it."
4. `_current_split_number(...) != request.base_split`: conflict `split_changed`, "Another split was saved while you were reviewing."
5. Select `Housemate` rows where `user_id == user_id` and `id` is in `housemate_ids`. If any id is missing: conflict `unknown_housemate`, "A selected housemate is not in your list."
6. `cents = split_equally(to_cents(revision.amount_due), len(housemate_ids))`, paired with the housemates in the order of `housemate_ids`. If `sum(cents)` is not the revision's total, raise `RuntimeError` (an invariant, not a user error).
7. If the computed shares as `BillShare` values `!= request.reviewed`: conflict `shares_changed`, "The shares no longer match what you reviewed."
8. Insert with `split_number = request.base_split + 1`, `bill_revision_id` of the revision from step 2, `rule="equal"`, `total_cents` and the `shares` snapshot. On `IntegrityError` (backstop for the lock), conflict `split_changed`.

Every conflict path rolls back. The router maps `BillSplitConflict` to `HTTPException(409, {"code": exc.code, "message": exc.message})` and passes `user_id` from the session, never from the body.

- [ ] **Step 1: Write the failing tests** in `tests/test_bill_split.py`, below the calculator tests. Reuse `BILL` and the helper shapes from `test_bill_revisions.py`. Local helpers: `_confirm(client, document_id, owner_id, amount="123.47", base_revision=0)` posts a bill revision with the current `bill_review` and returns its JSON; `_housemates(client, user_id, *labels)` posts each label and returns the ids in order; `_preview(...)` and `_save(...)` post to the two routes; `_split_rows(document_id)` returns the `BillSplit` rows in `split_number` order. `REQUEST = {"bill_revision": 1, "rule": "equal"}`. "Four" means `Aoife`, `Ben`, `Chidi`, `Dara` added in that order. A "full save" is `{**REQUEST, "housemate_ids": ids, "base_split": 0, "reviewed": preview["shares"]}`.

| Test | Assertions |
| --- | --- |
| `test_the_confirmed_amount_is_previewed_without_saving` | Confirm `123.47`, add four. Preview → 200; `[s["amount"] for s in shares] == ["30.87", "30.87", "30.87", "30.86"]`; labels are the four in order; each `housemate_id` matches; `total == "123.47"`; `remainder_cents == 3`; `bill_revision == 1`; `rule == "equal"`. Zero split rows. |
| `test_exact_division_and_other_group_sizes` (parametrised) | Confirm `120.00`, four → `30.00` ×4, `remainder_cents == 0`. Confirm `123.47`, two → `61.74`, `61.73`. Confirm `123.47`, five (add `Eoin`) → `24.70`, `24.70`, `24.69`, `24.69`, `24.69`. In each, the amounts converted with `to_cents` sum to the confirmed total. |
| `test_small_and_zero_totals` (parametrised) | Confirm `0.03`, four → `0.01`, `0.01`, `0.01`, `0.00`, `remainder_cents == 3`. Confirm `0.00`, four → `0.00` ×4, `remainder_cents == 0`, `total == "0.00"`. |
| `test_the_split_uses_the_confirmed_amount_not_the_ocr_candidate` | Confirm `125.00` (the transcript says `123.47`). Preview → `31.25` ×4, `total == "125.00"`. |
| `test_the_order_sent_decides_who_gets_the_remainder` | Confirm `123.47`. Preview with the four ids reversed → labels `Dara`, `Chidi`, `Ben`, `Aoife` with amounts `30.87`, `30.87`, `30.87`, `30.86`. |
| `test_owner_saves_the_reviewed_split_and_reopens_it` | Preview, then full save → 201; `split_number == 1`, `stale is False`, `document_id` of the document, `shares == preview["shares"]`, `total == "123.47"`. The row has `total_cents == 12347`, `rule == "equal"`, `bill_revision_id` of revision 1 and `[s["cents"] for s in shares] == [3087, 3087, 3087, 3086]`. GET document → `bill_split` equals the POST body. |
| `test_a_later_split_adds_a_row_and_keeps_the_first` | Save with four, then preview and save with the first two ids and `base_split` `1` → `split_number == 2`. Two rows; row 1's shares unchanged. GET returns split 2. |
| `test_a_bill_without_a_confirmed_revision_cannot_be_split` | No confirmation, four added. Preview → 409, code `no_confirmed_bill`. Save with any `reviewed` → 409, same code. Zero rows. GET → `bill_split is None`. |
| `test_incomplete_inputs_are_rejected` (parametrised over both routes where the field applies) | Each → 422 and zero rows: `housemate_ids` `[]`; one id; the same id twice; thirteen ids; `housemate_ids` missing; a label string in place of an id; `rule` missing; `rule` `"by_usage"`; `bill_revision` `0`; `bill_revision` missing; save without `reviewed`; save with `base_split` `-1`. |
| `test_a_person_the_server_cannot_find_is_rejected` (parametrised) | With one id replaced by a random UUID, and by a housemate id belonging to the other account: preview → 409, code `unknown_housemate`; save → 409, same code. Zero rows. |
| `test_a_newer_revision_marks_the_saved_split_stale` | Save a split on revision 1, then confirm `126.50` with `base_revision` `1`. GET → `confirmed_bill["revision_number"] == 2`; `bill_split["stale"] is True`, `bill_split["bill_revision"] == 1`, `total == "123.47"`, shares still `30.87`, `30.87`, `30.87`, `30.86`. One split row, unchanged. |
| `test_a_split_reviewed_against_an_older_revision_is_rejected` | Preview on revision 1, confirm revision 2, then the full save with `bill_revision` `1` → 409, code `revision_changed`. A preview with `bill_revision` `1` → 409, same code. Zero rows. |
| `test_a_stale_tab_cannot_save_over_another_split` | Full save (split 1), then the same body again with `base_split` `0` → 409, code `split_changed`. One row. |
| `test_concurrent_saves_store_exactly_one_split` | `asyncio.gather` two identical full saves → statuses sorted `[201, 409]`, the 409's code is `split_changed`. One row. |
| `test_shares_that_differ_from_the_server_result_are_rejected` (parametrised) | Full save with `reviewed[0]["amount"]` set to `"30.88"`; with `reviewed[0]["label"]` set to `"Zed"`; with `reviewed` reversed; with one share removed → 409, code `shares_changed`. Zero rows. |
| `test_a_split_save_waits_for_the_document_lock` | In a second session run `select(Document).where(Document.id == document_id).with_for_update()` without committing. Start the full save as a task; after `asyncio.sleep(0.5)` it is not done. Commit the second session; the save returns 201. Structure as `test_a_transcript_edit_in_progress_blocks_the_save`. |
| `test_a_duplicate_split_number_is_a_conflict` | After one save, monkeypatch `app.services.bill_split._current_split_number` to return `0`. Full save with `base_split` `0` → 409, code `split_changed`. One row. |
| `test_removing_a_housemate_keeps_the_saved_split` | Save, then DELETE `Ben`. GET → `bill_split` unchanged, still listing `Ben` with `30.87`, `stale is False`. A new preview with Ben's id → 409, code `unknown_housemate`. |
| `test_a_saved_split_reopens_while_the_document_is_reprocessed` | Save, then set `processing_status="processing"` in the database. GET → `bill_review is None`; `confirmed_bill` and `bill_split` equal what was saved. |
| `test_another_account_cannot_preview_save_or_read_a_split` | The other account's preview and save on the owner's document, using its own housemates → 404; zero rows. After the owner saves, the other account's GET document → 404. |

- [ ] **Step 2: Run to see them fail.** Run: `python -m pytest tests/test_bill_split.py -v` · Expected: the new tests fail (routes do not exist).

- [ ] **Step 3: Add the schemas, the service functions and the two routes; add `bill_split` to `get_document`** using `latest_split`.

- [ ] **Step 4: Run the backend gate.** Expected: ruff clean; all tests pass; coverage at or above 65%.

- [ ] **Step 5: Commit.** `git commit -m "Preview, save and reopen a bill split bound to its revision"`

---

### Task 4: Housemate data scoped to the signed-in account

**Files:**
- Modify: `frontend/src/lib/auth.tsx`, `frontend/src/lib/api.ts` (types and `getHousemates` only), `frontend/public/sw.js`
- Create: `frontend/src/lib/auth.test.tsx`, `frontend/src/lib/housemates.ts`, `frontend/src/lib/housemates.test.tsx`

**Interfaces:**
- Produces, in `api.ts`: `interface Housemate { id: string; label: string; position: number; created_at: string }` and `getHousemates(): Promise<Housemate[]>` (throws when `!res.ok`).
- Produces, in `auth.tsx`:
  - `export function accountIdFromToken(token: string | null): string | null`. Decodes the token's second segment as base64url JSON and returns its `sub` when that is a non-empty string; returns `null` for a missing or malformed token. No library.
  - `AuthContextType.accountId: string | null`, equal to `accountIdFromToken(token)`.
  - `login` and `logout` each call `queryClient.clear()` on the shared client from `lib/queryClient` before changing the token.
- Produces, in `housemates.ts`:
  - `housematesKey(accountId: string | null) = ['housemates', accountId] as const`.
  - `useHousemates(enabled: boolean)`, returning `useQuery({ queryKey: housematesKey(accountId), queryFn: getHousemates, enabled: enabled && accountId !== null })` with `accountId` from `useAuth()`.
- Produces, in `sw.js` (Decision C): the fetch handler returns without calling `respondWith` for any URL containing `/api/`; `CACHE_NAME` becomes `'docvault-v2'`; `install` calls `self.skipWaiting()`; a new `activate` handler deletes every cache whose name is not `CACHE_NAME` and calls `self.clients.claim()`. Static asset handling is unchanged.

Nothing else may build a housemates query key; later tasks use `housematesKey` and `useHousemates`.

- [ ] **Step 1: Write the failing tests.** A test token is `` `h.${btoa(JSON.stringify({ sub }))}.s` ``. Tests render under `QueryClientProvider` with the shared `queryClient` and `AuthProvider`, with `vi.mock('./api')` for `getHousemates`, and call `queryClient.clear()` and `localStorage.clear()` in `afterEach`.

In `auth.test.tsx`:

| Test | Assertions |
| --- | --- |
| `reads the account id from the token` | `accountIdFromToken(token('a1')) === 'a1'`; `null`, `''`, `'not-a-token'`, a token whose payload is not JSON, and one without `sub` → `null`. |
| `signing in and signing out drop every cached query` | Seed `queryClient.setQueryData(['document', 'd1'], {...})` and `(['housemates', 'a1'], [...])`. `logout()` → `queryClient.getQueryCache().getAll()` is empty. Seed again, `login(token('b1'))` → empty, and `accountId === 'b1'`. |

In `housemates.test.tsx`, with a probe component that records `data` from `useHousemates(true)` on every render:

| Test | Assertions |
| --- | --- |
| `loads the signed-in account's housemates under its own key` | Signed in as `a1`, `getHousemates` resolves `[Aoife]` → the probe shows `Aoife`; `queryClient.getQueryData(['housemates', 'a1'])` holds it. |
| `a second account never receives the first account's housemates` | As above for `a1`. Then `logout()` and `login(token('b1'))` with `getHousemates` now returning a promise that is not yet resolved. Every value the probe recorded after the logout is `undefined`; none contains `Aoife`. Resolve with `[]` → the probe records `[]`. `getQueryData(['housemates', 'a1'])` is `undefined`. |
| `the key alone separates accounts` | Without calling `logout` or `login`: seed `['housemates', 'a1']` with `[Aoife]`, then render with `localStorage` holding `token('b1')` and `getHousemates` pending. The probe records `undefined`, never `Aoife`. (This fails if the key is `['housemates']`.) |
| `does not fetch when signed out or disabled` | No token → `getHousemates` not called. `useHousemates(false)` signed in → not called. |

- [ ] **Step 2: Run to see them fail.** Run: `npm test -- auth housemates` · Expected: FAIL.

- [ ] **Step 3: Implement the `auth.tsx` changes, `housemates.ts`, and the `api.ts` items.**

- [ ] **Step 4: Run the frontend gate.** Expected: all pass, including every existing test that renders `AuthProvider`.

- [ ] **Step 5: Change `sw.js`** as specified. Its check is in Task 7 (`no API response is stored by the service worker`), because it needs a browser.

- [ ] **Step 6: Commit.** `git commit -m "Scope cached housemate data to the signed-in account"`

---

### Task 5: API client and reload helpers

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/billSplit.ts`, `frontend/src/lib/billSplit.test.ts`

**Interfaces:**
- Consumes: `Housemate`, `getHousemates`, `housematesKey` (Task 4).
- Produces, in `api.ts`:
  - `interface BillShare { housemate_id: string; label: string; amount: string }`
  - `interface BillSplitRequest { bill_revision: number; rule: 'equal'; housemate_ids: string[] }`
  - `interface BillSplitSave extends BillSplitRequest { base_split: number; reviewed: BillShare[] }`
  - `interface BillSplitPreview { bill_revision: number; rule: string; total: string; remainder_cents: number; shares: BillShare[] }`
  - `interface BillSplit extends BillSplitPreview { id: string; document_id: string; split_number: number; stale: boolean; created_at: string }`
  - `Document.bill_split?: BillSplit | null`
  - `addHousemate(label: string): Promise<Housemate>`, `removeHousemate(id: string): Promise<void>`, `previewBillSplit(documentId: string, body: BillSplitRequest): Promise<BillSplitPreview>`, `saveBillSplit(documentId: string, body: BillSplitSave): Promise<BillSplit>`. Each throws `ApiError(status, message, code)` when `!res.ok`.
  - Move the error parsing in `confirmBill` into `async function apiErrorFrom(res: Response, fallback: string): Promise<ApiError>` and use it in `confirmBill`, `getHousemates` and the four new calls. `confirmBill`'s behaviour does not change.
- Produces, in `billSplit.ts`:
  - `refreshBillData(queryClient: QueryClient, documentId: string, accountId: string | null): Promise<void>`. Refetches `['document', documentId]` and `housematesKey(accountId)` with `{ throwOnError: true }` and **rejects if either fails**. It resolves only when both hold fresh data.
  - `storeSavedSplit(queryClient: QueryClient, documentId: string, split: BillSplit): void`. `setQueryData(['document', documentId], doc => doc && { ...doc, bill_split: split })`.
  - `storeHousemates(queryClient: QueryClient, accountId: string | null, update: (list: Housemate[]) => Housemate[]): void`. `setQueryData(housematesKey(accountId), list => update(list ?? []))`.

- [ ] **Step 1: Write the failing tests** in `billSplit.test.ts`, with a `QueryClient` whose queries have `retry: false`, both queries seeded with `prefetchQuery` and mocked query functions.

| Test | Assertions |
| --- | --- |
| `resolves when the document and the housemates both reload` | Both query functions called again; resolves `undefined`. |
| `rejects when the document cannot be reloaded` | The document query function rejects → `refreshBillData` rejects. |
| `rejects when the housemates cannot be reloaded` | The housemates query function rejects → `refreshBillData` rejects, although the document reloaded. |
| `reloads the housemates of the given account only` | With `['housemates', 'a1']` and `['housemates', 'b1']` both seeded, `refreshBillData(qc, 'doc-1', 'a1')` calls the query function for `a1` and not for `b1`. |
| `stores a saved split in the cached document` | After `storeSavedSplit`, `getQueryData(['document', 'doc-1']).bill_split` is the split and the other fields are unchanged. With no cached document, nothing is created. |
| `stores an added and a removed housemate under the account's key` | `storeHousemates(qc, 'a1', list => [...list, eoin])` appends; a filter removes; `['housemates', 'b1']` is untouched. |

- [ ] **Step 2: Run to see them fail.** Run: `npm test -- billSplit` · Expected: FAIL, module not found.

- [ ] **Step 3: Add the `api.ts` items and `billSplit.ts`.**

- [ ] **Step 4: Run the frontend gate.** Expected: all pass, including the existing `billConfirm` and `BillReview` tests.

- [ ] **Step 5: Commit.** `git commit -m "Add the bill split client and reload helpers"`

---

### Task 6: The Bill split panel

**Files:**
- Create: `frontend/src/components/BillSplit.tsx`, `frontend/src/components/BillSplit.test.tsx`
- Modify: `frontend/src/pages/DocumentDetail.tsx`

**Interfaces:**
- Consumes: the Task 4 and Task 5 types, hook and helpers.
- Produces:

```ts
BillSplitPanel(props: {
  confirmed: BillRevision | null
  split: BillSplit | null
  housemates: Housemate[] | undefined   // undefined until this account's list has loaded
  housematesFailed: boolean
  onAddHousemate: (label: string) => Promise<void>
  onRemoveHousemate: (id: string) => Promise<void>
  onPreview: (body: BillSplitRequest) => Promise<BillSplitPreview>   // the API call only
  onSave: (body: BillSplitSave) => Promise<BillSplit>                // the API call only
  onRefresh: () => Promise<void>   // rejects unless the document and the housemates both reloaded
})
```

It needs no router, query or toast provider. A `section` labelled by the heading `Bill split`, styled as the bill panel.

**Wiring in `DocumentDetail.tsx`.** `const housemates = useHousemates(!!(doc?.bill_review || doc?.confirmed_bill))`, placed with the other hooks. Render `<BillSplitPanel>` directly after `<BillReviewPanel>` under the same condition, with:
- `confirmed={doc.confirmed_bill ?? null}`, `split={doc.bill_split ?? null}`, `housemates={housemates.data}`, `housematesFailed={housemates.isError}`.
- `onPreview={body => previewBillSplit(doc.id, body)}`.
- `onSave`: `const saved = await saveBillSplit(doc.id, body); storeSavedSplit(queryClient, doc.id, saved); return saved`.
- `onRefresh={() => refreshBillData(queryClient, doc.id, accountId)}`.
- `onAddHousemate`: `const created = await addHousemate(label); storeHousemates(queryClient, accountId, list => [...list, created])`. `onRemoveHousemate`: `await removeHousemate(id); storeHousemates(queryClient, accountId, list => list.filter(h => h.id !== id))`. Neither depends on a refetch.

**Session capture.** Clicking `Split this bill` or `Split again` starts a session that stores `confirmed.revision_number`, `confirmed.amount_due` and the displayed split's `split_number` (`0` if none) as they are at that moment. Every request in the session sends that revision number; the save sends that split number as `base_split` and the preview's `shares` as `reviewed`. The review step shows only the stored preview. Prop changes during a session do not alter what is being reviewed. The people step shows the live `housemates` prop; a newly added person is ticked, and a removed id is dropped from the ticked set.

**The displayed split.** The panel keeps the split returned by its last successful `onSave` in state. The displayed split is whichever of that and `props.split` has the higher `split_number` (`props.split` on a tie).

The panel's views. Exact copy, because the tests and the browser scenarios match on it. Amounts are shown as `€` followed by the API string. `<date>` is `created_at` formatted as in the bill panel.

| View | Content |
| --- | --- |
| **Not confirmed** (`confirmed` is `null`) | `Confirm the bill above before splitting it.` No controls. |
| **Not split** (`confirmed`, no displayed split, no session) | `Not split yet`. Button `Split this bill`. |
| **People** (session, before a preview) | `Splitting €<amount> from revision <n>`. A group labelled `People sharing this bill`: one checkbox per housemate in list order, labelled with the name, each with a button whose accessible name is `Remove <label>`. An empty list: `Add the people who share this bill.` `housemates` undefined and not failed: `Loading your housemates…` and no checkboxes. `housematesFailed`: `Your housemates could not be loaded.` and button `Load latest` (calls `onRefresh`). A text input labelled `Add a housemate` with button `Add`. The rule: `Rule: equal split. Everyone pays the same. Leftover cents go one each to the first people in the order shown.` Buttons `Calculate shares` (disabled until the housemates have loaded) and `Cancel`. At the start all housemates are ticked, except that when a split is displayed only the ids in its shares that are still in the list are ticked. |
| **Review** (session, preview received) | Heading `Confirm this split`. `Equal split of €<total> from revision <n>`. An ordered list, one item per share in order: `<label>` and `€<amount>`. The remainder sentence. `Contributions total €<total>, the confirmed amount.` Buttons `Save split` and `Back`. |
| **Saved** (displayed split, no session) | `Saved · split <n> · <date>`. The same line, list, remainder sentence and `Contributions total €<total>.` If the displayed split is stale: notice `The confirmed bill is now revision <confirmed.revision_number> (€<confirmed.amount_due>). This split uses revision <split.bill_revision> and was not recalculated.` Button `Split again`. |

Remainder sentence, from `remainder_cents`: `0` → `The total divides exactly.`; `1` → `1 leftover cent went to the first person in this order.`; `n` → `<n> leftover cents went one each to the first <n> people in this order.`

Input messages, each in a `role="alert"` element:
- `Add` with an empty or blank name: `Enter a name.` More than 40 characters after trimming, counted as `[...label].length`: `Use 40 characters or fewer.` Neither calls `onAddHousemate`.
- `onAddHousemate` rejects with `ApiError` code `duplicate_label`: `That name is already in your list.`; code `too_many_housemates`: `You can save up to 12 housemates.`; anything else: `Could not add that name. Try again.` On success the input clears.
- `onRemoveHousemate` rejects: `Could not remove that name. Try again.`
- `Calculate shares` with fewer than two ticked: `Choose at least two people.` `onPreview` is not called.

`onSave` is called only from `Save split`. While `onPreview`, `onSave` or `onRefresh` is pending, the button that started it is disabled.

**Outcomes of `Save split` and `Calculate shares`.** The save or preview result and the reload result are handled separately.

*What happened*, chosen by the 409's `code`:
- `revision_changed`: `The confirmed bill changed while you were splitting it.`
- `split_changed`: `Another split was saved while you were reviewing.`
- `unknown_housemate`: `Someone you selected is no longer in your list.`
- `shares_changed`: `The shares no longer match what you reviewed.`
- `no_confirmed_bill`: `This bill has no confirmed values.`
- any other or missing code: `This bill changed while you were splitting it.`

| Outcome | Behaviour |
| --- | --- |
| **Preview succeeded** | Show the review view. `onRefresh` is not called. |
| **Save succeeded** | End the session and show the saved view with the split `onSave` returned. Then call `onRefresh`. |
| **Save succeeded, reload failed** | The saved view stays, showing the returned split. Notice in a `role="status"` element: `The split was saved. The rest of this page could not be refreshed and may be out of date.` Button `Refresh` calls `onRefresh` again; the notice goes when it succeeds. |
| **409, reload succeeded** | Call `onRefresh` first. Then end the session, discard the selection, show the view that fits the fresh props, and show in a `role="alert"` element: `<what happened> Nothing was saved. The latest version is shown here.` |
| **409, reload failed** | Keep the session, the step and the ticked selection. Show in a `role="alert"` element: `<what happened> Nothing was saved. The latest version could not be loaded, so your selection has been kept.` Button `Load latest`. `Calculate shares` and `Save split` are disabled. |
| **`Load latest` fails again** | Same state; the alert reads `<what happened> Nothing was saved. The latest version still could not be loaded. Try again.` |
| **`Load latest` succeeds** | If the fresh `confirmed` is `null`, end the session. Otherwise re-capture the session from the fresh props (revision number, amount, displayed split number), drop the preview, keep the ticked ids that are still in the fresh list, show the people view, re-enable `Calculate shares`, and show: `<what happened> Nothing was saved. The latest version is loaded and your selection has been kept. Calculate the shares again.` |
| **Any other error** (not a 409) | Stay on the current step, keep the selection, and show `Could not calculate the shares. Try again.` (preview) or `Could not save. Try again.` (save). `onRefresh` is not called. |

An alert clears when the owner starts a new session, or calculates shares successfully.

- [ ] **Step 1: Write the failing tests** in `BillSplit.test.tsx`, set up as `BillReview.test.tsx`. Fixtures: `confirmed` at revision 1 with `amount_due: '123.47'`; `four` = housemates `Aoife`, `Ben`, `Chidi`, `Dara` with ids `h1` to `h4`; `preview` = `{ bill_revision: 1, rule: 'equal', total: '123.47', remainder_cents: 3, shares: [h1 Aoife 30.87, h2 Ben 30.87, h3 Chidi 30.87, h4 Dara 30.86] }`; `saved` = `preview` plus `id`, `document_id`, `split_number: 1`, `stale: false`, `created_at: '2026-11-12T10:00:00'`. Defaults: `housemates={four}`, `housematesFailed={false}`, `onPreview` resolving `preview`, `onSave` resolving `saved`, `onRefresh` resolving. `conflict(code)` is `new ApiError(409, 'changed', code)`.

| Test | Assertions |
| --- | --- |
| `asks for a confirmed bill first` | `confirmed={null}`: the region named `Bill split` contains `Confirm the bill above before splitting it.` and no button. |
| `the four-person acceptance split is saved only after the shares are reviewed` | `Not split yet` is shown. Click `Split this bill`: `Splitting €123.47 from revision 1`, four ticked checkboxes and the rule text are shown. Click `Calculate shares`: `onPreview` called once with `{ bill_revision: 1, rule: 'equal', housemate_ids: ['h1', 'h2', 'h3', 'h4'] }`; `onRefresh` not called. `Confirm this split`, four list items in order with `€30.87`, `€30.87`, `€30.87`, `€30.86`, `3 leftover cents went one each to the first 3 people in this order.` and `Contributions total €123.47, the confirmed amount.` are shown; `onSave` not called. Click `Save split`: `onSave` called once with `{ bill_revision: 1, rule: 'equal', housemate_ids: ['h1', 'h2', 'h3', 'h4'], base_split: 0, reviewed: preview.shares }`. |
| `only ticked people are sent, in list order` | Untick `Ben`; `Calculate shares` → `housemate_ids: ['h1', 'h3', 'h4']`. |
| `fewer than two people cannot be split` | With `housemates={[]}`: `Add the people who share this bill.`; `Calculate shares` shows `Choose at least two people.` With `four`, untick three: the same message. `onPreview` not called. |
| `waits for the housemates to load and offers a retry when they fail` | `housemates={undefined}`: `Loading your housemates…`, no checkbox, `Calculate shares` disabled. `housematesFailed`: `Your housemates could not be loaded.`; clicking `Load latest` calls `onRefresh`. |
| `adds and removes housemates` | Type `Eoin`, click `Add`: `onAddHousemate` called with `'Eoin'` and the input is empty. `rerender` with a fifth housemate: `Eoin` is listed and ticked. Click `Remove Ben`: `onRemoveHousemate` called with `'h2'`. |
| `blank, long and duplicate names are explained` | `Add` with `'   '` → `Enter a name.`; with 41 characters → `Use 40 characters or fewer.`; neither calls `onAddHousemate`. `'ß'.repeat(40)` is passed to `onAddHousemate`. With `onAddHousemate` rejecting `conflict('duplicate_label')` → `That name is already in your list.`; rejecting `conflict('too_many_housemates')` → `You can save up to 12 housemates.` |
| `exact division and a single leftover cent are worded correctly` | Preview with `remainder_cents: 0` → `The total divides exactly.`; with `remainder_cents: 1` → `1 leftover cent went to the first person in this order.` |
| `a saved split reopens with its order, rule and total` | `split={saved}`: `Saved · split 1 · 12 November 2026`, `Equal split of €123.47 from revision 1`, four list items in order, the remainder sentence, `Contributions total €123.47.`, button `Split again`; no stale notice. |
| `a split from an older revision is shown as stale and not recalculated` | `confirmed` at revision 2 with `amount_due: '126.50'`, `split={{ ...saved, stale: true }}`: the notice `The confirmed bill is now revision 2 (€126.50). This split uses revision 1 and was not recalculated.`; the list still shows `€30.87` and the total line still says `€123.47`. |
| `the save carries the revision and split captured when splitting started` | With `split={saved}`: click `Split again`, then `rerender` with `confirmed` at revision 2 and a `split` at `split_number: 2`. `Calculate shares` → `onPreview` called with `bill_revision: 1`. `Save split` → `onSave` called with `bill_revision: 1` and `base_split: 1`. |
| `splitting again starts from the people in the saved split` | `split` whose shares are `h1` and `h3` only: after `Split again`, `Aoife` and `Chidi` are ticked, `Ben` and `Dara` are not. |
| `a successful save shows the returned split and then refreshes` | `split` stays `null` in the props. After `Save split`: `Saved · split 1`, four list items and `Contributions total €123.47.` are shown; `onRefresh` called once; no status notice. |
| `a successful save is shown even when the refresh fails` | `onRefresh` rejects; `split` stays `null`. After `Save split`: `Saved · split 1` and the four shares are shown, `Not split yet` is not, and a `role="status"` element reads `The split was saved. The rest of this page could not be refreshed and may be out of date.` `onSave` was called once. Click `Refresh` with `onRefresh` now resolving: the notice is gone and the saved view remains. |
| `a conflict with a successful reload shows the fresh data and explains` | `onSave` rejects `conflict('split_changed')`; `onRefresh` calls `rerender` with `split={saved}` and resolves. After `Save split`: the alert reads `Another split was saved while you were reviewing. Nothing was saved. The latest version is shown here.`; `Saved · split 1` is shown; `Confirm this split` is gone. |
| `a changed bill revision reloads and explains` | `onSave` rejects `conflict('revision_changed')`; `onRefresh` calls `rerender` with `confirmed` at revision 2 (`126.50`). The alert starts `The confirmed bill changed while you were splitting it.`; `Not split yet` and `Split this bill` are visible. |
| `a conflict with a failed reload keeps the draft and blocks saving` | Untick `Dara`, calculate (a three-share preview), then `onSave` rejects `conflict('revision_changed')` and `onRefresh` rejects. The alert reads `The confirmed bill changed while you were splitting it. Nothing was saved. The latest version could not be loaded, so your selection has been kept.` `Confirm this split` and the three shares are still shown. `Save split` is disabled and `Load latest` is shown. The text `The latest version is shown here.` is absent. |
| `load latest can be retried, then the owner recalculates before saving again` | Continue from the previous state. Click `Load latest` with `onRefresh` rejecting: the alert ends `The latest version still could not be loaded. Try again.` and `Save split` is still disabled. Click `Load latest` with `onRefresh` calling `rerender` with `confirmed` at revision 2 (`126.50`) and resolving: the people view shows `Splitting €126.50 from revision 2`; `Aoife`, `Ben`, `Chidi` are ticked and `Dara` is not; the alert ends `The latest version is loaded and your selection has been kept. Calculate the shares again.`; `Save split` is not shown. `Calculate shares` → `onPreview` called with `bill_revision: 2`. `Save split` → `onSave` called with `bill_revision: 2`. `onSave` was called twice in total. |
| `a reloaded roster drops people who were removed` | As above, but the successful reload's `rerender` omits `Ben`: `Aoife` and `Chidi` are ticked and `Ben` is not listed. |
| `a preview conflict follows the same two paths` | `onPreview` rejects `conflict('unknown_housemate')`. With `onRefresh` resolving: the session has ended and the alert reads `Someone you selected is no longer in your list. Nothing was saved. The latest version is shown here.` With `onRefresh` rejecting: the checkboxes keep their ticks, `Calculate shares` is disabled, and `Load latest` is shown. |
| `a conflict without a reason code uses the general wording` | `onSave` rejects `new ApiError(409, 'changed')`: the alert starts `This bill changed while you were splitting it.` |
| `other errors keep the selection and do not reload` | `onPreview` rejects `new Error('network')`: `Could not calculate the shares. Try again.` and the checkboxes are still shown. `onSave` rejects `new Error('network')`: `Could not save. Try again.` and the review view still shows `€30.87`. `onRefresh` not called in either case. |
| `disables Save split while the save is pending` | With `onSave` unresolved: the button is disabled; `onSave` called once after two clicks. |
| `cancel leaves nothing saved` | Start, `Cancel`: `Not split yet`; neither `onPreview` nor `onSave` called. |

- [ ] **Step 2: Run to see them fail.** Run: `npm test -- BillSplit` · Expected: FAIL, module not found.

- [ ] **Step 3: Implement `BillSplitPanel`** with local `useState`, the existing `Button` and `Input` components and a native checkbox; then wire `DocumentDetail.tsx`.

- [ ] **Step 4: Run the frontend gate.** Expected: all pass.

- [ ] **Step 5: Commit.** `git commit -m "Let the owner split a confirmed bill among housemates"`

---

### Task 7: Browser scenarios, evidence and pull request

**Files:**
- Modify: `frontend/e2e/app.spec.ts`
- Modify: `.github/workflows/ci.yml` (the seed step and the Playwright step), `AGENTS.md` (the browser-check sentence)
- Modify: `README.md`, `specs/Repo_Current_State.md`, `specs/Tickets.md`, `specs/MVP_Technical_Design.md`

**Interfaces:**
- Produces, in `app.spec.ts`: `signIn(page, email, password)`, `uploadBillImage(page): Promise<string>` (the existing fixture, upload and wait, returning the document id and leaving the document detail open), `clearHousemates(page)` (`GET` then `DELETE /api/v1/housemates/{id}` with the stored token, as the existing document clean-up does) and `deleteDocument(page, id)`. Extract the first two from the existing scenario without changing what it does.
- Produces, CI: a second run of `scripts/seed_e2e_user.py` with `E2E_SEED_EMAIL: e2e-second@example.com` and the same synthetic password, and `E2E_EMAIL_2` / `E2E_PASSWORD_2` in the Playwright step. `AGENTS.md` names the two variables beside `E2E_EMAIL` and `E2E_PASSWORD`.

- [ ] **Step 1: Extend the scenario** `verified user can review a bill image against its OCR evidence`. The seeded account persists between runs, so call `clearHousemates` once signed in and again in the `finally`. After the existing final `blockquote` assertion (revision 1 is confirmed at €125.00):

```ts
const split = page.getByRole('region', { name: 'Bill split' });
await split.getByRole('button', { name: 'Split this bill' }).click();
for (const name of ['Aoife', 'Ben', 'Chidi', 'Dara']) {
  await split.getByLabel('Add a housemate').fill(name);
  await split.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(split.getByRole('checkbox', { name })).toBeChecked();
}
await split.getByRole('button', { name: 'Calculate shares' }).click();
await expect(split).toContainText('Equal split of €125.00 from revision 1');
await expect(split).toContainText('The total divides exactly.');
await split.getByRole('button', { name: 'Save split' }).click();
await expect(split).toContainText('Saved · split 1');

// Confirm the amount the bill states as revision 2: the saved split becomes stale.
await review.getByRole('button', { name: 'Edit confirmed values' }).click();
await review.getByLabel('Amount due (€)').fill('123.47');
await review.getByRole('button', { name: 'Check values' }).click();
await review.getByRole('button', { name: 'Confirm and save' }).click();
await expect(review).toContainText('Confirmed · revision 2');
await expect(split).toContainText('The confirmed bill is now revision 2 (€123.47). This split uses revision 1 and was not recalculated.');
await expect(split).toContainText('Contributions total €125.00.');

// The December acceptance case.
await split.getByRole('button', { name: 'Split again' }).click();
await split.getByRole('button', { name: 'Calculate shares' }).click();
await expect(split.getByRole('listitem')).toHaveText([/Aoife.*€30\.87/, /Ben.*€30\.87/, /Chidi.*€30\.87/, /Dara.*€30\.86/]);
await expect(split).toContainText('3 leftover cents went one each to the first 3 people in this order.');
await expect(split).toContainText('Contributions total €123.47, the confirmed amount.');
await split.getByRole('button', { name: 'Save split' }).click();
await expect(split).toContainText('Saved · split 2');
await page.reload();
await expect(split).toContainText('Saved · split 2', { timeout: 30_000 });
await expect(split.getByRole('listitem')).toHaveCount(4);
await expect(split).toContainText('Contributions total €123.47.');
```

- [ ] **Step 2: Add the scenario** `a second account in the same browser never sees the first account's housemates`. Skip unless `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_EMAIL_2` and `E2E_PASSWORD_2` are all set. Timeout 120 s. Account B is never given housemates by any test. Steps and assertions, in order:

1. Sign in as A. `clearHousemates`. `uploadBillImage`, then confirm the candidates unchanged (`Review and confirm`, `Check values`, `Confirm and save`). In `Bill split`: `Split this bill`, add `Aoife` and `Ben`, and expect both checkboxes. Keep A's document URL.
2. Mark the page: `await page.evaluate(() => { (window as any).__sameSession = true })`.
3. Log out through the user menu (`Log out`), not by navigation.
4. Hold B's list: `await page.route('**/api/v1/housemates', route => route.request().method() === 'GET' ? held.then(() => route.continue()) : route.continue())`, where `held` is a promise the test resolves later.
5. Sign in as B through the login form. Expect `await page.evaluate(() => (window as any).__sameSession)` to be `true`, which proves the page was not reloaded and the in-memory cache was the one A used.
6. As B: `uploadBillImage`, confirm unchanged, `Split this bill`. While the request is held: `Bill split` contains `Loading your housemates…`, and `page.getByText('Aoife')` and `page.getByText('Ben', { exact: true })` have count 0.
7. Resolve `held`. Expect `Add the people who share this bill.` and still no `Aoife` or `Ben`.
8. Go to A's document URL without reloading: `await page.evaluate(url => { history.pushState({}, '', url); dispatchEvent(new PopStateEvent('popstate')) }, aUrl)`. Expect the region `Bill split` to have count 0 and `page.getByText('Aoife')` to have count 0, checked immediately and again after the document request has completed.
9. `no API response is stored by the service worker` (Decision C): `await page.evaluate(async () => { const urls = []; for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) urls.push(request.url); return urls })` contains no URL with `/api/`.
10. In `finally`: resolve `held` and remove the route; delete B's document; sign in as A, `clearHousemates`, delete A's document.

- [ ] **Step 3: Prove the scenario catches the fault.** Temporarily change `housematesKey` to return `['housemates']` and remove the two `queryClient.clear()` calls. Run the scenario and `npm test -- housemates`: both must fail on an `Aoife` assertion. Restore the code and record in the PR that this was done. If the held route in step 4 is not hit because the service worker took the request, the `sw.js` change from Task 4 is missing.

- [ ] **Step 4: Run the browser checks against the local stack** with `/health/ready` passing, `E2E_BASE_URL`, and both account pairs set for verified synthetic accounts (seed the second with `scripts/seed_e2e_user.py`). Run: `npx playwright test` · Expected: all scenarios pass (the inbox scenario also needs `E2E_MAILPIT_URL`).

- [ ] **Step 5: Check by hand with the synthetic PDF** on a disposable stack and account. Upload `evaluation/demo-1/synthetic-electricity-bill.pdf`, confirm €123.47 unchanged, add four housemates and split: check €30.87, €30.87, €30.87, €30.86, the remainder sentence and the total, save and reload. Then confirm a corrected amount and check the stale notice with the original amounts. Then, with the review step open in one tab, save a split from a second tab and try to save in the first: check that nothing is saved and the `split_changed` wording appears. Then stop the API container, try to save from an open review step, and check that the selection is kept and nothing claims to be the latest version. Record the commit and what was observed.

- [ ] **Step 6: Update the documents.** In `README.md`, add the housemate and bill-split routes to the API table, update the feature list, and correct any statement about offline use that the `sw.js` change makes untrue. In `Repo_Current_State.md`, move household contributions from "next increments" to the capability text and add a verified-results row with the commit, test counts and coverage. In `Tickets.md`, update the #2 row. In `MVP_Technical_Design.md`, note in "Architecture and evidence flow" that the split is implemented, what a save is bound to, that a split from an older revision is shown as stale, and that cached data is dropped when the account changes. Leave the four-housemate wording as it is. State only what was run.

- [ ] **Step 7: Commit, push and open the PR** to `main`. Title: `Split a confirmed bill among housemates in cents`. The body maps each of issue #2's four acceptance checks to the test or observation that verifies it, states the remainder rule in one sentence, lists what was not run, and starts with `Closes #2` only if all four are verified. Wait for the backend, frontend, mobile and e2e checks. Do not merge.

---

## Acceptance check coverage

| Issue #2 acceptance check | Verified by |
| --- | --- |
| Read the amount from the owner's confirmed bill and calculate with integer cents on the server | Task 3 `test_the_confirmed_amount_is_previewed_without_saving`, `test_the_split_uses_the_confirmed_amount_not_the_ocr_candidate`, `test_a_bill_without_a_confirmed_revision_cannot_be_split`, `test_owner_saves_the_reviewed_split_and_reopens_it` (stored cents); Task 1 `test_shares_always_sum_to_the_total` and `test_invalid_inputs_are_rejected` (integers only). The browser sends ids and a revision number, never an amount to split. |
| Equal split of €123.47 among four labels in a defined order gives €30.87, €30.87, €30.87, €30.86; the remainder rule is documented | Task 1 `test_the_issue_example_gives_the_remainder_to_the_first_three`; Task 3 `test_the_confirmed_amount_is_previewed_without_saving`, `test_the_order_sent_decides_who_gets_the_remainder`; Task 6 `the four-person acceptance split is saved only after the shares are reviewed`; Task 7 Step 1 (the acceptance case in the browser) and Step 5; the rule is stated in Decision 4, the panel copy, the README and the PR body. |
| Reject incomplete inputs and show the exact contribution total before it is used in a proposed action | Task 3 `test_incomplete_inputs_are_rejected`, `test_a_person_the_server_cannot_find_is_rejected`, `test_shares_that_differ_from_the_server_result_are_rejected`; Task 2 `test_blank_long_and_unprintable_labels_are_rejected`; Task 6 `fewer than two people cannot be split`, `asks for a confirmed bill first`, the acceptance test (total shown before `Save split`); Task 7 Step 1. Issue #3 can use only a saved split, which exists only after that review. |
| Keep all records in the owner's account; verify both exact division and a remainder case | Task 2 `test_another_account_cannot_see_or_remove_housemates`; Task 3 `test_another_account_cannot_preview_save_or_read_a_split`, `test_a_person_the_server_cannot_find_is_rejected`, `test_exact_division_and_other_group_sizes`; Task 4 `a second account never receives the first account's housemates`, `the key alone separates accounts`; Task 7 Step 2; Task 1 exact and remainder tests; Task 7 Step 1 (exact at €125.00, remainder at €123.47). |

The design row's further evidence, "empty labels and a changed bill revision", is covered by Task 3 `test_incomplete_inputs_are_rejected`, `test_a_newer_revision_marks_the_saved_split_stale` and `test_a_split_reviewed_against_an_older_revision_is_rejected`, Task 6 `a split from an older revision is shown as stale and not recalculated`, and Task 7 Step 1.

## Revision 2 requirement coverage

| Owner requirement, 12 November | Where |
| --- | --- |
| Scope the housemate query cache to the signed-in account; regression test signing out of A and into B in the same browser | Decision 8, Task 4; tests `a second account never receives the first account's housemates`, `the key alone separates accounts`, `signing in and signing out drop every cached query`; Task 7 Steps 2 and 3. |
| After a successful save, display the returned split even if the refresh fails | Decision 7, Task 5 `storeSavedSplit`, Task 6 `a successful save is shown even when the refresh fails`. |
| After a 409, preserve the draft if either refresh fails, explain, and let the owner retry loading before saving again | Decision 7, Task 5 `refreshBillData` tests (document and housemates separately), Task 6 `a conflict with a failed reload keeps the draft and blocks saving`, `load latest can be retried, then the owner recalculates before saving again`, `a preview conflict follows the same two paths`. |
| Keep the 40-character display limit and store the full case-folded key; test 40 `ß` | Decision 9, Task 2 `test_a_forty_character_label_keeps_its_full_case_folded_key`. |
| Four housemates as the December acceptance case; 2 to 12 UI and saved roster as separate decisions | Decisions 1, A and B. |

## Found while planning, not in this plan

- `confirmBillAndRefresh` (issue #1) has the fault fixed here for the split: `refetchQueries` does not reject when the reload fails, so after a 409 the bill panel can say the latest values are shown when they are not. It needs its own issue.
- `AuthProvider` does not react when another tab changes the stored token, so a tab left open keeps showing the previous account's page until it is reloaded.
