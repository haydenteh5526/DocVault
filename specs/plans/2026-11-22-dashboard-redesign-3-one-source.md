# Dashboard Redesign, PR 3 of 6: DocBot, Documents and the Bell Read One Answer

**Status:** approved by the owner on 22 November 2026. Nothing in it is implemented. Shared diagnosis, decisions D1–D7 and global constraints: see `2026-11-22-dashboard-redesign-1-extraction.md`, section "Programme".

**Issue:** `Part of #48`.

**Start condition:** PR 2 has merged (`GET /api/v1/overview`).

**Goal:** the DocBot status line, the Documents "Needs attention" panel and status column, DocBot's activity rail and the notification bell all read `['overview', accountId]`. They can no longer disagree. The per-document fetching (`useBillRecords`) and the localStorage bell feed are removed. No visual redesign here (that is PR 4 and PR 5).

Frontend only.

## Task 1: The client and the hook

**Files:** `frontend/src/lib/api.ts`, new `frontend/src/lib/useOverview.ts`, new `frontend/src/lib/attention.ts`, tests for both.

- Types mirroring `backend/app/schemas/overview.py` exactly (`Overview`, `AttentionItem`, `UpcomingItem`, `DocumentStatusInfo`, `RecentDocument`) and `getOverview(): Promise<Overview>` through `authorizedFetch` (`GET ${BASE}/overview`).
- `useOverview()`:
  - `queryKey: ['overview', accountId]`, `enabled: Boolean(accountId)`
  - `staleTime: 15_000`, `refetchOnMount: 'always'`, `refetchOnWindowFocus: true` (override of the global default for this query only)
  - `refetchInterval: data => data?.processing ? 4_000 : false`
- `attention.ts` holds every visible string derived from attention, so all surfaces print the same words:
  - `attentionStatusText(overview, { isPending, isError })`: pending → "Checking…"; error → "Status unavailable"; `0` → "All caught up"; `1` → "1 item needs you"; `n` → "{n} items need you".
  - `attentionReasonText(item)`: `bill_unconfirmed` → "Needs confirming"; `reminder_pending` → "Reminder awaiting approval"; `split_stale` → "Split out of date"; `processing_failed` → "Could not read this file"; `warranty_ending` → "Warranty ends {formatBillDate(date)}".
  - `attentionTarget(item)`: `bill_unconfirmed` → `/app/documents/{id}#bill-review-heading`; `reminder_pending` → `#bill-reminder-heading`; `split_stale` → `#bill-split-heading`; `processing_failed` and `warranty_ending` → `/app/documents/{id}`.
- [ ] **Tests first:** the three functions over every kind; `useOverview` polls while `processing > 0` and stops at `0`.
- [ ] Commit: `Fetch the overview once for every surface that shows attention`

## Task 2: Invalidate the overview after every write

