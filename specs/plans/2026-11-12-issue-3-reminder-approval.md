# Approved Bill Reminder (Issue #3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** approved by the owner on 12 November 2026 as recommended: separate approvals A, B and C, and design decisions 1 to 12. Nothing in this plan is implemented.

**Goal:** Let a document owner see the exact reminder that would be saved for a confirmed bill, approve or cancel it, and have an approved reminder saved in their account exactly once, with a history of what was proposed, approved and saved.

**Architecture:** A proposal is a stored row. The caller supplies only an allowlisted action name, a number of days and the revision, split and proposal numbers it had on screen; the server builds the reminder details (amount, due date, reminder date, shares) from the owner's confirmed revision and current saved split, and stores them as an immutable snapshot. Approval names that proposal and returns the details the owner was shown. Under the document row lock, in one transaction, the server checks that the proposal is pending, that those details are the stored ones and that the bill revision and split are still the ones it was built from, then inserts the reminder and records the outcome. A unique constraint on the reminder's proposal link makes a second save impossible, and a repeated approval returns the recorded outcome. Every step is appended to an event table. Nothing is delivered anywhere: the reminder is a record in the owner's account.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2, PostgreSQL; React, TypeScript, TanStack Query, Vitest with Testing Library, Playwright. No new dependencies.

