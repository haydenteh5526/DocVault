# Pip: an Agent Experience Inside DocVault — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** proposed and approved by the owner on 20 November 2026, with decisions A1 to A5 and P1 to P6 as written. The assistant is named **Pip**. Nothing in it is implemented.

**Issue:** none yet. Opening one needs the owner's yes. The proposed text is the "Acceptance checks" table at the end.

**Goal:** DocVault should feel like an assistant that works for you, not a chat page.
- **Pip** proposes the right thing at the right time.
- Pip shows what it did.
- Pip remembers how your household works.
- Nothing is saved without your approval of the exact proposal.

These are five patterns borrowed from agent products (Meta's Muse, Grok), built into the existing React and FastAPI app. There is no new framework, no new dependency and no new model.

**Architecture in one paragraph.**
- **PR A2 comes first.** It needs nothing from the benchmark:
  - **Daily check:** a scheduled job (ARQ cron, next to the existing warranty job) creates pending reminder proposals for bills due soon. It calls the same `propose_reminder` service as the bill panel and the chat, with `source="routine"`.
  - **Household preferences:** one row per account, typed fields only, edited in Settings next to the housemates.
  - **Warranties:** ones ending soon appear in Needs attention.
  - **Bill panel:** says "Proposed by Pip" or "Proposed by Pip's daily check".
- **PR A1 comes second.** It starts after benchmark PR 1 merges, because its trace reads that PR's `retrieve()` result.
  - **Inline approval:** the chat's reminder card gets "Approve and save" and "Cancel proposal". They call the existing approval endpoints with the exact details the card shows, so the server-side binding is unchanged.
  - **Activity trace:** every assistant reply carries the list of steps the server actually ran, which the page shows under the reply.
  - **Preferences in chat:** a request that doesn't say how many days uses the owner's saved preference.

**What doesn't change:**
- the six allowlisted tools
- the keyword router as the default selector
- server-side arithmetic and money in cents
- the approval binding (409 on any mismatch, exactly once)
- ownership checks
- Documents as the home page

PydanticAI stays out unless a model reaches the frozen 90% selection bar.

## Decisions for the owner

Approved on 20 November 2026 (next-phase memo):
1. **A1.** Approve from chat, with the same binding.
2. **A2.** Show the real steps once the reply arrives, with no live streaming.
3. **A3.** Bills get proposals; warranties get attention items only; a "Check now" button.
4. **A4.** Typed preferences only; free text never reaches the selector or the answer writer.
5. **A5.** The name is **Pip**. It is kept in one constant, `ASSISTANT_NAME`, used only in visible text and never in code identifiers.

**Design decisions, each with a recommendation (approve with the plan):**
6. **P1. Daily check rules.**
   - It looks at bills whose confirmed due date is between today and 14 days ahead, in Irish time.
   - It skips a bill if any proposal already exists for its current confirmed revision, whatever its status. A proposal you cancelled is not proposed again for the same revision; a new confirmed revision can get a new one.
   - Days before the due date = your preference (default 3), capped at the days left.
   - *Alternative:* re-propose after a cancel. Rejected: it would nag.
7. **P2. Run time and button.** Daily at 07:30, beside the warranty job at 08:00. "Check now" in Needs attention runs the same check for your account only, limited to 10 runs an hour.
8. **P3. Chat uses the preference only once saved.**
   - If you have saved household preferences, "remind me about this bill" uses your lead days and the trace says so.
   - If you haven't, Pip asks "How many days before the due date?" as today.
   - *Why:* the existing behaviour and its tests stay unchanged for everyone who hasn't opted in.
9. **P4. Approve only on the latest card.** Only the latest reminder card for a bill in a conversation shows the buttons. Older cards show their status. *Why:* one place to decide, and no approving a proposal you reviewed three messages ago.
10. **P5. Trace display.** Open under the latest reply, collapsed under older ones. Stored with the message (inside the existing `action` JSON), so it survives a reload with no migration.
11. **P6. Order.** A2 first, now; A1 after benchmark PR 1 merges. Both change `BillReminder.tsx` copy only in A2, so the PRs don't share files.

## Global constraints

- Test first. No AI or tool attribution. No new dependencies. €0. Synthetic data and disposable stacks only; never `dvdemo`, `dvfriday` or the owner's student account.
- **The approval endpoints don't change.** Every existing test in `backend/tests/test_reminders.py` and `frontend/src/components/BillReminder.test.tsx` passes unchanged, except the one copy line named in Task A2.4.
- **Pip proposes; only you approve.** No code path approves, saves or sends anything without the owner pressing "Approve and save" on the exact proposal shown.
- **Frozen copy kept:** the chat card's region label "Reminder proposal", its line "Proposal {n} · not saved when proposed", and its button "Open bill to see its status" (`e2e/app.spec.ts` lines 518–531); "Approve and save", "Cancel proposal", "Saved · reminder for {date}"; the nav label "Ask".
- **The only existing e2e line that changes:** `app.spec.ts:534`, "Proposed by the assistant" → "Proposed by Pip" (Task A2.4).
- Every query is scoped to the session's user. The daily check runs per document under the document's own `user_id`.
- Update the relevant spec or evidence when behaviour changes, and keep proposed, on a branch and verified apart.

## Review focus

The inputs most likely to break this, each with a test:

1. **The check runs twice:** no second proposal (`test_routine_is_idempotent`).
2. **A proposal for the revision was cancelled:** no new one (`test_routine_respects_cancelled_proposal`). A re-confirmed bill (new revision) gets one (`test_routine_proposes_for_new_revision`).
3. **Due in 2 days with a 3-day preference:** days before due is 2, and remind on is today (`test_routine_caps_lead_days`). Due yesterday: skipped.
4. **A conflict mid-run** (someone proposes in the panel between the check's read and its write): the check records `skipped: proposal_changed` and carries on (`test_routine_survives_conflict`).
5. **Routines off:** that account is skipped by the cron and by "Check now" (`test_routine_respects_switch`). Another user's bills are never touched by "Check now" (`test_check_now_is_owner_scoped`).
6. **Approving from a stale card** (the bill was re-confirmed after the card was shown): 409 `stale` is shown on the card, and nothing is saved (`test_card_shows_conflict_and_saves_nothing`, plus the existing server tests).
7. **Approving twice** (double click, or card and panel): one reminder; the second call returns the recorded outcome (`test_card_double_approve_saves_once`).
8. **The trace claims something that didn't happen:** each step is written where the step runs, never by a model (`test_trace_matches_tools_run`, one case per tool).
9. **Preferences validation:** lead days outside 0–60 or an unknown split rule gives 422, and nothing is saved (`test_preferences_validation`).

## File structure

| File | PR | Change |
| --- | --- | --- |
| `backend/alembic/versions/019_add_household_preferences.py` | A2 | **New.** `household_preferences` table |
| `backend/app/models/base.py` | A2 | `HouseholdPreferences` model |
| `backend/app/schemas/household.py` | A2 | **New.** `HouseholdPreferencesIn/Out` |
| `backend/app/routers/household.py` | A2 | **New.** `GET` and `PUT /api/v1/household/preferences` |
| `backend/app/services/routines.py` | A2 | **New.** `run_bill_check`, `RoutineReport` |
| `backend/app/routers/routines.py` | A2 | **New.** `POST /api/v1/routines/check` |
| `backend/app/services/reminders.py` | A2 | `source` accepts `"routine"` |
| `backend/app/worker.py` | A2 | `bill_check_cron` at 07:30 |
| `backend/tests/test_household.py`, `test_routines.py` | A2 | **New** |
| `frontend/src/lib/assistant.ts` | A2 | **New.** `ASSISTANT_NAME = 'Pip'`, `proposedByText(source)` |
| `frontend/src/lib/api.ts` | A2, A1 | Preferences and check calls (A2); trace types (A1) |
| `frontend/src/pages/Settings.tsx` | A2 | "Household" section |
| `frontend/src/pages/Dashboard.tsx` | A2 | "Check now"; warranty rows in Needs attention |
| `frontend/src/components/BillReminder.tsx` | A2 | Source copy through `proposedByText` |
| `frontend/src/components/BillSplit.tsx` | A2 | Initial "How to split" from the preference |
| `backend/app/schemas/assistant.py` | A1 | `TraceStep`, `TraceDocument`, `AssistantAction.trace` |
| `backend/app/services/assistant/tools.py`, `turn.py` | A1 | Write trace steps; use the lead-days preference |
| `frontend/src/components/AssistantAction.tsx` | A1 | Approve and cancel on the latest reminder card |
| `frontend/src/components/AssistantTrace.tsx` | A1 | **New** |
| `frontend/src/pages/AskAI.tsx` | A1 | Heading, waiting state, trace, latest-card rule |
| `frontend/e2e/app.spec.ts`, new `e2e/pip.spec.ts` | A2, A1 | One copy line (A2); new scenarios (A1) |

## PR A2 — Pip's daily check and household preferences (build now)

Branch `feature/pip-daily-check`, cut from `main` at `23f5238` or later.

### Task A2.1: Household preferences

- **Migration 019**, table `household_preferences`:
  - `user_id` UUID, primary key, foreign key to `users.id` on delete cascade
  - `reminder_days_before_due` integer, not null, default 3, check 0–60
  - `default_split_rule` String(20), not null, default `'equal'`, check in `('equal', 'days_home')`
  - `routines_enabled` boolean, not null, default true
  - `updated_at` timestamp, server default now

  The downgrade drops the table.
- **Schemas:**
  - `HouseholdPreferencesIn(reminder_days_before_due: int = Field(strict=True, ge=0, le=60), default_split_rule: Literal["equal", "days_home"], routines_enabled: bool)`, with `extra="forbid"`.
  - `HouseholdPreferencesOut` = the same fields, plus `saved: bool`, which is false when no row exists yet.
- **Router `/api/v1/household`:**
  - `GET /preferences` returns the row, or the defaults with `saved=false`.
  - `PUT /preferences` upserts the row for the session's user and returns it with `saved=true`.
  - Invalid input gives 422 with FastAPI's usual body.
- [ ] **Tests first** (`test_household.py`): defaults before saving, saving and reading back, Review-focus test 9, another user's preferences are never returned, and the migration round trip.
- [ ] Gates. Commit: `Remember a household's reminder and split preferences`

### Task A2.2: The daily check

- **`backend/app/services/routines.py`:**

  ```python
  ROUTINE_WINDOW_DAYS = 14

  @dataclass(frozen=True)
  class RoutineItem:
      document_id: uuid.UUID
      title: str
      outcome: Literal["proposed", "skipped"]
      reason: str | None            # "already_proposed", "past_due", "routines_off", or a ReminderConflict code
      proposal_number: int | None
      remind_on: date | None

  @dataclass(frozen=True)
  class RoutineReport:
      items: list[RoutineItem]
      warranties_ending: list[tuple[uuid.UUID, str, date]]   # document id, title, expiry date (within 30 days, not past)

  async def run_bill_check(db: AsyncSession, *, user_id: uuid.UUID | None = None, today: date | None = None) -> RoutineReport
  ```

  - `today` defaults to `datetime.now(ZoneInfo("Europe/Dublin")).date()`.
  - With `user_id`, only that user's documents. Without it, every user whose preferences have `routines_enabled` true or who has no preferences row.
  - **For each document with a confirmed bill** (latest revision through the existing `current_request_numbers` and `latest_revision`):
    - due date before today: `past_due`
    - due date more than 14 days ahead: not listed
    - any `ReminderProposal` with `bill_revision_id` equal to the current revision's id: `already_proposed`
    - otherwise, `propose_reminder(db, doc, doc.user_id, ReminderProposalRequest(action="bill_reminder", days_before_due=min(lead, days_left), bill_revision=…, bill_split=…, base_proposal=…), source="routine")`
  - A `ReminderConflict` is recorded as `skipped` with its code, and the loop continues.
  - Each proposal commits on its own, as `propose_reminder` already does.
- `reminders.py`: `source: Literal["owner", "assistant", "routine"]`. The column is already `String(20)`, so no migration is needed.
- **`worker.py`:** `async def bill_check_cron(ctx)` opens a session, calls `run_bill_check(db)` and logs the counts. Register it as `cron(bill_check_cron, hour=7, minute=30)`.
- [ ] **Tests first** (`test_routines.py`, with fixed `today`): Review-focus tests 1 to 5, plus `test_routine_proposal_has_routine_source` and `test_routine_report_lists_warranties_ending`.
- [ ] Gates. Commit: `Propose reminders for bills due soon in a daily check`

### Task A2.3: "Check now"

- **`POST /api/v1/routines/check`**
  - Calls `run_bill_check(db, user_id=<session user>)` and returns `{"proposed": [{document_id, title, proposal_number, remind_on}], "skipped": [{document_id, title, reason}], "warranties_ending": [{document_id, title, expiry_date}]}`.
  - Limited to `10/hour` through the existing `limiter`.
  - If routines are off for this account, it returns 409 with `{"code": "routines_off", "message": "Pip's daily check is switched off in Settings."}`.
- [ ] Test: the owner-scoped part of Review-focus test 5, the response shape, the 409 when switched off, and 429 after the limit.
- [ ] Gates. Commit: `Let the owner run Pip's check now`

### Task A2.4: Settings, Needs attention and the bill panel

- **`frontend/src/lib/assistant.ts`:**
  - `export const ASSISTANT_NAME = 'Pip'`
  - `export function proposedByText(source: string): string` returns:
    - `'assistant'`: "Proposed by Pip"
    - `'routine'`: "Proposed by Pip's daily check"
    - anything else: "Proposed by you"
- **`BillReminder.tsx` line 448:** use `proposedByText(proposal.source)`.
  - Change `BillReminder.test.tsx`'s matching expectation and `e2e/app.spec.ts:534` from "Proposed by the assistant" to "Proposed by Pip". These are the only existing test lines that change.
- **`Settings.tsx`, a new section "Household" (`h2`)** after "General":
  - **"People you live with":** the existing housemates list, through the existing `/housemates` API, with "Add a housemate" and remove buttons. The same copy and errors as the bill split panel.
  - **"Remind me before a bill is due":** a number input, 0–60, with the suffix "days".
  - **"Usually split bills":** radio buttons "Equally" and "By days at home".
  - **"Let Pip check my bills each morning":** a checkbox, with the help text "Pip proposes a reminder for bills due in the next two weeks. Nothing is saved until you approve it."
  - **Saving:** a "Save" button sends `PUT`, then shows "Saved." and invalidates `['household-preferences', accountId]`. A 422 shows "Enter a number of days from 0 to 60."
- **`BillSplit.tsx`:** when preferences are `saved` with `default_split_rule = 'days_home'`, the "How to split" choice starts on "By days at home". Otherwise nothing changes. A split that already exists keeps its own rule.
- **`Dashboard.tsx`, Needs attention:**
  - A ghost button "Check now" sits beside the heading. It calls the check and announces the result in a toast and the polite live region:
    - "Pip checked your bills: 1 reminder proposed." (or "{n} reminders proposed.")
    - "Pip checked your bills: nothing new."
    - for a 409, the server's message
  - Then it invalidates `['documents']` and `['document-list-status']`.
  - Warranties ending within 30 days (from the existing `getWarranties`) are added after the bill rows, up to 2, as "{title}" with the reason "Warranty ends {d MMMM yyyy}" and the link "Open". These rows are not offered as Status filter options.
- [ ] **Tests first:**
  - `Settings.test.tsx`: load, save, the 422 message, and housemate add and remove.
  - `Dashboard.test.tsx`: "Check now" shows both result messages and invalidates; warranty rows appear and stay out of the Status filter.
  - `BillSplit.test.tsx`: the preference sets the initial choice only when saved.
  - `lib/assistant.test.ts`: the three source texts.
- [ ] **Browser scenario** (`e2e/pip.spec.ts`, "Pip's daily check proposes a reminder"):
  1. Confirm the synthetic bill, due within 14 days.
  2. Save a preference of 2 days.
  3. Press "Check now". The toast says "1 reminder proposed".
  4. The bill is under Needs attention with "Reminder awaiting approval".
  5. In the bill panel, the history says "Proposed by Pip's daily check".
  6. "Approve and save" saves it once.
  7. A second "Check now" says "nothing new".
- [ ] Gates. Commit: `Show Pip's household settings and daily check`

### Task A2.5: Review and PR

- [ ] `specs/Repo_Current_State.md` and the README feature list record what was run.
- [ ] Rename the branch if it was tool-generated. The Reviewer checks the diff against this plan and Review focus 1 to 5 and 9. Show the owner the full report, and fix only what he approves.
- [ ] Open the PR (`Part of #<issue>`). It merges on the owner's word.

## PR A1 — approvals in Ask and a visible trace (after benchmark PR 1 merges)

Branch `feature/pip-in-ask`, cut from `main` after both PR A2 and benchmark PR 1 have merged.

### Task A1.1: The trace, written where each step runs

- **`schemas/assistant.py`:**
  - `class TraceDocument(BaseModel): id: uuid.UUID; title: str`
  - `class TraceStep(BaseModel): kind: Literal["understood", "searched", "read_bill", "calculated", "used_preference", "proposed", "asked", "declined"]; text: str = Field(max_length=160); documents: list[TraceDocument] = Field(default_factory=list, max_length=5)`
  - `AssistantAction.trace: list[TraceStep] = Field(default_factory=list, max_length=8)`
  - Stored inside the existing `conversation_messages.action` JSON, so no migration is needed. Older messages read back with an empty trace.
- **Steps and their exact text**, appended in `turn.py` and `tools.py` at the point where the work happens:

  | Step | Text |
  | --- | --- |
  | `understood` | One of: "Understood your request with the keyword rules."; "Understood your request with the local model {model}."; "The local model didn't answer ({reason}), so the keyword rules were used."; "Continued from your last answer." (for `selector="pending"`) |
  | `read_bill` | "Read the confirmed {title}, revision {n}." (with the document) |
  | `calculated` | "Worked out {k} shares in whole cents, totalling €{total}." |
  | `used_preference` | "Used your setting: remind {d} days before the due date." |
  | `proposed` | "Proposed reminder {n}. Nothing is saved until you approve it." |
  | `searched` | "Searched your documents: {p} passages from {m} documents." (with the documents), from `retrieve()`'s passages. Or "Searched your documents and found nothing that answers this." for `not_found` and `no_documents`. When `via == "keyword_fallback"`, add the sentence: "None was a close match; these share your words." |
  | `asked` | "Asked {which bill you mean / who to include / how many days before the due date / what the question is about}." |
  | `declined` | "Declined: DocVault can't pay bills or move money." / "Declined: DocVault doesn't send anything outside your account." / "Declined: this isn't something DocVault can do." |

- **Lead-days preference (P3):** in `run_selection`, for `propose_reminder` with no `days_before_due`, if the owner has a saved preferences row, use its `reminder_days_before_due` and add `used_preference`. Otherwise the existing `how_many_days` question is unchanged.
- [ ] **Tests first:** Review-focus test 8, one case per tool and selector path; `test_trace_survives_reload` (stored and read back through the conversations API); `test_preference_fills_days_only_when_saved`. Every existing assistant test passes unchanged.
- [ ] Gates. Commit: `Record the steps Pip ran with each reply`

### Task A1.2: Approve or cancel on the reminder card

- **`AssistantAction.tsx`, `reminder_proposal` card.** It keeps its region label, its first line, its existing lines and "Open bill to see its status". It adds:
  - a line "Proposed by Pip"
  - "Billing period {start} to {end}"
  - when the proposal has a split: each share as "{label} €{amount}"

  Everything the approval saves is now visible on the card.
- **New prop `canDecide: boolean`.** `AskAI` passes true only for the latest `reminder_proposal` card of each document in the conversation (P4).
  - When true, the card reads the live proposal from `useQuery(['document', documentId])` and matches it by `proposal.id`.
  - If the live status is `pending`, it shows "Approve and save" (primary) and "Cancel proposal" (outline).
  - Otherwise it shows the status line the panel uses ("Saved · reminder for {date}", "Cancelled", or the stale reason), with no buttons.
- **"Approve and save"** calls `approveReminder(documentId, proposal.id, proposal.details)` (its third argument is the reviewed details) with the details the card shows.
  - **Success:** show "Saved · reminder for {date}", then invalidate `['document', documentId]` and `['document-list-status']`.
  - **409:** show the server's message through the same code-to-text map the panel uses (export it from `BillReminder.tsx` as `REMINDER_CONFLICT_TEXT`), refetch the document, and hide the buttons unless the live status is still `pending`.
  - **Other errors:** "Could not save the reminder. Try again."
- **"Cancel proposal"** calls `cancelReminder` with the same handling, and shows "Cancelled".
- Buttons are disabled while a call runs, so a double click sends one request.
- [ ] **Tests first** (`AssistantAction.test.tsx`): Review-focus tests 6 and 7; buttons only with `canDecide` and a pending live status; the card lists the period and every share; cancel; the existing card tests pass unchanged.
- [ ] Gates. Commit: `Approve or cancel Pip's reminder from the chat`

### Task A1.3: The Ask page

- **The heading** "Ask anything about your documents" becomes "Ask Pip about your documents". Grep `frontend/e2e` and the unit tests for the old text first; today only `AskAI.tsx` has it.
- **While a reply is on its way,** the existing loading row reads "Pip is working…" in a polite live region. No steps are shown before they happen.
- **`AssistantTrace.tsx`:** `<details>` with the summary "How Pip did this · {n} steps", then an ordered list with one Lucide icon per kind:
  - `Sparkle` is not used
  - `MessageSquare` for understood, `Search` for searched, `FileText` for read_bill, `Calculator` for calculated, `Settings2` for used_preference, `BellPlus` for proposed, `CircleHelp` for asked, `Ban` for declined

  Document names are links to the document. Open under the latest assistant reply, closed under older ones (P5). Nothing renders for an empty trace.
- [ ] **Browser scenario** (`e2e/pip.spec.ts`, "Approve Pip's reminder from Ask"):
  1. Confirm the bill.
  2. Ask "Remind me two days before it's due."
  3. The card shows the period, "Proposed by Pip" and "Approve and save".
  4. The trace shows "Proposed reminder 1".
  5. Approve. The card shows "Saved · reminder for 21 November 2026".
  6. The bill panel shows the same saved reminder, with the history "approved" exactly once.
  7. Reloading the conversation keeps the trace and the saved status.

  The existing scenario that approves in the bill panel (`app.spec.ts` lines 517–536) stays as it is.
- [ ] Gates. Commit: `Show Pip's work and approvals on the Ask page`

### Task A1.4: Review and PR

- [ ] Records and README as in A2.5. The Reviewer checks Review focus 6 to 8 and the frozen copy, and confirms that no approval endpoint or its tests changed. Show the owner the full report, fix only what he approves, and open the PR. It merges on the owner's word.

## Acceptance checks

| # | Check | Verified by |
| --- | --- | --- |
| 1 | Each morning, and on "Check now", Pip proposes a reminder for a confirmed bill due within 14 days, once per confirmed revision, using the owner's lead days. Nothing is saved until the owner approves. | `test_routines.py`; `pip.spec.ts` daily check (A2) |
| 2 | Warranties ending within 30 days appear in Needs attention. | `Dashboard.test.tsx` (A2.4) |
| 3 | Household preferences (lead days, usual split, daily check on or off) and housemates are kept per account, validated on the server and editable in Settings. | `test_household.py`; `Settings.test.tsx` (A2.1, A2.4) |
| 4 | A reminder Pip proposed in chat can be approved or cancelled on its card. The approval is bound server-side to the exact details shown, saves once, and refuses a stale proposal. | `AssistantAction.test.tsx`; existing `test_reminders.py` unchanged; `pip.spec.ts` approve from Ask (A1) |
| 5 | Every reply shows the steps the server actually ran, and they survive a reload. | `test_trace_matches_tools_run`; `test_trace_survives_reload`; `pip.spec.ts` (A1) |
| 6 | The assistant is called Pip everywhere it is named, from one constant. | `lib/assistant.test.ts`; copy tests (A2.4, A1.3) |
| 7 | No new dependency, tool, model or approval path; ownership checks hold; €0; synthetic data only. | Reviewer (A2.5, A1.4) |
