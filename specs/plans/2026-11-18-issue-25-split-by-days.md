# Issue #25: Split a Confirmed Bill by Days at Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** proposed on 18 November 2026. It waits for the owner's approval of decisions E1 to E5. Nothing in it is implemented. The build starts after issue #24's PR 2 merges, because both change `backend/app/services/bill_split.py` and `frontend/src/lib/api.ts` (E5).

**Issue:** [#25](https://github.com/haydenteh5526/DocVault/issues/25). It builds on #2 (equal split, `2026-11-12-issue-2-bill-split.md`).

**Goal:** the owner can split a confirmed bill by the days each person was at home during the billing period, as well as equally. It is calculated in whole cents on the server, previewed exactly, and saved only on "Save split".

**Architecture in one paragraph.**
- `bill_splits` already stores a `rule` (`String(20)`) and the shares as JSON (`[{"housemate_id", "label", "cents"}]`). A days-at-home split stores `rule = "days_home"` and adds `"days_home": int` to each share, so **no migration is needed**.
- A new pure function `split_by_days` sits next to `split_equally`. The request gains an optional `days_home` list, parallel to `housemate_ids`. Shares in responses gain `days_home: int | None`.
- The save stays bound to the reviewed shares, the revision and the split number, as today. Because `days_home` is part of each share, a change of days between preview and save is a `shares_changed` conflict.
- Reminder proposals copy the saved shares, so the days travel with them unchanged.
- The assistant's split preview (issue #5) keeps sending `rule: "equal"`.

## Decisions for the owner

1. **E1. Leftover cents.** Each person's exact share is `total × days ÷ all days`. Everyone gets the whole cents below their exact share. The leftover cents (fewer than the number of people) go one each to the people with the largest fractional remainder; ties go in list order. *Why:* the equal split's rule (the first people in the list) would give Ben, at home 17 days, an extra cent ahead of people at home all 31. With equal days, this rule gives exactly the equal split's result, so the two rules agree where they overlap.
2. **E2. What the owner enters.** "Days at home" per person, from 0 to the number of days in the confirmed billing period, which the panel shows. Each field starts at the full period. *Alternative:* enter days away. Rejected: the issue's wording and the calculation both use days at home.
3. **E3. Invalid days** are refused by the server with 422, the code `days_out_of_range`, and the message "Enter days at home from 0 to {n} for this billing period." Everyone at 0 gives the code `no_days_at_home` and the message "At least one person must have been at home." Nothing is saved.
4. **E4. Out of scope**, as the issue says: separate standing charges, and days-at-home splits from the chat. The chat's split preview stays equal.
5. **E5. Order.** Build after issue #24's PR 2 merges, on `feature/issue-25-split-by-days` cut from that `main`. It can run at the same time as the redesign's first PR, which does not touch the bill panels (Tasks R0 to R7).

## Global constraints

- Test first. No AI or tool attribution. No new dependencies. Synthetic data and disposable accounts; never the `dvdemo` stack.
- Money stays in integer cents. `to_cents` and `from_cents` are the only conversions.
- The existing equal-split tests and the e2e bill scenarios pass unchanged. The frozen copy is unchanged: "Split this bill", "Calculate shares", "Save split", "Saved · split 1", "Add a housemate", the remainder sentences of the equal split, and "Contributions total €…, the confirmed amount."
- Gates:
  - backend: `python -m ruff check app/ tests/` and `python -m pytest tests/ --cov=app --cov-fail-under=65`, against a disposable `pgvector/pgvector:pg16`
  - frontend: `npm ci`, `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`
  - Playwright against a disposable stack

## Review focus

| Risk | Covered by |
| --- | --- |
| Shares not adding up to the total | Task 1: property test over 500 seeded random cases (total 1–10 000 000 cents, 2–12 people, days 0–31, at least one non-zero); the sum always equals the total |
| Equal days giving a different result from the equal split | Task 1: `split_by_days(t, [d]*n) == split_equally(t, n)` for every case where `d > 0` |
| Days edited between preview and save | Task 2: preview, then save with the same `reviewed` and different days → 409 `shares_changed`, no row |
| A billing period counted one day short | Task 2: 1–31 October 2026 → `period_days == 31`; a 28-day February → 28 |
| An old equal split read after the change | Task 2: a stored share without `days_home` reads back with `days_home: null` |
| Another account reading or saving | Task 2: 404 on preview and save, as for equal splits |

## File structure

- `backend/app/services/bill_split.py`; `backend/app/schemas/bill_split.py`; `backend/app/routers/documents.py` (the 422 mapping)
- `backend/tests/test_bill_split.py` (or the existing split test files, alongside them)
- `frontend/src/lib/api.ts` (types); `frontend/src/components/BillSplit.tsx`, `BillSplit.test.tsx`
- `frontend/e2e/app.spec.ts`: one new scenario
- `specs/Repo_Current_State.md`, `README.md` (the "Bill split" feature line)

---

### Task 1: The integer-cent calculator

- **File:** `backend/app/services/bill_split.py`; tests next to the `split_equally` tests.
- **Interface:** `split_by_days(total_cents: int, days: list[int]) -> list[int]`.
  - It raises `ValueError` if: any value is not an `int`; `total_cents < 0`; `len(days) < 2`; any day is negative; or all days are 0.
  - Algorithm, in integer arithmetic only:
    1. `S = sum(days)`
    2. `floor_i = total * d_i // S`, and `rem_i = total * d_i % S`
    3. `left = total - sum(floor_i)`
    4. Add 1 to the `left` indices with the largest `rem_i`, ties by lower index (a stable sort on `-rem_i`).
- [ ] **Failing tests:**
  - `test_days_example`: `split_by_days(12347, [31, 17, 31, 31]) == [3480, 1908, 3480, 3479]`
  - `test_zero_days_pays_nothing`: `split_by_days(10000, [30, 0, 30]) == [5000, 0, 5000]`
  - `test_equal_days_match_equal_split`: for `(12347, 4)`, `(100, 3)` and `(1, 2)`, it equals `split_equally`
  - `test_shares_always_add_up`: the 500-case seeded property test (`random.Random(25)`), with sum equal to total and every share ≥ 0
  - `test_rejects_bad_days`: all zeros, a negative day, one person, a non-int → `ValueError`
- [ ] Gates. Commit: `Split whole cents by days at home with largest remainders`

### Task 2: Preview and save a days-at-home split

- **Files:** `schemas/bill_split.py`, `services/bill_split.py`, `routers/documents.py`; split API tests.
- **Schemas:**
  - `BillSplitRequest.rule: Literal["equal", "days_home"]`, plus `days_home: list[int] | None = None`. A `model_validator` checks the shape:
    - `"equal"` with days → 422 "Days at home apply only to a split by days at home."
    - `"days_home"` without days, or with a list of a different length from `housemate_ids` → 422 "Enter days at home for each person."
  - `BillShare.days_home: int | None = None`.
  - `BillSplitPreview` gains `period_days: int`.
- **Service:**
  - `_compute` takes the rule. For `"days_home"`, it checks every day against `period_days = (end - start).days + 1` from the confirmed revision. It raises a new `BillSplitInputError(code, message)` with the E3 codes and copy, then calls `split_by_days`.
  - Shares are stored as `{"housemate_id", "label", "cents", "days_home"}`. `_shares_out` maps `days_home`, using `None` when absent (old rows).
  - `remainder_cents` is the leftover count (`total - sum(floors)`) for days, and `total % n` for equal.
  - The row's `rule` is the request's rule.
- **Router:** `BillSplitInputError` → 422 with `detail = {"code", "message"}` on both the preview and save routes.
- [ ] **Failing tests** (confirm €123.47 for 1–31 October 2026; four housemates: Aoife, Ben, Chidi, Dara):
  - `preview by days`: days `[31, 17, 31, 31]` → amounts `"34.80", "19.08", "34.80", "34.79"`, each share's `days_home` echoed, `period_days == 31`, `remainder_cents == 2`, `rule == "days_home"`, total `"123.47"`
  - `save by days`: save with the previewed shares → 201, `split_number == 1`, `rule == "days_home"`. A `GET` of the document returns the same shares and days.
  - `days changed after the preview`: same `reviewed`, days `[31, 16, 31, 31]` → 409 `shares_changed`, zero rows
  - `days out of range`: 32 → 422 `days_out_of_range`, message "Enter days at home from 0 to 31 for this billing period."
  - `no one at home`: all 0 → 422 `no_days_at_home`
  - `shape errors`: `"days_home"` with 3 days for 4 people → 422; `"equal"` with days → 422
  - `february`: 1–28 February 2026 → `period_days == 28`
  - `old splits still read`: a stored equal share without `days_home` → `days_home: null`
  - `another account`: preview and save → 404
  - The existing equal-split tests are unchanged.
- [ ] Gates. Commit: `Preview and save a bill split by days at home`

### Task 3: Reminder proposals carry the days

- **Files:** `services/reminders.py` (no code change expected: `ReminderSplit` already copies `split.shares`); reminder tests.
- [ ] **Test:** `a reminder includes a days-at-home split as saved`. Save the Task 2 split, then propose a reminder 2 days before → `details.split.shares[i].days_home == [31, 17, 31, 31][i]`, with the amounts as saved. A newer revision makes the split stale, and the proposal is not recalculated (the existing rule).
- [ ] Gates. Commit: `Carry days at home into reminder proposals`

### Task 4: The Bill split panel

- **Files:** `lib/api.ts` (types: `rule: 'equal' | 'days_home'`, `days_home?: number[]` on the request, `days_home?: number | null` on `BillShare`, `period_days` on the preview); `components/BillSplit.tsx`, `BillSplit.test.tsx`.
- **People step** (after "Split this bill"):
  - A radio group labelled "How to split", with "Split equally" (selected by default) and "Split by days at home".
  - With days chosen:
    - a line reads "Billing period: {start} to {end} ({n} days)", from the confirmed revision, using `formatBillDate`
    - each ticked person gets a number input labelled "Days at home for {label}" (`min=0`, `max=n`, `step=1`, `inputMode="numeric"`), starting at `n`
    - "Calculate shares" stays disabled until every value is a whole number from 0 to `n` and at least one is above 0
  - A 422 from the server shows its message under the inputs.
- **Review step:**
  - Each share row shows "{label}, {d} days at home" and the amount.
  - The remainder sentence for days: 1 cent → "1 leftover cent went to the person closest to the next cent."; n cents → "{n} leftover cents went one each to the {n} people closest to the next cent."
  - The total line is unchanged.
  - "Save split" sends `rule`, `days_home` and the reviewed shares.
- **Saved view:** under "Saved · split {n}", the line "Split by days at home" appears when `rule === 'days_home'`, with the days beside each name.
- **Conflicts:** the existing 409 handling is unchanged. The kept selection also keeps the chosen rule and days.
- [ ] **Failing tests:**
  - `choosing days shows the period and a field per person`: the four fields show 31, and the line reads "Billing period: 1 October 2026 to 31 October 2026 (31 days)".
  - `invalid days disable Calculate shares`: 32 or empty → disabled; all 0 → disabled.
  - `the preview shows days and the remainder sentence`: a mocked preview → "Ben, 17 days at home", "€19.08" and "2 leftover cents went one each to the 2 people closest to the next cent."
  - `save sends the rule and days`: `onSave` is called with `rule: 'days_home'` and `days_home: [31, 17, 31, 31]`.
  - `the saved view names the method`: "Split by days at home".
  - The existing `BillSplit` tests pass unchanged.
- [ ] Gates. Commit: `Let the owner split a bill by days at home`

### Task 5: Browser scenario, records and review

- [ ] **e2e** in `app.spec.ts`, `a bill split by days at home is saved with each person's days`: use the existing synthetic bill helper. Confirm the bill, add four housemates, choose "Split by days at home", set Ben to 17, calculate, expect "€19.08", save, and expect "Saved · split 1" and "Split by days at home".
- [ ] Run the full gates and Playwright on a disposable stack. Add a `specs/Repo_Current_State.md` verified-results row and one sentence to the README's "Bill split" line.
- [ ] Open the PR: `Closes #25` only if every check below is verified. The Reviewer runs without merging; the owner merges.
- [ ] Commit: `Record the split-by-days evidence`

## Acceptance check coverage

| Acceptance check in #25 | Task | Verified by |
| --- | --- | --- |
| Choose "Split equally" (unchanged) or "Split by days at home" | 4 | `BillSplit.test.tsx`; existing equal tests unchanged |
| Days from 0 to the period's days; the period is shown | 2, 4 | API range tests; panel period test |
| Integer cents; shares add up; largest remainders, ties in order; documented and tested | 1, 2 | Calculator tests including the property test; E1 above |
| The worked example (€34.80, €19.08, €34.80, €34.79) | 1, 2, 5 | `test_days_example`; the preview API test; e2e |
| Exact shares, days and total shown before saving; nothing saved until "Save split" | 2, 4 | The preview test (no row); panel tests |
| A saved split records method and days; stale on a new revision, not recalculated | 2, 3 | Save test; the reminder staleness test |
| A reminder proposal includes the split as saved | 3 | The reminder test |
| Invalid input rejected with a message | 2, 4 | 422 tests; disabled-button tests |
| Only the owner sees or saves it | 2 | The other-account 404 tests |