**Files:** `frontend/src/lib/documentStatusSync.ts`, `frontend/src/pages/Upload.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/DocumentDetail.tsx`, `frontend/src/pages/Warranties.tsx`, `frontend/src/components/DocumentRowMenu.tsx` (PR 1's "Read details again"), tests.

- `syncDocumentStatus`: when a document's status fingerprint changes, also `invalidateQueries({ queryKey: ['overview'] })`. Drop the `['document-list-status']` write and invalidation (the key no longer exists after Task 3).
- Invalidate `['overview']` after: each upload in `Upload.tsx` `send()`, delete, bulk delete, undo of a delete, rename, folder move, favourite (counts only), "Check now", retry processing, "Read details again", warranty create/edit, and `DocumentDetail.tsx:147` (replace its `document-list-status` invalidation).
- [ ] **Tests first:** `documentStatusSync.test.tsx` — confirming a bill in the document cache invalidates `['overview']`; a rename does not. `queryClient.test.ts` is updated to the new key (allowed edit).
- [ ] Commit: `Refresh the overview whenever a write changes what it shows`

## Task 3: Documents reads statuses and attention from the overview

**Files:** `frontend/src/pages/Dashboard.tsx`, `frontend/src/components/DocumentStatus.tsx`, delete `frontend/src/lib/useBillRecords.ts` and `useBillRecords.test.tsx`, tests.

- `DocumentStatus` takes `status?: DocumentStatusInfo` (label and tone from the server) instead of computing `statusOf(doc, detail)`. Processing and failed states still come from the list's `processing_status` so a new upload shows "Reading the text" before the overview refreshes. With no overview yet: "Checking status" (unchanged copy; `redesign-screens.spec.ts` waits for it to disappear).
- `statusLabel()` and the Status facet read the same server label. `attentionReason()` is deleted.
- The "Needs attention" panel lists `overview.attention` (first 3), each with `attentionReasonText` and a link: "Review and confirm" for `bill_unconfirmed`, "Open bill" for `reminder_pending` and `split_stale`, "Open" for the rest (kept copy; `docbot.spec.ts:166` uses "Open bill"). Its empty text is "Nothing needs your attention." (unchanged). Warranty rows now come from the overview, so the separate `getWarranties` query and `warrantiesEndingSoon` are removed from Dashboard.
- [ ] **Tests first** (`Dashboard.test.tsx`): with a mocked overview of one `bill_unconfirmed` and no proposals, the panel shows the bill as "Needs confirming" and its row shows "Needs confirming"; no `GET /documents/{id}` request is made from the list (assert on the fetch mock). `DocumentDeleteList.test.tsx` mocks are updated to the overview (allowed edit).
- [ ] Commit: `Show each document's status from the overview`

## Task 4: DocBot's status and activity rail

**Files:** `frontend/src/lib/useDocBotActivity.ts`, `frontend/src/components/DocBotActivity.tsx`, `frontend/src/components/AppNav.tsx`, `frontend/src/pages/AskAI.tsx`, tests.

- `useDocBotActivity()` derives from `useOverview()` plus `useHousemates()`:
  - `status = attentionStatusText(...)` (replaces "All caught up" / "{n} need approval" / "Ready" / "Checking bills")
  - `attention = overview.attention`, `upcoming = overview.upcoming.filter(within 30 days)`
  - `needsApproval = attention.some(kind === 'reminder_pending')` drives `DocBotMark state="needs-approval"`
  - the `fetchActivity` argument is removed; `AppNav` and `AskAI` share the one query.
- `DocBotActivity`: "Requires approval" lists `reminder_pending` items; its links keep the kept copy "Open bill to see its status" and "Review in bill".
  - **Revision 1 (23 November):** the overview item has no due date, bill revision, split number or shares. For each `reminder_pending` item the card therefore reads that bill with `useQuery(['document', id])`, the same cache as the bill page. It renders the full existing card from the proposal whose id matches `proposal_id`.
  - Until that loads, or if it fails, the card shows the title, "Remind on {date}" and €amount from the overview, with both links.
  - These reads happen only for pending proposals, never in the Documents list, so acceptance check 3 holds.
  - `DocBotActivity.test.tsx` "shows the exact pending details" passes unedited. Add a test for the loading/failed fallback.
- A new first section "Needs you" lists the other attention kinds with `attentionReasonText` and `attentionTarget`. "Coming up" lists `upcoming` (bill due with amount and "Not confirmed" when `confirmed` is false; renewals; warranty ends). "Household" is unchanged.
- [ ] **Tests first:** the live-run scenario (one `bill_unconfirmed`, zero proposals) renders the nav status "1 item needs you", never "All caught up". `DocBotActivity.test.tsx` and `AskAI.test.tsx` mocks move to the overview (allowed edit); every reminder-copy assertion stays.
- [ ] Commit: `Let DocBot report the same attention count as everything else`

## Task 5: The bell (D5)

**Files:** rewrite `frontend/src/components/NotificationCenter.tsx`, new `NotificationCenter.test.tsx`, `AppNav.tsx`.

- `useNotifications` is deleted. `NotificationCenter` takes no props and reads `useOverview()`.
- **Badge:** `overview.attention_count` (hidden at 0, "9+" above 9). `aria-label`: "Notifications" or "Notifications, {n} need you".
- **Panel** (same position and size as today): heading "Notifications".
  - Section "Needs you": the attention items, each a button with title, `attentionReasonText`, navigating to `attentionTarget` and closing the panel.
  - Section "Recent": `overview.recent`, each with title, `kind · relativeTime(created_at)` and "Reading the text" / "Ready" / "Could not read this file".
  - Empty (no attention, no recent): "All caught up" and "DocBot tells you here when a bill, renewal or warranty needs you."
  - No "Mark all read" and no dismiss: attention resolves by acting on it.
- On mount, remove the legacy `localStorage` key `docvault-notifications` and the `sessionStorage` key `docvault-warranty-checked`. The 10-second `getDocuments` poll is gone.
- [ ] **Tests first:** the badge equals the nav status count and the Documents panel count for the same mocked overview (one test renders all three); the legacy keys are removed; no `setInterval` is registered.
- [ ] Commit: `Make the bell show what needs the owner, from the server`

## Task 6: Record, review and PR

- [ ] Gates: `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`; Playwright `app.spec.ts`, `docbot.spec.ts`, `accessibility.spec.ts`, `redesign-screens.spec.ts` against a disposable stack; backend tests as a regression check.
- [ ] Manual check (Browser pane, disposable account): upload the four live-run documents; the nav status, the Documents panel and the bell badge show the same number; record it with screenshots `after-pr3-*.png` in the untracked folder.
- [ ] Reviewer: `reviewer`.
- [ ] PR `feature/dashboard-redesign-3-one-source`, `Part of #48`.

## Acceptance checks

| # | Check | Verified by |
| --- | --- | --- |
| 1 | The nav status, the Documents panel and the bell badge show the same count for the same data | Task 5 test; manual check |
| 2 | "All caught up" never appears while any attention item exists | Task 4 test |
| 3 | The Documents list makes no per-document requests for status | Task 3 test |
| 4 | The bell no longer uses localStorage or polls; legacy keys are cleared | Task 5 test |
| 5 | Every write that changes attention refreshes it | Task 2 tests |
| 6 | Kept copy and every reminder test unchanged | Reviewer; gates |