**Spec:** [Issue #3](https://github.com/haydenteh5526/DocVault/issues/3) acceptance checks, and the #3 row, the proposal-state paragraph and "Constraints on planned writes" in [MVP_Technical_Design.md](../MVP_Technical_Design.md#design-for-the-next-increments). Read both, [AGENTS.md](../../AGENTS.md) and the [issue #2 plan](2026-11-12-issue-2-bill-split.md) before starting. This plan builds on `backend/app/services/bill_revisions.py`, `backend/app/services/bill_split.py`, `frontend/src/components/BillSplit.tsx` and `frontend/src/lib/billSplit.ts`, and follows their patterns.

## Decisions

The owner approved every recommendation below on 12 November 2026, and the tasks implement them. A change to any of them comes back to the Architect before the build continues.

### Separate approvals

- **A. A saved reminder is shown only in the document's `Reminder` panel.** *Recommended.* No notification-bell entry, no push, no email, no calendar file and no reminders page in this increment. The issue asks for an internal record and puts delivery outside the workflow. *Alternative:* list reminders whose date has arrived in the existing notification bell. That is a new read path with its own ownership and timing tests, and is better as its own issue.
- **B. A reminder date that has already passed is allowed and labelled.** *Recommended.* The synthetic bill is due on 23 November 2026 and the proof of concept is on 18 December 2026, so a rule that refuses past dates would make the fixture unusable on the day. The server has no clock rule; the panel shows `This date has already passed.` from the browser's date. *Alternative:* refuse past dates with a 409, and change the fixture's due date.
- **C. One open proposal per bill, and the latest saved reminder is the bill's current one.** *Recommended.* A new proposal is refused while one is waiting for a decision. After a reminder is saved, the owner can propose a different one; approving it adds a second reminder row and the newer one is shown as current, as `Split again` does for splits. No reminder row is ever updated or deleted. *Alternative:* allow only one reminder per bill revision, with no way to change the number of days.

### Design decisions to confirm

1. **The caller supplies a number of days, never a date or an amount.** The request holds `action`, `days_before_due` (a whole number from 0 to 60) and the three numbers the owner had on screen. The server calculates `remind_on = due_date - days_before_due` from the confirmed revision and copies the amount, dates and shares from its own rows. Unknown fields are rejected, so a caller or a model cannot send `remind_on`, `amount_due` or `status`.
2. **The action name is checked against an allowlist of one.** `action` must be `"bill_reminder"`. This is the server half of "the assistant can request only allowlisted tools": issue #5's tool will call the same service function with `source="assistant"` and reaches nothing else. `source` is set by the server, not read from the request.
3. **A proposal is bound to one confirmed revision and to the split in force when it was made.** "The split in force" is the latest saved split if it is not stale, otherwise none. A stale split is never included. Saving a new split, or confirming a new revision, after the proposal makes it out of date.
4. **Approval is bound to what the owner reviewed and checked in the transaction that saves.** The browser sends back the details it displayed (`reviewed`). The server locks the document row, so a concurrent confirmation, split, approval or cancellation waits, then compares `reviewed` with the stored details and the stored revision and split with the current ones.
5. **A refused approval is recorded, not only reported.** If the inputs changed, the same transaction marks the proposal `stale` with the reason, appends a history event and commits, and the answer is 409. No reminder row is written. Until someone tries to approve it, an out-of-date pending proposal is reported as `stale` on read without being written (as a stale split is).
6. **Exactly once.** `reminders.proposal_id` is unique. The first approval answers 201; any later approval of the same proposal answers 200 with the same body and writes nothing. Cancelling twice answers 200 both times. Approving a cancelled proposal, or cancelling a saved one, is a 409.
7. **History is an append-only event table**, one row per step: `proposed` (the details), `approved` (the details the owner sent back), `saved` (the reminder id and date), `cancelled`, `stale` (the reason). Events carry a sequence number so their order does not depend on timestamps.
8. **Saved data stays visible.** A saved reminder whose bill revision or split has since changed keeps its saved details, is never recalculated, and is shown with a notice. The panel is shown whenever the bill panels are shown, including while the document is reprocessed.
9. **Save and reload are separate outcomes, as in issue #2.** A result the API returned is shown even if the page cannot then be refreshed. After a 409 the page reloads first and then says what changed; if the reload fails, the panel says so, keeps the number of days the owner typed, and blocks further saves until `Load latest` succeeds. A failed approval with no answer from the server is reported as unknown, and approving again is safe.
10. **Missing information is asked for.** The number of days has no default. Submitting without one shows `How many days before the due date should the reminder be?` and sends nothing. A bill with no confirmed revision shows `Confirm the bill above before proposing a reminder.`
11. **Ownership.** Every route goes through `_get_doc_or_404`, and a proposal is looked up by its id together with the document id and the session's user id. Another account, or a proposal id that belongs to a different document, gets 404.
12. **Interface for issue #5, nothing built for it.** The assistant's `propose_reminder(document_ref, days_before_due)` tool calls `propose_reminder(db, doc, user_id, request, source="assistant")` and shows the returned pending proposal. It never calls `approve_proposal`; approval stays an owner interaction in the panel.

## Global Constraints

- Branch `feature/issue-3-reminder-approval` from `origin/main`. Open a PR to protected `main`; do not merge and do not enable auto-merge.
- Commits and the PR carry the configured Git identity only. No `Co-Authored-By` trailer, no "Generated with" line and no other tool attribution.
- Every read or write checks ownership on the server through `_get_doc_or_404` and the session's user id. A non-owner gets 404.
- No reminder row exists without a proposal in status `saved`, and no proposal has more than one reminder.
- `bill_revisions`, `bill_splits`, `reminders` and `reminder_events` rows are never updated or deleted by this feature. A `reminder_proposals` row changes only its `status`, `status_reason` and `decided_at`, once, from `pending`. Do not change `save_revision` or `save_split`.
- Amounts are copied as the decimal strings the revision and split services return. No floats and no new arithmetic on money.
- The server never reads a reminder date, amount, share, status or source from a request.
- Nothing is sent outside the application: no push, email, calendar file or payment.
- The panel never says the latest data is shown unless `onRefresh` resolved.
- Use synthetic bill text and disposable accounts only. Local stack, €0 additional spend. No new dependencies.
- Frontend calls go through `authorizedFetch` in `frontend/src/lib/api.ts`.
- Backend gate, from `backend/`: `python -m ruff check app/ tests/` and `python -m pytest tests/ --cov=app --cov-fail-under=65` against a disposable `pgvector/pgvector:pg16` database with the environment from `.github/workflows/ci.yml`.
- Frontend gate, from `frontend/`: `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`.
- Use `Closes #3` in the PR only if all five acceptance checks are verified; otherwise `Part of #3`.

## Review Focus

Inputs and conditions most likely to break it. Each has a test in the task named.

1. **Approving twice.** A double click, a retry after a lost response, or two tabs: one reminder row, and both answers carry the same reminder. (Tasks 2, 4, 5)
2. **Approve and cancel at the same moment.** Exactly one wins; the reminder exists only if the proposal ends `saved`. (Task 2)
3. **The bill or the split changes while a proposal waits.** Approval is refused, the proposal is recorded as out of date with the reason, and no reminder is written. A reminder saved earlier stays visible with its own values. (Tasks 2, 4, 5)
4. **Values the server cannot check.** An extra `remind_on`, `amount_due`, `status` or `source` field; an action outside the allowlist; days of `-1`, `61`, `2.5`, `"2"`, `true` or missing: 422 and nothing written. (Task 1)
5. **A proposal id from somewhere else.** Another account's proposal, or the owner's proposal on a different document: 404, nothing written. (Task 2)
6. **`reviewed` does not match the stored proposal.** A changed date, amount or share: 409 `details_mismatch`, nothing written and the proposal still pending. (Task 2)
7. **Date arithmetic at boundaries.** Due 1 January 2027 less 2 days is 30 December 2026; due 1 March 2028 less 1 day is 29 February 2028; 0 days is the due date. (Task 1)
8. **A reminder date in the past.** Accepted and saved; the panel labels it. (Tasks 1, 4)
9. **The save succeeds but the reload fails, or the answer never arrives.** The returned proposal is shown; an unanswered approval is reported as unknown and can be repeated safely. (Task 4)
10. **A stale split.** A split saved for an older revision is never included in a proposal. (Tasks 1, 4)

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/app/models/base.py` (modify) | Add `ReminderProposal`, `Reminder`, `ReminderEvent`. |
| `backend/alembic/versions/016_add_reminder_proposals.py` (create) | Create and drop the three tables. |
| `backend/app/schemas/reminder.py` (create) | Request and response models. |
| `backend/app/schemas/document.py` (modify) | `DocumentDetailOut.reminder_proposals`. |
| `backend/app/services/reminders.py` (create) | Propose, approve, cancel, list; the current-inputs check. |
| `backend/app/routers/documents.py` (modify) | Three routes; `reminder_proposals` in the detail response. |
| `backend/tests/test_reminders.py` (create) | Service and API tests. |
| `frontend/src/lib/api.ts` (modify) | Reminder types and three calls. |
| `frontend/src/lib/billReminder.ts`, `billReminder.test.ts` (create) | Storing a returned proposal in the cached document. |
| `frontend/src/components/BillReminder.tsx`, `BillReminder.test.tsx` (create) | `BillReminderPanel`. |
| `frontend/src/pages/DocumentDetail.tsx` (modify) | Render the panel under `BillSplitPanel` and wire its callbacks. |
| `frontend/e2e/app.spec.ts` (modify) | Add the reminder scenario. |
| `README.md`, `specs/Repo_Current_State.md`, `specs/Tickets.md`, `specs/MVP_Technical_Design.md` (modify) | Record what is implemented and verified. |

---

### Task 1: Propose a reminder from the owner's confirmed records

**Files:**
- Modify: `backend/app/models/base.py`, `backend/app/schemas/document.py`, `backend/app/routers/documents.py` (`get_document`; one handler after `save_bill_split`)
- Create: `backend/alembic/versions/016_add_reminder_proposals.py`, `backend/app/schemas/reminder.py`, `backend/app/services/reminders.py`
- Test: `backend/tests/test_reminders.py`

**Interfaces:**
- Consumes: `latest_revision`, `latest_split`, `BillShare`, `_get_doc_or_404` (existing).
- Produces, in `models/base.py` after `BillSplit`, in its style, with no ORM relationships (the database cascades remove the rows):
  - `ReminderProposal`, table `reminder_proposals`: `id: uuid` pk; `document_id` (FK `documents.id`, CASCADE, not null); `user_id` (FK `users.id`, CASCADE, not null); `proposal_number: int`; `action: str` (`String(30)`); `source: str` (`String(20)`); `bill_revision_id` (FK `bill_revisions.id`, CASCADE, not null); `bill_split_id` (FK `bill_splits.id`, CASCADE, nullable); `details: dict` (JSON, not null; a `ReminderDetails` dump with dates as ISO strings); `status: str` (`String(20)`, not null); `status_reason: str | None` (`String(30)`); `created_at`; `decided_at: datetime | None`. Unique constraint `uq_reminder_proposals_document_number` on `(document_id, proposal_number)`.
  - `Reminder`, table `reminders`: `id` pk; `user_id` (FK users, CASCADE, not null); `document_id` (FK documents, CASCADE, not null); `proposal_id` (FK `reminder_proposals.id`, CASCADE, not null); `remind_on: date`; `details: dict` (JSON, not null); `created_at`. Unique constraint `uq_reminders_proposal` on `(proposal_id)`.
  - `ReminderEvent`, table `reminder_events`: `id` pk; `proposal_id` (FK `reminder_proposals.id`, CASCADE, not null); `sequence: int`; `event: str` (`String(20)`); `detail: dict` (JSON, not null); `created_at`. Unique constraint `uq_reminder_events_proposal_sequence` on `(proposal_id, sequence)`.
- Produces, migration `016` (`down_revision = "015"`), in the style of `015_add_housemates_and_bill_splits.py`; `downgrade` drops `reminder_events`, `reminders`, then `reminder_proposals`.
- Produces, in `schemas/reminder.py`:
  - `REMINDER_ACTIONS = ("bill_reminder",)`, `MAX_DAYS_BEFORE_DUE = 60`.
  - `ReminderProposalRequest`, with `model_config = ConfigDict(extra="forbid")`: `action: Literal["bill_reminder"]`; `days_before_due: int = Field(strict=True, ge=0, le=60)`; `bill_revision: int` (`ge=1`; the confirmed revision number on screen); `bill_split: int` (`ge=0`; the number of the split on screen if it is not stale, otherwise `0`); `base_proposal: int` (`ge=0`; the latest proposal number on screen, `0` if none).
  - `ReminderSplit`: `split_number: int`, `total: str`, `shares: list[BillShare]`.
  - `ReminderDetails`: `bill_revision: int`, `amount_due: str`, `due_date: date`, `billing_period_start: date`, `billing_period_end: date`, `days_before_due: int`, `remind_on: date`, `split: ReminderSplit | None`.
  - `ReminderOut`: `id`, `proposal_id`, `remind_on: date`, `created_at`.
  - `ReminderEventOut`: `sequence: int`, `event: str`, `detail: dict`, `created_at`.
  - `ReminderProposalOut`: `id`, `document_id`, `proposal_number: int`, `action: str`, `source: str`, `status: str`, `inputs_changed: str | None`, `details: ReminderDetails`, `reminder: ReminderOut | None`, `history: list[ReminderEventOut]` (by `sequence`), `created_at`, `decided_at: datetime | None`.
  - `DocumentDetailOut.reminder_proposals: list[ReminderProposalOut] = []` in `schemas/document.py`.
- Produces, in `services/reminders.py`:
  - `class ReminderConflict(Exception)` with `code` and `message`.
  - `async def _current_inputs(db: AsyncSession, document_id: UUID) -> tuple[BillRevisionOut | None, BillSplitOut | None]`. The latest revision, and `latest_split(...)` only when it exists and `stale` is `False`, otherwise `None`.
  - `async def _current_proposal_number(db: AsyncSession, document_id: UUID) -> int` (highest, `0` when none).
  - `def _changed(row: ReminderProposal, revision: BillRevisionOut | None, split: BillSplitOut | None) -> str | None`. `"revision_changed"` if `revision` is `None` or its id is not `row.bill_revision_id`; else `"split_changed"` if `(split.id if split else None) != row.bill_split_id`; else `None`.
  - `async def _append_event(db: AsyncSession, proposal_id: UUID, event: str, detail: dict) -> None`, with `sequence` one more than the proposal's highest.
  - `async def list_proposals(db: AsyncSession, document_id: UUID) -> list[ReminderProposalOut]`, newest first. For each row: `inputs_changed` is `row.status_reason` when the stored status is `stale`, `_changed(...)` when it is `pending` or `saved`, and `None` when `cancelled`. `status` is the stored status, except that a `pending` row with `inputs_changed` set is reported as `stale`. `reminder` is the row's reminder, if any.
  - `async def propose_reminder(db: AsyncSession, doc: Document, user_id: UUID, request: ReminderProposalRequest, source: Literal["owner", "assistant"]) -> ReminderProposalOut`.
- Produces, HTTP:
  - `POST /api/v1/documents/{document_id}/reminder-proposals` with `ReminderProposalRequest` → 201 `ReminderProposalOut` (`status == "pending"`, `reminder is None`); 404 non-owner; 422 invalid body; 409 with `detail == {"code": <code>, "message": <message>}`. The handler passes `source="owner"` and `user_id` from the session.
  - `GET /api/v1/documents/{document_id}` includes `reminder_proposals`, independent of `bill_review` and `processing_status`.

`propose_reminder` runs these steps in the request's single transaction, in order, and commits only at the end:

1. Lock the document row with the statement `save_split` uses.
2. `revision, split = await _current_inputs(...)`. `revision is None`: conflict `no_confirmed_bill`, "Confirm the bill before proposing a reminder."
3. `revision.revision_number != request.bill_revision`: conflict `revision_changed`, "The confirmed bill changed while you were setting the reminder."
4. `(split.split_number if split else 0) != request.bill_split`: conflict `split_changed`, "The saved split changed while you were setting the reminder."
5. `_current_proposal_number(...) != request.base_proposal`: conflict `proposal_changed`, "Another proposal was made while you were setting the reminder."
6. If the latest proposal's stored status is `pending`: when `_changed(...)` gives a reason, set it to `stale` with that reason and `decided_at`, and append a `stale` event `{"reason": <reason>}`; otherwise conflict `proposal_pending`, "A proposal is already waiting for your decision."
7. Build `ReminderDetails` from `revision` and `split`: `remind_on = revision.due_date - timedelta(days=request.days_before_due)`; `split` is `ReminderSplit(split_number, total, shares)` copied from the `BillSplitOut`, or `None`.
8. Insert the proposal with `proposal_number = request.base_proposal + 1`, `action`, `source`, `bill_revision_id`, `bill_split_id`, `details = details.model_dump(mode="json")`, `status="pending"`; append a `proposed` event whose detail is the same dump. On `IntegrityError` (backstop for the lock), conflict `proposal_changed`.

Every conflict path rolls back, so step 6's `stale` mark is kept only when the new proposal is saved.

- [ ] **Step 1: Write the failing tests** in `tests/test_reminders.py`. Reuse `BILL` and the client, header, `_code`, `_confirm`, `_housemates` and fixture shapes from `test_bill_split.py` (copy the small helpers; do not import from a test module). Local helpers: `_split(client, document_id, user_id, ids, base_split=0, bill_revision=1)` previews and saves a split and returns its JSON; `_propose(client, document_id, user_id, **overrides)` posts `{"action": "bill_reminder", "days_before_due": 2, "bill_revision": 1, "bill_split": 0, "base_proposal": 0, **overrides}`; `_get(client, document_id, user_id)` returns the document JSON; `_rows(model, document_id)` returns that table's rows for the document in creation order. `BILL` is due on 23 November 2026. "Four" means `Aoife`, `Ben`, `Chidi`, `Dara`.

| Test | Assertions |
| --- | --- |
| `test_the_proposal_is_built_from_the_confirmed_bill` | Confirm `125.00` (the transcript says `123.47`). Propose → 201; `status == "pending"`, `proposal_number == 1`, `action == "bill_reminder"`, `source == "owner"`, `reminder is None`, `inputs_changed is None`; `details == {"bill_revision": 1, "amount_due": "125.00", "due_date": "2026-11-23", "billing_period_start": "2026-10-01", "billing_period_end": "2026-10-31", "days_before_due": 2, "remind_on": "2026-11-21", "split": None}`; `history` has one event, `proposed`, sequence 1, whose `detail` equals `details`. One proposal row with `bill_split_id is None`; zero reminder rows. GET document → `reminder_proposals == [<the POST body>]`. |
| `test_the_current_split_is_included_with_its_shares` | Confirm `123.47`, add four, save a split. Propose with `bill_split=1` → `details["split"] == {"split_number": 1, "total": "123.47", "shares": <the saved split's shares>}`, amounts `30.87`, `30.87`, `30.87`, `30.86` in order. The row's `bill_split_id` is the split's id. |
| `test_a_stale_split_is_never_included` | Save a split on revision 1, confirm `126.50` as revision 2. Propose with `bill_revision=2, bill_split=0` → 201, `details["split"] is None`, `amount_due == "126.50"`. In a second case with the same setup, the first proposal sent is `bill_revision=2, bill_split=1` → 409, code `split_changed`; zero rows. |
| `test_reminder_dates_at_boundaries` (parametrised) | With the bill's due date confirmed as each value: `2027-01-01`, 2 days → `2026-12-30`; `2028-03-01`, 1 day → `2028-02-29`; `2026-11-23`, 0 days → `2026-11-23`; `2026-11-23`, 60 days → `2026-09-24`. |
| `test_a_reminder_date_in_the_past_is_accepted` | Confirm with `due_date` `2020-01-10`. Propose with 2 days → 201, `remind_on == "2020-01-08"`. |
| `test_missing_and_unverifiable_inputs_are_rejected` (parametrised) | Each → 422 and zero proposal rows: `days_before_due` missing, `None`, `-1`, `61`, `2.5`, `"2"`, `True`; `action` missing, `"pay_bill"`, `"send_email"`, `"split_bill"`; an extra field `remind_on: "2026-11-01"`, `amount_due: "1.00"`, `status: "saved"`, `source: "assistant"`; `bill_revision` `0` or missing; `bill_split` `-1` or missing; `base_proposal` `-1` or missing. |
| `test_a_bill_without_a_confirmed_revision_cannot_have_a_reminder` | No confirmation. Propose → 409, code `no_confirmed_bill`; zero rows; GET → `reminder_proposals == []`. |
| `test_a_proposal_made_against_changed_inputs_is_rejected` | Confirm revisions 1 and 2, then propose with `bill_revision=1` → 409 `revision_changed`. Add four and save a split on revision 2, then propose with `bill_revision=2, bill_split=0` → 409 `split_changed`. Propose with `bill_revision=2, bill_split=1` → 201. Propose again with the same body (`base_proposal=0`) → 409 `proposal_changed`. One proposal row in total. |
| `test_only_one_proposal_waits_at_a_time` | Propose, then propose with `base_proposal=1` → 409, code `proposal_pending`; one row, still `pending`. |
| `test_a_new_proposal_retires_an_out_of_date_pending_one` | Propose (1), confirm revision 2. GET → proposal 1 has `status == "stale"`, `inputs_changed == "revision_changed"`, and its stored row is still `pending`. Propose with `bill_revision=2, base_proposal=1` → 201, `proposal_number == 2`. Row 1 is now stored `stale` with `status_reason == "revision_changed"` and `decided_at` set, and its history ends with a `stale` event `{"reason": "revision_changed"}`. GET lists proposal 2 first. |
| `test_concurrent_proposals_store_exactly_one` | `asyncio.gather` two identical proposals → statuses sorted `[201, 409]`; the 409's code is `proposal_changed` or `proposal_pending`; one row. |
| `test_a_proposal_waits_for_the_document_lock` | Structured as `test_a_split_save_waits_for_the_document_lock`: with the document row locked in a second session, the proposal is not done after `asyncio.sleep(0.5)`; after that session commits it returns 201. |
| `test_the_assistant_source_is_set_by_the_server` | Call `propose_reminder(db, doc, owner_id, request, source="assistant")` directly → `source == "assistant"`, `status == "pending"`, zero reminder rows. |
| `test_another_account_cannot_propose_or_read_a_reminder` | The other account's proposal on the owner's document → 404; zero rows. After the owner proposes, the other account's GET document → 404. |
| `test_proposals_reopen_while_the_document_is_reprocessed` | Propose, then set `processing_status="processing"`. GET → `bill_review is None` and `reminder_proposals` equals what was returned. |

- [ ] **Step 2: Run to see them fail.** Run: `python -m pytest tests/test_reminders.py -v` · Expected: import errors or 404s.

- [ ] **Step 3: Add the models, migration, schemas, service functions and the route; add `reminder_proposals` to `get_document`** using `list_proposals`.

- [ ] **Step 4: Run the migration round trip on a fresh database.** Run: `python -m alembic upgrade head && python -m alembic downgrade 015 && python -m alembic upgrade head && python -m alembic downgrade base && python -m alembic upgrade head` · Expected: every command exits 0.

- [ ] **Step 5: Run the backend gate.** Expected: ruff clean; all tests pass; coverage at or above 65%.

- [ ] **Step 6: Commit.** `git commit -m "Propose a bill reminder from the owner's confirmed records"`

---

### Task 2: Approve once, cancel, and record the outcome

**Files:**
- Modify: `backend/app/schemas/reminder.py`, `backend/app/services/reminders.py`, `backend/app/routers/documents.py` (two handlers after the Task 1 handler)
- Test: `backend/tests/test_reminders.py`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces, in `schemas/reminder.py`: `ReminderApproval`, with `extra="forbid"`: `reviewed: ReminderDetails`.
- Produces, in `services/reminders.py`:
  - `class ReminderNotFound(Exception)`.
  - `async def approve_proposal(db: AsyncSession, doc: Document, user_id: UUID, proposal_id: UUID, approval: ReminderApproval) -> tuple[ReminderProposalOut, bool]`. The flag is `True` only when this call saved the reminder.
  - `async def cancel_proposal(db: AsyncSession, doc: Document, user_id: UUID, proposal_id: UUID) -> ReminderProposalOut`.
- Produces, HTTP:
  - `POST /api/v1/documents/{document_id}/reminder-proposals/{proposal_id}/approve` with `ReminderApproval` → 201 `ReminderProposalOut` when this call saved the reminder, 200 with the same body when it was already saved.
  - `POST /api/v1/documents/{document_id}/reminder-proposals/{proposal_id}/cancel` (no body) → 200 `ReminderProposalOut`.
  - Both: 404 "Reminder proposal not found" for a non-owner's document or a proposal that is not this document's and this user's; 422 invalid body; 409 with `detail == {"code", "message"}`.

`approve_proposal`, in one transaction, in order:

1. Lock the document row.
2. Select the proposal where `id == proposal_id`, `document_id == doc.id` and `user_id == user_id`. None: `ReminderNotFound`.
3. `approval.reviewed != ReminderDetails.model_validate(row.details)`: roll back; conflict `details_mismatch`, "The proposal no longer matches what you reviewed."
4. Stored status `saved`: return the proposal as `list_proposals` would report it, with `False`. Nothing is written.
5. Stored status `cancelled`: roll back; conflict `proposal_cancelled`, "This proposal was cancelled." Stored status `stale`: roll back; conflict `proposal_stale`, "The bill or its split changed after this was proposed."
6. Stored status `pending`: `reason = _changed(row, *await _current_inputs(...))`. If set: update the row to `stale` with `status_reason = reason` and `decided_at`, append a `stale` event `{"reason": reason}`, **commit**, then raise conflict `proposal_stale` with the same message as step 5.
7. Insert `Reminder(user_id, document_id, proposal_id, remind_on, details=row.details)`; set the row to `saved` with `decided_at`; append `approved` with detail `{"reviewed": <the reviewed dump>}` and `saved` with detail `{"reminder_id": <id>, "remind_on": <ISO date>}`. On `IntegrityError` (backstop for the lock): roll back and return the proposal as stored, with `False`. Commit and return with `True`.

`cancel_proposal`, in one transaction: lock; select as in step 2; stored `cancelled` → return it, nothing written; `saved` → conflict `already_saved`, "This reminder was already saved."; `stale` → conflict `proposal_stale`; `pending` → set `cancelled` with `decided_at`, append `cancelled` with detail `{}`, commit.

The router maps `ReminderConflict` to `HTTPException(409, {"code", "message"})` and `ReminderNotFound` to `HTTPException(404, "Reminder proposal not found")`, and sets the approve response's status from the flag.

- [ ] **Step 1: Write the failing tests** below the Task 1 tests. Helpers: `_approve(client, document_id, user_id, proposal, reviewed=None)` posts `{"reviewed": reviewed or proposal["details"]}`; `_cancel(...)`. "Events" means `[e["event"] for e in body["history"]]`.

| Test | Assertions |
| --- | --- |
| `test_owner_approves_the_exact_proposal_and_the_reminder_is_saved` | Confirm `123.47`, add four, split, propose. Approve → 201; `status == "saved"`, `decided_at` set, `reminder["remind_on"] == "2026-11-21"`, `reminder["proposal_id"]` is the proposal id, `details` unchanged, events `["proposed", "approved", "saved"]`, the `approved` detail's `reviewed` equals `details`, the `saved` detail's `reminder_id` equals `reminder["id"]`. One reminder row with `remind_on == date(2026, 11, 21)`, `user_id` the owner, and `details` equal to the proposal's. GET → `reminder_proposals[0]` equals the body. |
| `test_a_repeated_approval_returns_the_recorded_outcome` | Approve → 201; approve again → 200 with a body equal to the first. One reminder row; still three events. |
| `test_concurrent_approvals_save_exactly_one_reminder` | `asyncio.gather` two approvals → statuses sorted `[200, 201]`; the two bodies are equal; one reminder row; three events. |
| `test_a_duplicate_reminder_is_returned_not_saved_twice` | After one approval, set the proposal's stored status back to `pending` in the database. Approve → 200 and `reminder["id"]` is the first reminder's id; one reminder row; still three events. (Exercises the `IntegrityError` path, which cannot be reached through the API alone.) |
| `test_cancellation_leaves_no_reminder` | Propose, cancel → 200, `status == "cancelled"`, events `["proposed", "cancelled"]`. Cancel again → 200, same body, still two events. Approve → 409, code `proposal_cancelled`. Zero reminder rows. |
| `test_a_saved_reminder_cannot_be_cancelled` | Approve, then cancel → 409, code `already_saved`; the proposal is still `saved`; one reminder row. |
| `test_approve_and_cancel_together_leave_one_consistent_outcome` | `asyncio.gather` an approval and a cancellation. Either (201, 409 `already_saved`) with one reminder row and status `saved`, or (409 `proposal_cancelled`, 200) with zero reminder rows and status `cancelled`. Assert the reminder row count is 1 exactly when the stored status is `saved`. |
| `test_a_changed_bill_revision_makes_approval_stale` | Propose, confirm `126.50` as revision 2. Approve → 409, code `proposal_stale`. Zero reminder rows. The stored row is `stale`, `status_reason == "revision_changed"`, `decided_at` set. GET → `status == "stale"`, `inputs_changed == "revision_changed"`, events `["proposed", "stale"]`, `details["amount_due"] == "123.47"`. Approve again → 409 `proposal_stale`; still two events. Cancel → 409 `proposal_stale`. |
| `test_a_changed_split_makes_approval_stale` (parametrised) | Proposed with split 1, then a second split saved; proposed with no split, then a first split saved. Approve → 409 `proposal_stale`; `inputs_changed == "split_changed"`; zero reminder rows. |
| `test_details_that_differ_from_the_stored_proposal_are_rejected` (parametrised) | `reviewed` with `remind_on` `2026-11-22`; with `amount_due` `"1.00"`; with `days_before_due` `3`; with `split` removed when one is stored; with one share's `amount` changed → 409, code `details_mismatch`; zero reminder rows; the proposal is still `pending` with one event. The same altered body after a successful approval → 409 `details_mismatch`, one reminder row. |
| `test_invalid_approval_bodies_are_rejected` (parametrised) | No body; `reviewed` missing; an extra top-level field `status: "saved"`; `reviewed.remind_on` `"not-a-date"` → 422; zero reminder rows. |
| `test_a_proposal_from_elsewhere_is_not_found` | The other account approving and cancelling the owner's proposal through the owner's document id → 404. The other account, with its own document, approving the owner's proposal id through its own document id → 404. The owner approving that proposal id through a second document of their own → 404. A random UUID → 404. Zero reminder rows; the proposal is still `pending`. |
| `test_an_approval_waits_for_the_document_lock` | As the Task 1 lock test: not done while a second session holds the row; 201 after it commits. |
| `test_a_saved_reminder_keeps_its_values_when_the_bill_changes` | Approve on revision 1, confirm `126.50` as revision 2. GET → `status == "saved"`, `inputs_changed == "revision_changed"`, `details["amount_due"] == "123.47"`, `reminder["remind_on"] == "2026-11-21"`. One reminder row, unchanged. |
| `test_a_later_reminder_adds_a_row_and_keeps_the_first` | Approve proposal 1. Propose with `days_before_due=5, base_proposal=1` → 201, proposal 2. Approve → 201, `remind_on == "2026-11-18"`. Two reminder rows; the first unchanged. GET lists proposal 2 first, both `saved`. |
| `test_reminders_are_removed_with_the_document` | Approve, then DELETE the document as the owner. Zero proposal, reminder and event rows for it. |

- [ ] **Step 2: Run to see them fail.** Run: `python -m pytest tests/test_reminders.py -v` · Expected: the new tests fail (routes do not exist).

- [ ] **Step 3: Add `ReminderApproval`, the two service functions and the two routes.**

- [ ] **Step 4: Run the backend gate.** Expected: ruff clean; all tests pass; coverage at or above 65%.

- [ ] **Step 5: Check the lock matters.** Temporarily remove `with_for_update` from `approve_proposal` and run `test_an_approval_waits_for_the_document_lock`: it must fail. Restore it and record this in the PR.

- [ ] **Step 6: Commit.** `git commit -m "Approve a reminder proposal once and record the outcome"`

---

### Task 3: API client and cached proposal

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/billReminder.ts`, `frontend/src/lib/billReminder.test.ts`

**Interfaces:**
- Consumes: `BillShare`, `ApiError`, `apiErrorFrom`, `authorizedFetch` (existing).
- Produces, in `api.ts`:
  - `interface ReminderSplit { split_number: number; total: string; shares: BillShare[] }`
  - `interface ReminderDetails { bill_revision: number; amount_due: string; due_date: string; billing_period_start: string; billing_period_end: string; days_before_due: number; remind_on: string; split: ReminderSplit | null }`
  - `interface ReminderEvent { sequence: number; event: 'proposed' | 'approved' | 'saved' | 'cancelled' | 'stale'; detail: Record<string, unknown>; created_at: string }`
  - `interface ReminderProposal { id: string; document_id: string; proposal_number: number; action: string; source: 'owner' | 'assistant'; status: 'pending' | 'cancelled' | 'stale' | 'saved'; inputs_changed: 'revision_changed' | 'split_changed' | null; details: ReminderDetails; reminder: { id: string; proposal_id: string; remind_on: string; created_at: string } | null; history: ReminderEvent[]; created_at: string; decided_at: string | null }`
  - `interface ReminderProposalRequest { action: 'bill_reminder'; days_before_due: number; bill_revision: number; bill_split: number; base_proposal: number }`
  - `Document.reminder_proposals?: ReminderProposal[]`
  - `proposeReminder(documentId: string, body: ReminderProposalRequest): Promise<ReminderProposal>`, `approveReminder(documentId: string, proposalId: string, reviewed: ReminderDetails): Promise<ReminderProposal>` (sends `{ reviewed }`), `cancelReminder(documentId: string, proposalId: string): Promise<ReminderProposal>`. Each throws `await apiErrorFrom(res, <fallback>)` when `!res.ok`.
- Produces, in `billReminder.ts`: `storeReminderProposal(queryClient: QueryClient, documentId: string, proposal: ReminderProposal): void`. In the cached `['document', documentId]`, replaces the proposal with the same `id` or adds it, and keeps the list ordered by `proposal_number`, highest first. With no cached document, nothing is created.

- [ ] **Step 1: Write the failing tests** in `billReminder.test.ts`.

| Test | Assertions |
| --- | --- |
| `adds a new proposal at the front` | Cached document with proposal 1; store proposal 2 → `[2, 1]`; the document's other fields are unchanged. |
| `replaces a proposal that changed status` | Cached `[1 pending]`; store proposal 1 as `saved` → one entry, `saved`. |
| `does nothing without a cached document` | `getQueryData(['document', 'doc-1'])` stays `undefined`. |
| `starts the list when the document has none` | Cached document without `reminder_proposals` → `[1]`. |

- [ ] **Step 2: Run to see them fail.** Run: `npm test -- billReminder` · Expected: FAIL, module not found.

- [ ] **Step 3: Add the `api.ts` items and `billReminder.ts`.**

- [ ] **Step 4: Run the frontend gate.** Expected: all pass.

- [ ] **Step 5: Commit.** `git commit -m "Add the reminder proposal client"`

---

### Task 4: The Reminder panel

**Files:**
- Create: `frontend/src/components/BillReminder.tsx`, `frontend/src/components/BillReminder.test.tsx`
- Modify: `frontend/src/pages/DocumentDetail.tsx`

**Interfaces:**
- Consumes: the Task 3 types, calls and helper; `refreshBillData` (existing); `formatBillDate` (export it from `BillReview.tsx` if it is not exported).
- Produces:

```ts
BillReminderPanel(props: {
  title: string                    // the document's title
  confirmed: BillRevision | null
  split: BillSplit | null
  proposals: ReminderProposal[]    // newest first
  today: string                    // the browser's local date, yyyy-mm-dd
  onPropose: (body: ReminderProposalRequest) => Promise<ReminderProposal>   // the API call only
  onApprove: (proposal: ReminderProposal) => Promise<ReminderProposal>      // sends proposal.details as reviewed
  onCancel: (proposal: ReminderProposal) => Promise<ReminderProposal>
  onRefresh: () => Promise<void>   // rejects unless the page data was reloaded
})
```

It needs no router, query or toast provider. A `section` labelled by the heading `Reminder`, styled as the split panel. Move focus to the panel's heading after each change of view, as `BillSplit.tsx` does.

**Wiring in `DocumentDetail.tsx`.** Render `<BillReminderPanel>` directly after `<BillSplitPanel>` under the same condition, with `title={doc.title}`, `confirmed={doc.confirmed_bill ?? null}`, `split={doc.bill_split ?? null}`, `proposals={doc.reminder_proposals ?? []}`, `today` as the local date, and `onRefresh={() => refreshBillData(queryClient, doc.id, accountId)}`. Each of `onPropose`, `onApprove` and `onCancel` awaits its API call (`proposeReminder(doc.id, body)`, `approveReminder(doc.id, proposal.id, proposal.details)`, `cancelReminder(doc.id, proposal.id)`), passes the result to `storeReminderProposal(queryClient, doc.id, result)` and returns it.

**The current proposal.** The panel keeps the proposal returned by its last successful call in state and shows it in place of the one with the same `proposal_number` in `props.proposals`, or ahead of them if its number is higher. It drops that copy when `onRefresh` next resolves. "Current" is the first proposal after this merge.

**What a request sends.** `onPropose` receives `{ action: 'bill_reminder', days_before_due, bill_revision: confirmed.revision_number, bill_split: split && !split.stale ? split.split_number : 0, base_proposal: <current proposal's number, or 0> }`, read when `Propose reminder` is clicked. `onApprove` and `onCancel` receive the proposal object on screen.

The panel's views. Exact copy, because the tests and the browser scenario match on it. Amounts are `€` followed by the API string. Dates use `formatBillDate`.

| View | Content |
| --- | --- |
| **Not confirmed** (`confirmed` is `null`) | `Confirm the bill above before proposing a reminder.` No controls, but the history is shown if there is any. |
| **Form** (no current proposal, or it is `cancelled` or `stale`, or `Propose a different reminder` was clicked) | A status line: none → `No reminder yet`; `cancelled` → `Proposal <n> was cancelled. No reminder was saved.`; `stale` → `Proposal <n> is out of date and was not saved. <reason>`. Then `Reminder for €<amount>, due <due date> (revision <n>)`. The split line: usable split → `Split <n> will be included.`; a stale split → `The saved split uses revision <m> and will not be included.`; none → `No split is saved for this bill, so none will be included.` A text input with `inputMode="numeric"` labelled `Days before the due date`, empty at the start. Button `Propose reminder`. When opened from the saved view, also button `Back`. |
| **Pending** (current proposal `pending`) | Heading `Approve this reminder`. `Proposal <n> · not saved yet`. The details list (below). `Nothing is sent to anyone. The reminder is saved in your account only.` Buttons `Approve and save` and `Cancel proposal`. |
| **Saved** (current proposal `saved`, form not open) | `Saved · reminder for <remind_on>`. The details list. If `inputs_changed`: a notice, `<reason> This reminder still shows the values it was saved with.` Button `Propose a different reminder`. |

Reason, from `inputs_changed`: `revision_changed` → `The confirmed bill changed after it was proposed.`; `split_changed` → `The saved split changed after it was proposed.`

The details list, a `dl` built only from `proposal.details` and `title`:
- `Bill`: `<title>`
- `Amount due`: `€<amount_due> (revision <bill_revision>)`
- `Due date`: `<due_date>`
- `Remind on`: `<remind_on>`, then `(<k> days before the due date)`, `(1 day before the due date)` or `(on the due date)`. If `remind_on < today`, add `This date has already passed.`
- `Split`: `No split is included.`, or `Split <n>, total €<total>` followed by an ordered list of `<label>` `€<amount>` in order.

**History**, shown under every view when there is at least one proposal: heading `History`, then for each proposal, newest first, `Proposal <n>` and an ordered list of its events by `sequence`, each with `created_at` as a date: `proposed` → `Proposed by you · <date> · remind on <remind_on>` (`Proposed by the assistant` when `source` is `assistant`); `approved` → `Approved · <date>`; `saved` → `Saved · <date>`; `cancelled` → `Cancelled · <date>`; `stale` → `Found out of date · <date>`.

Input messages, in a `role="alert"` element; neither calls `onPropose`:
- Empty or blank: `How many days before the due date should the reminder be?`
- Anything that is not a whole number from 0 to 60 (`-1`, `61`, `2.5`, `two`): `Enter a whole number from 0 to 60.`

While a call is pending, the button that started it is disabled, and so is the other button in the pending view.

**Outcomes.** The call's result and the reload's result are handled separately.

*What happened*, chosen by the 409's `code`:
- `revision_changed`: `The confirmed bill changed while you were setting the reminder.`
- `split_changed`: `The saved split changed while you were setting the reminder.`
- `proposal_changed`: `Another proposal was made while you were setting the reminder.`
- `proposal_pending`: `A proposal is already waiting for your decision.`
- `no_confirmed_bill`: `This bill has no confirmed values.`
- `proposal_stale`: `The bill or its split changed after this was proposed.`
- `proposal_cancelled`: `This proposal was cancelled.`
- `details_mismatch`: `The proposal no longer matches what you reviewed.`
- `already_saved`: `This reminder was already saved.`
- any other or missing code: `This reminder changed while you were reviewing it.`

*Nothing-happened sentence:* `No reminder was saved.` after a failed proposal or approval; `Nothing was changed.` after a failed cancellation.

| Outcome | Behaviour |
| --- | --- |
| **Call succeeded** | Show the view for the returned proposal. Then call `onRefresh`. |
| **Call succeeded, reload failed** | The returned proposal stays on screen. Notice in a `role="status"` element that is always on the page: `Your change was saved. The rest of this page could not be refreshed and may be out of date.` Button `Refresh` calls `onRefresh` again; the notice goes when it succeeds. |
| **409, reload succeeded** | Call `onRefresh` first. Then show the view that fits the fresh props, keeping the typed number of days if the form is shown, and in a `role="alert"` element: `<what happened> <nothing-happened sentence> The latest version is shown here.` |
| **409, reload failed** | Keep the view and the typed number of days. Alert: `<what happened> <nothing-happened sentence> The latest version could not be loaded.` Button `Load latest`. `Propose reminder`, `Approve and save` and `Cancel proposal` are disabled. |
| **`Load latest` fails again** | Same state; the alert ends `The latest version still could not be loaded. Try again.` |
| **`Load latest` succeeds** | Show the view that fits the fresh props, keep the typed number of days if the form is shown, re-enable the buttons, and end the alert with `The latest version is shown here.` |
| **Any other error** | Stay on the view; `onRefresh` is not called. Proposal: `Could not propose the reminder. Try again.` Approval: `Could not confirm that the reminder was saved. Try again: approving again cannot save it twice.` Cancellation: `Could not cancel the proposal. Try again.` |

An alert clears when the owner's next call succeeds.

- [ ] **Step 1: Write the failing tests** in `BillReminder.test.tsx`, set up as `BillSplit.test.tsx`. Fixtures: `confirmed` at revision 1 with `amount_due: '123.47'`, `due_date: '2026-11-23'`; `split` = the issue #2 `saved` fixture (split 1, four shares, not stale); `details` = `{ bill_revision: 1, amount_due: '123.47', due_date: '2026-11-23', billing_period_start: '2026-10-01', billing_period_end: '2026-10-31', days_before_due: 2, remind_on: '2026-11-21', split: { split_number: 1, total: '123.47', shares: split.shares } }`; `pending` = proposal 1, `source: 'owner'`, `status: 'pending'`, `inputs_changed: null`, `reminder: null`, one `proposed` event dated `2026-11-12T10:00:00`; `saved` = `pending` with `status: 'saved'`, a `reminder` for `2026-11-21`, and `approved` and `saved` events. Defaults: `title="October electricity bill"`, `proposals={[]}`, `today="2026-11-12"`, `onPropose` resolving `pending`, `onApprove` resolving `saved`, `onCancel` resolving `{ ...pending, status: 'cancelled' }`, `onRefresh` resolving. `conflict(code)` is `new ApiError(409, 'changed', code)`.

| Test | Assertions |
| --- | --- |
| `asks for a confirmed bill first` | `confirmed={null}`: the region named `Reminder` contains `Confirm the bill above before proposing a reminder.` and no button. |
| `asks how many days when none is given` | `No reminder yet`, `Reminder for €123.47, due 23 November 2026 (revision 1)` and `Split 1 will be included.` are shown; the input is empty. `Propose reminder` → the alert `How many days before the due date should the reminder be?`; `onPropose` not called. |
| `rejects days that are not a whole number from 0 to 60` | `-1`, `61`, `2.5`, `two` → `Enter a whole number from 0 to 60.`; `onPropose` not called. `0` and `60` are sent. |
| `proposes with the revision, split and proposal numbers on screen` | Type `2`, `Propose reminder` → `onPropose` called once with `{ action: 'bill_reminder', days_before_due: 2, bill_revision: 1, bill_split: 1, base_proposal: 0 }`. With `split={null}` → `bill_split: 0` and `No split is saved for this bill, so none will be included.` With `split={{ ...split, stale: true, bill_revision: 1 }}` and `confirmed` at revision 2 → `bill_split: 0` and `The saved split uses revision 1 and will not be included.` With `proposals={[{ ...pending, status: 'cancelled' }]}` → `base_proposal: 1`. |
| `the reminder is saved only after the exact proposal is approved` | After proposing: `Approve this reminder`, `Proposal 1 · not saved yet`, `October electricity bill`, `€123.47 (revision 1)`, `23 November 2026`, `21 November 2026`, `(2 days before the due date)`, `Split 1, total €123.47`, four list items in order with `€30.87`, `€30.87`, `€30.87`, `€30.86`, and `Nothing is sent to anyone. The reminder is saved in your account only.`; `onApprove` not called. `Approve and save` → `onApprove` called once with the pending proposal. Then `Saved · reminder for 21 November 2026` and `Propose a different reminder` are shown, and `Approve and save` is gone. |
| `words the reminder date for one day and for the due date` | `days_before_due: 1` → `(1 day before the due date)`; `0` with `remind_on` equal to the due date → `(on the due date)`. |
| `a proposal without a split says so` | `details.split: null` → `No split is included.` and no list item in the details. |
| `labels a reminder date that has passed` | `today="2026-12-18"` with `pending` → `This date has already passed.` With `today="2026-11-21"` it is absent. |
| `cancelling leaves nothing saved` | `proposals={[pending]}`; `Cancel proposal` → `onCancel` called with the proposal; `Proposal 1 was cancelled. No reminder was saved.` and the form are shown; `onApprove` not called. |
| `an out-of-date proposal cannot be approved` | `proposals={[{ ...pending, status: 'stale', inputs_changed: 'revision_changed' }]}`: `Proposal 1 is out of date and was not saved. The confirmed bill changed after it was proposed.` and the form; no `Approve and save` button. With `split_changed`: `The saved split changed after it was proposed.` |
| `a saved reminder keeps its values when the bill changes` | `confirmed` at revision 2 (`126.50`), `proposals={[{ ...saved, inputs_changed: 'revision_changed' }]}`: `Saved · reminder for 21 November 2026`, `€123.47 (revision 1)`, and the notice `The confirmed bill changed after it was proposed. This reminder still shows the values it was saved with.` |
| `a saved reminder reopens with its history` | `proposals={[saved]}`: under `History`, `Proposal 1` with items `Proposed by you · 12 November 2026 · remind on 21 November 2026`, `Approved · 12 November 2026`, `Saved · 12 November 2026`, in that order. With `source: 'assistant'`: `Proposed by the assistant`. A `stale` event → `Found out of date`. |
| `a different reminder can be proposed after one is saved` | `proposals={[saved]}`; `Propose a different reminder` → the form with `Back`; type `5`, `Propose reminder` → `onPropose` called with `days_before_due: 5, base_proposal: 1`. `Back` returns to the saved view without a call. |
| `a successful approval is shown even when the refresh fails` | `proposals={[pending]}` stays in the props; `onRefresh` rejects. After `Approve and save`: `Saved · reminder for 21 November 2026` is shown, and a `role="status"` element reads `Your change was saved. The rest of this page could not be refreshed and may be out of date.` `Refresh` with `onRefresh` resolving and a `rerender` with `[saved]`: the notice is gone and the saved view remains. |
| `a refused approval reloads and explains` | `proposals={[pending]}`; `onApprove` rejects `conflict('proposal_stale')`; `onRefresh` calls `rerender` with the stale proposal and resolves. The alert reads `The bill or its split changed after this was proposed. No reminder was saved. The latest version is shown here.`; the form is shown; `Approve and save` is gone. |
| `a refused proposal with a failed reload keeps the days and blocks saving` | Type `2`; `onPropose` rejects `conflict('revision_changed')`; `onRefresh` rejects. The alert reads `The confirmed bill changed while you were setting the reminder. No reminder was saved. The latest version could not be loaded.` The input still holds `2`; `Propose reminder` is disabled; `Load latest` is shown; `The latest version is shown here.` is absent. `Load latest` rejecting → the alert ends `The latest version still could not be loaded. Try again.` `Load latest` resolving with a `rerender` at revision 2 → the alert ends `The latest version is shown here.`, the input holds `2`, the form shows `(revision 2)`, and `Propose reminder` → `onPropose` called with `bill_revision: 2`. |
| `a refused cancellation says nothing was changed` | `onCancel` rejects `conflict('already_saved')`; `onRefresh` rerenders with `[saved]`. The alert reads `This reminder was already saved. Nothing was changed. The latest version is shown here.`; the saved view is shown. |
| `a conflict without a reason code uses the general wording` | `onApprove` rejects `new ApiError(409, 'changed')` → the alert starts `This reminder changed while you were reviewing it.` |
| `an unanswered approval can be repeated` | `onApprove` rejects `new Error('network')` → `Could not confirm that the reminder was saved. Try again: approving again cannot save it twice.`; the pending view and both buttons remain; `onRefresh` not called. `Approve and save` again with `onApprove` resolving `saved` → the saved view; `onApprove` called twice. |
| `other errors keep the view and do not reload` | `onPropose` rejects `new Error('network')` → `Could not propose the reminder. Try again.`, input still `2`. `onCancel` rejects `new Error('network')` → `Could not cancel the proposal. Try again.` `onRefresh` not called. |
| `disables both buttons while an approval is pending` | With `onApprove` unresolved: `Approve and save` and `Cancel proposal` are disabled; `onApprove` called once after two clicks. |

- [ ] **Step 2: Run to see them fail.** Run: `npm test -- BillReminder` · Expected: FAIL, module not found.

- [ ] **Step 3: Implement `BillReminderPanel`** with local `useState` and the existing `Button` and `Input`; then wire `DocumentDetail.tsx`.

- [ ] **Step 4: Run the frontend gate.** Expected: all pass, including the existing `DocumentDetail` tests.

- [ ] **Step 5: Commit.** `git commit -m "Let the owner approve or cancel a proposed bill reminder"`

---

### Task 5: Browser scenario, evidence and pull request

**Files:**
- Modify: `frontend/e2e/app.spec.ts`
- Modify: `README.md`, `specs/Repo_Current_State.md`, `specs/Tickets.md`, `specs/MVP_Technical_Design.md`

- [ ] **Step 1: Add the scenario** `an approved reminder is saved once and a changed bill leaves a proposal unsaved` in the `Bill review and split` group. Skip unless `E2E_EMAIL` and `E2E_PASSWORD` are set. Timeout 120 s. Delete the document in `finally`. `review` is the `Bill review` region and `reminder` is `page.getByRole('region', { name: 'Reminder' })`. Steps and assertions, in order:

1. Sign in, `uploadBillImage`, and confirm the candidates unchanged (`Review and confirm`, `Check values`, `Confirm and save`); expect `Confirmed · revision 1`.
2. In `reminder`: expect `No reminder yet` and `No split is saved for this bill, so none will be included.` Click `Propose reminder` with the input empty; expect `How many days before the due date should the reminder be?`
3. Fill `Days before the due date` with `2`, click `Propose reminder`. Expect `Approve this reminder`, `€123.47 (revision 1)`, `21 November 2026`, `(2 days before the due date)` and `No split is included.`
4. Click `Approve and save`. Expect `Saved · reminder for 21 November 2026`. Reload; expect it again within 30 s, and `Proposed by you` and `Saved ·` under `History`.
5. Approve the same proposal twice more through the API and count the reminders:

```ts
const result = await page.evaluate(async () => {
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
  const id = location.pathname.split('/').pop();
  const doc = await (await fetch(`/api/v1/documents/${id}`, { headers })).json();
  const proposal = doc.reminder_proposals[0];
  const url = `/api/v1/documents/${id}/reminder-proposals/${proposal.id}/approve`;
  const body = JSON.stringify({ reviewed: proposal.details });
  const again = await Promise.all([fetch(url, { method: 'POST', headers, body }), fetch(url, { method: 'POST', headers, body })]);
  const bodies = await Promise.all(again.map(r => r.json()));
  return { statuses: again.map(r => r.status), reminders: bodies.map(b => b.reminder.id), first: proposal.reminder.id };
});
expect(result.statuses).toEqual([200, 200]);
expect(result.reminders).toEqual([result.first, result.first]);
```

6. Click `Propose a different reminder`, fill `5`, `Propose reminder`. Expect `Proposal 2 · not saved yet` and `18 November 2026`.
7. In `review`: `Edit confirmed values`, set `Amount due (€)` to `125.00`, `Check values`, `Confirm and save`; expect `Confirmed · revision 2`.
8. In `reminder`: expect `Proposal 2 is out of date and was not saved. The confirmed bill changed after it was proposed.`, and `Approve and save` to have count 0. Expect `Reminder for €125.00, due 23 November 2026 (revision 2)`.
9. Try to approve proposal 2 through the API as in step 5 (one request): expect status 409 and `detail.code` `proposal_stale`. Fetch the document: proposal 2's `reminder` is `null` and proposal 1's `reminder.id` is still `result.first`.

- [ ] **Step 2: Run the browser checks against the local stack** with `/health/ready` passing, `E2E_BASE_URL`, and both account pairs set. Run: `npx playwright test` · Expected: all scenarios pass (the inbox scenario also needs `E2E_MAILPIT_URL`).

- [ ] **Step 3: Check by hand with the synthetic PDF** on a disposable stack and account. Upload `evaluation/demo-1/synthetic-electricity-bill.pdf`, confirm €123.47, add four housemates and save the split. Propose a reminder 2 days before: check the bill, 21 November 2026 and the four shares are shown before anything is saved; approve; reload and check the saved reminder and its history. Then propose another, cancel it, and check no second reminder appears. Then, with a pending proposal open in one tab, approve it in a second tab and click `Approve and save` in the first: check the first shows the same saved reminder and the history has one `Saved` line. Then, with a pending proposal open, save a different split in a second tab and try to approve: check nothing is saved and the out-of-date wording appears. Then stop the API container, click `Approve and save`, and check the unknown-outcome message; restart it, approve again, and check one reminder. Record the commit and what was observed.

- [ ] **Step 4: Update the documents.** In `README.md`, add the three routes to the API table and a `Bill reminder` line to the feature list that says nothing is sent outside the app. In `Repo_Current_State.md`, move reminder approval from "next increments" to the capability text, add a verified-results row with the commit, test counts and coverage, and record the limits (shown only in the document's panel, no delivery, past dates allowed). In `Tickets.md`, update the #3 row. In `MVP_Technical_Design.md`, note in "Architecture and evidence flow" that proposal and approval are implemented, what approval is bound to, that a refused approval is recorded as stale, and the 201 then 200 retry behaviour. State only what was run.

- [ ] **Step 5: Commit, push and open the PR** to `main`. Title: `Approve and save a bill reminder exactly once`. The body maps each of issue #3's five acceptance checks to the test or observation that verifies it, lists what was not run, includes the Reviewer's full report, and starts with `Closes #3` only if all five are verified. Wait for the backend, frontend, mobile and e2e checks. Do not merge.

---

## Acceptance check coverage

| Issue #3 acceptance check | Verified by |
| --- | --- |
| The assistant can request only allowlisted tools; the server validates document ownership, reviewed inputs and action payload | Task 1 `test_missing_and_unverifiable_inputs_are_rejected` (actions outside the allowlist, extra fields), `test_the_assistant_source_is_set_by_the_server`, `test_the_proposal_is_built_from_the_confirmed_bill`, `test_a_bill_without_a_confirmed_revision_cannot_have_a_reminder`, `test_another_account_cannot_propose_or_read_a_reminder`; Task 2 `test_details_that_differ_from_the_stored_proposal_are_rejected`, `test_invalid_approval_bodies_are_rejected`. The assistant itself is issue #5; this issue provides and tests the only entry point it will be given. |
| Show the proposed bill, date and relevant allocation details; missing information prompts a question | Task 4 `the reminder is saved only after the exact proposal is approved`, `a proposal without a split says so`, `asks how many days when none is given`, `asks for a confirmed bill first`; Task 1 `test_the_current_split_is_included_with_its_shares`, `test_a_stale_split_is_never_included`; Task 5 Steps 1 (2 and 3) and 3. |
| Cancellation, changed inputs, stale approval and cross-user requests do not create a reminder | Task 2 `test_cancellation_leaves_no_reminder`, `test_a_changed_bill_revision_makes_approval_stale`, `test_a_changed_split_makes_approval_stale`, `test_approve_and_cancel_together_leave_one_consistent_outcome`, `test_a_proposal_from_elsewhere_is_not_found`; Task 1 `test_a_proposal_made_against_changed_inputs_is_rejected`; Task 4 `cancelling leaves nothing saved`, `an out-of-date proposal cannot be approved`, `a refused approval reloads and explains`; Task 5 Step 1 (7 to 9). |
| A retry after a successful save returns the existing outcome; the action history records what was proposed, approved and saved | Task 2 `test_a_repeated_approval_returns_the_recorded_outcome`, `test_concurrent_approvals_save_exactly_one_reminder`, `test_a_duplicate_reminder_is_returned_not_saved_twice`, `test_owner_approves_the_exact_proposal_and_the_reminder_is_saved` (events and their details); Task 4 `an unanswered approval can be repeated`, `a saved reminder reopens with its history`; Task 5 Step 1 (4 and 5). |
| Exercise these paths locally with synthetic data; payments and external delivery are outside the workflow | Task 5 Steps 2 and 3 on the local stack with the synthetic bill; Task 1 `test_missing_and_unverifiable_inputs_are_rejected` (`pay_bill`, `send_email`); Decision A and the Global Constraint that nothing is sent outside the application. |

The design row's further evidence, "concurrent or repeated approval returns the same saved outcome" and "verify history and failed ownership checks", is covered by the Task 2 concurrency, retry, history and not-found tests above.

## Found while planning, not in this plan

- The landing page's FAQ and feature list name models and features the project no longer uses. This belongs to the redesign issue.
- `confirmBillAndRefresh` (issue #1) still reports the latest values as shown when its reload failed; noted in the issue #2 plan and still without an issue.
