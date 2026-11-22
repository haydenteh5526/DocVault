# Dashboard Redesign, PR 4 of 6: The Overview Becomes `/app`, DocBot Moves to `/app/ask`

**Status:** approved by the owner on 22 November 2026, including adjustment 4 (action targets, the return path and the calm state). Nothing in it is implemented. Shared diagnosis, decisions D1–D7 and global constraints: see `2026-11-22-dashboard-redesign-1-extraction.md`, section "Programme".

**Issue:** `Part of #<n>`.

**Start condition:** PR 3 has merged (`useOverview`, `attention.ts`).

**Goal:** `/app` is an actionable Overview: what needs the owner, what is coming up in 60 days, what was added recently and what is in the vault. DocBot is one chat surface at `/app/ask`, reached from the menu or from the Overview's Ask box. The Documents "Ask" button goes. Desktop 1366×768 and mobile 390×844 are both deliberate layouts.

Frontend only. **Size seam:** if the build passes about 300 lines of application code, split at Task 2/Task 3 into PR 4a (routes, menu, hand-off, detail return path) and PR 4b (the Overview page), each with this plan's tests for its tasks. No other split.

## Visual language (all tasks)

Carry the landing page and SafeDoor craft into the app, on the existing dark tokens:
- No boxed cards and no card backgrounds on the Overview. Sections are separated by space and one hairline (`border-border/60`); rows by hairlines.
- Hierarchy by type: `h1` 32 px Geist 600 tight tracking; section `h2` 14 px medium, muted, sentence case (`text-sm font-medium text-muted-foreground`); row titles 15 px medium; secondary lines 13 px muted.
- Dates in a fixed column, `font-mono tabular-nums`, e.g. `Thu 20 Nov`.
- One accent for attention: the existing `text-attention` (amber) as a 6 px dot and the reason text; danger uses `text-destructive`. No other colour.
- Actions are text buttons with an arrow (`ArrowRight` 14 px), underline on hover and focus, at least 44 px tall on touch.
- Motion: rows fade in 120 ms once on first load; none under `prefers-reduced-motion`.

## Task 1: Routes and the menu

**Files:** `frontend/src/App.tsx`, `frontend/src/components/AppNav.tsx`, `frontend/src/pages/AskAI.tsx`, `frontend/src/components/CommandPalette.tsx`, tests (`AppNav.test.tsx`, `AskAI.test.tsx`).

- Routes: `index` → lazy `Overview` (new `pages/Overview.tsx`); `ask` → `<AskAI />`, which now restores this session's last thread (the behaviour `home` had: `sessionStorage['docbot-thread:' + accountId]`); `ask/:conversationId` unchanged. The `home` prop is removed.
- Primary menu, in order: **Overview** (`/app`, `House` icon), **Documents**, **Upload**, **DocBot** (`/app/ask`, `DocBotMark` with the PR 3 status line under it on desktop, `aria-label` "DocBot, {status}"). The phone's bottom bar shows the same four. "More" (Search, Warranties) is unchanged.
- `isCurrent`: Overview only for exactly `/app`; DocBot for `/app/ask` and `/app/ask/*`.
- The brand button still goes to `/app`.
- Command palette: add "Overview" (`/app`) and rename the old home entry to "DocBot" (`/app/ask`).
- [ ] **Tests first:** the menu has four primary items in order on desktop and phone; Overview is current on `/app` only; DocBot is current on `/app/ask/123`; `/app/ask` restores the stored thread id.
- [ ] Commit: `Make the Overview the home and give DocBot its own page`

## Task 2: The Ask hand-off, the Documents button and the return path

**Files:** `frontend/src/pages/AskAI.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/DocumentDetail.tsx`, `frontend/src/components/BillReview.tsx` (one attribute), tests.

- **Ask hand-off:** the Overview's Ask box submits with `navigate('/app/ask', { state: { question } })`. `AskAI` reads `location.state.question` once, sends it as a new conversation (as if typed), then clears it with `navigate(location.pathname, { replace: true, state: null })` so a reload does not resend. The question never goes into the URL.
- **Documents:** remove the header "Ask" button. "Upload" stays (kept copy).
- **Return path (adjustment 4):**
  - Every Overview link to a document passes `state: { from: 'overview' }`.
  - `DocumentDetail`: when `location.state?.from === 'overview'`, the first breadcrumb reads "Overview" and goes to `/app`, and the back button's `aria-label` is "Back to Overview". Otherwise unchanged ("All Documents", "Go back").
  - The hash list that scrolls to and focuses a heading becomes `['#bill-review-heading', '#bill-reminder-heading', '#bill-split-heading']`. `BillReview`'s `h3#bill-review-heading` gains `tabIndex={-1}` (no other change to the component).
- [ ] **Tests first:** a question typed on the Overview arrives as the first user message on `/app/ask` and is not in `location.search`; reloading does not resend it; Documents has no "Ask" button; opening a bill with `from: 'overview'` and `#bill-review-heading` focuses the Bill review heading and shows the "Overview" breadcrumb.
- [ ] Commit: `Hand questions to DocBot and bring the owner back to the Overview`

## Task 3: The Overview page

**Files:** new `frontend/src/pages/Overview.tsx`, new `frontend/src/components/overview/` (`NeedsYou.tsx`, `ComingUp.tsx`, `RecentlyAdded.tsx`, `VaultCounts.tsx`, `AskBox.tsx`), new `Overview.test.tsx`.

### Layout

- **1366 × 768:** content `max-w-[72rem]`, `px-10 pt-10`. Header row: `h1` greeting and the summary line on the left; Upload button on the right. Under it, the Ask box at full content width (one line, 48 px, small `DocBotMark` at the left, placeholder "Ask DocBot about your documents", send button). Then a 12-column grid from 1280 px: **left 8** = Needs you, then Coming up; **right 4** = Recently added, then In your vault. Below 1280 px everything is one column in that order.
- **390 × 844:** `px-4 pt-6`; greeting `h1` 26 px; summary line; Ask box; Needs you; Coming up; Recently added; In your vault. Upload is in the bottom bar, so the header has none. No sideways scroll at 320 px.

### Header copy

- `h1`: "Good morning" (05:00–11:59), "Good afternoon" (12:00–17:59), "Good evening" (otherwise), followed by ", {display_name}" when the profile has one. Never "Welcome back" (kept copy of the sign-in page).
- Summary line, built from the overview:
  - attention `n > 0`: "{n} {item|items} need{s|} you" — e.g. "1 item needs you", "3 items need you".
  - attention `0`: "Nothing needs you right now."
  - then, if `upcoming.length > 0`: " · {m} coming up in the next 60 days"
  - then, if `processing > 0`: " · {p} still reading"

### Needs you

- `h2` "Needs you"; on the right, the "Check now" button moved from Documents (same handler, toast, live-region copy and 409/429 messages as `Dashboard.tsx` `checkNow()`; it invalidates `['overview']`).
- One row per `overview.attention` item, all of them (no cap). Row: amber dot, title, reason line, action at the right.

| Kind | Reason line | Action label | Action |
| --- | --- | --- | --- |
| `bill_unconfirmed` | "Check the amount, due date and billing period" (+ " · due {date}" if read) | "Confirm bill" | Link to `/app/documents/{id}?tab=info#bill-review-heading`, `state: { from: 'overview' }`. Lands on the Bill review panel with its heading focused. The owner confirms there with the existing flow. |
| `reminder_pending` | "Remind on {date} · €{amount} due {due}" | "Approve reminder" | Link to `#bill-reminder-heading`. Lands on the Reminder panel showing the exact proposal; the owner approves there with "Approve and save". **The Overview never approves.** |
| `split_stale` | "The bill changed after the split was saved" | "Update split" | Link to `#bill-split-heading`. Lands on the Bill split panel. |
| `processing_failed` | "Could not read this file" | "Try reading again" | Button in place: calls `retryDocumentProcessing(id)`, shows "Reading again…", invalidates `['overview']`; the row disappears when processing starts; on error toast "Could not retry processing. Try again." |
| `warranty_ending` | "Warranty ends {date}" | "View document" | Link to `/app/documents/{id}`, `state: { from: 'overview' }`. |

- **How the owner returns:** the detail page's "Overview" breadcrumb or back button (Task 2), the browser back button, or the menu. `useOverview` refetches on mount, so the row the owner just resolved is gone on return; the summary line updates with it. No change to the bill panels' save logic.
- **No items:** a single line with a check glyph: "All caught up." (No claim about the daily check, which the owner may have switched off.)

### Coming up

- `h2` "Coming up"; items grouped under "Next 7 days", "Next 30 days", "Next 60 days" (empty groups hidden).
- Row: date column, title, detail line, whole row links to the document with `state: { from: 'overview' }`.

| Kind | Detail line |
| --- | --- |
| `bill_due`, confirmed | "€{amount} due" |
| `bill_due`, not confirmed | "€{amount} due · Not confirmed" (amount omitted if unread) |
| `renewal` | "Renewal · from the document" and, muted underneath, `Line {n}: {source text}` |
| `contract_end` | "Term ends · from the document" and the source line |
| `warranty_end` | "Warranty ends" |

### Recently added and In your vault

- `h2` "Recently added": `overview.recent`, each a link with title and "{kind} · {relativeTime}"; status text "Reading the text" (with a 1.2 s opacity pulse, none under reduced motion), "Could not read this file" in `text-destructive`, nothing when ready. Footer link "All documents".
- `h2` "In your vault": one typographic line, e.g. "4 documents · 2 bills · 1 receipt · 1 policy" (`Insurance` reads "policy/policies", `Other` reads "other"), kinds in descending count, then the link "Open Documents".

### States

| State | What shows |
| --- | --- |
| Loading | Greeting and Ask box render immediately; sections show three 12 px skeleton bars each with `aria-busy="true"`. No spinner. |
| Error | Under the greeting: "Could not load your overview." and a "Try again" button that refetches. The Ask box stays usable. |
| **Empty** (0 documents) | Greeting; the line "Upload a bill, receipt or policy. DocBot picks out due dates, renewals and warranty end dates."; primary button "Upload your first document" (`/app/upload`); three muted example lines: "Bills → amount and due date", "Policies → renewal date", "Receipts → warranty end date". No Ask box, no sections. |
| **Calm** (documents exist, `attention == []`, `upcoming == []`) | Summary line "Nothing needs you right now."; Needs you shows "All caught up."; Coming up shows "No due dates, renewals or warranty ends in the next 60 days." plus, when `next_after_window` exists, "Next: {title} on {date}" as a link. Recently added and In your vault render as usual, so the page is never blank. The Ask box shows three suggestion buttons under it: "When is my next bill due?", "Which warranties end this year?", "What does my insurance cover?"; each hands its text to DocBot exactly like a typed question. |
| Processing | Summary line adds " · {p} still reading"; Recently added shows the pulsing status; the overview polls (PR 3). |

### Accessibility

One `h1`; every section an `h2` with `aria-labelledby`; lists are `ul`; navigation actions are links, "Try reading again" and "Check now" are buttons; the retry and check results are announced in one polite live region; visible focus everywhere; AA contrast on the dark palette (record ratios for the amber reason text and muted secondary text in the PR).

- [ ] **Tests first** (`Overview.test.tsx`, mocked overview): the live-run scenario shows "2 items need you", two "Confirm bill" links to `#bill-review-heading` with `from: 'overview'`, the broadband bill in Coming up as "Not confirmed" and the renewal with its source line; a pending reminder shows "Approve reminder" linking to `#bill-reminder-heading` and no approve button on the page; the empty state; the calm state with `next_after_window`; error and retry; the summary-line grammar for 0, 1 and 3; suggestion buttons hand off to `/app/ask`.
- [ ] Commits: `Lay out the Overview`, `Show what needs the owner with one action each`, `Show what is coming up in the next 60 days`, `Show the empty and calm Overview`

## Task 4: Move "Check now", update the e2e suite

**Files:** `frontend/src/pages/Dashboard.tsx` (remove "Check now"; the Needs attention panel stays until PR 5), `frontend/e2e/*.spec.ts`.

- **Allowed e2e edits** (grep before each):
  - Sign-in assertions that expected `heading 'DocBot'` on `/app` (`accessibility.spec.ts:57,93,117`, `app.spec.ts:56,68`) expect `heading level 1` matching `/^Good (morning|afternoon|evening)/`.
  - `redesign-screens.spec.ts:123` shoots `home` on `/app` with the Overview heading, and adds `docbot` on `/app/ask` with `heading 'DocBot'`.
  - `docbot.spec.ts:157,182` press "Check now" on the Overview (`/app`) instead of Documents; the bill-row assertions after it are unchanged.
  - Any step that clicked the old "Ask" item opens "DocBot" instead.
- New `e2e/overview.spec.ts` (second account, synthetic documents drawn as in `fixtures/redesign/documents.ts`): after the October bill is read, the Overview shows "Confirm bill"; clicking it lands on Bill review with focus on its heading; the "Overview" breadcrumb returns to `/app`; after confirming, the row is gone and the summary line has one fewer item. axe passes on `/app` at 1366 and 390. No sideways scroll at 390 and 320.
- [ ] Commit: `Check the Overview end to end`

## Task 5: Screenshots, record, review and PR

- [ ] Headless Playwright script (run from `frontend/`, `chromium.launch({ headless: true })`) saves `after-empty-app-1366.png`, `after-empty-app-390.png`, `after-populated-app-1366.png`, `after-populated-app-390.png` and `after-calm-app-1366.png`, `after-calm-app-390.png` to the untracked `C:\DocVault\evaluation\dashboard-redesign\` (populated = the four live-run documents). Not committed.
- [ ] **Owner look before the PR opens:** show the owner the six screenshots and the live page in the Browser pane; apply only the changes the owner asks for.
- [ ] Gates: frontend `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`, full Playwright suite on a disposable stack; backend tests as a regression check.
- [ ] Reviewer: `reviewer`.
- [ ] PR `feature/dashboard-redesign-4-overview-home`, `Part of #<n>`. Record in `Repo_Current_State.md` that decision 5 of the DocBot redesign plan is superseded by D1.

## Acceptance checks

| # | Check | Verified by |
| --- | --- | --- |
| 1 | `/app` shows Needs you, Coming up, Recently added and In your vault from one overview request | `Overview.test.tsx`; `overview.spec.ts` |
| 2 | Each Needs-you kind has the action and target in the table; the Overview never approves a reminder or saves a bill | `Overview.test.tsx`; Reviewer |
| 3 | From a bill opened on the Overview, the owner returns with the "Overview" breadcrumb and the resolved row is gone | `overview.spec.ts` |
| 4 | Empty and calm states render as specified | `Overview.test.tsx`; screenshots |
| 5 | DocBot is one chat at `/app/ask`; a question from the Overview arrives there without entering the URL; Documents has no "Ask" button | Task 2 tests |
| 6 | Four primary menu items on desktop and phone; axe clean; no sideways scroll at 390 and 320 px | `AppNav.test.tsx`; `overview.spec.ts` |
| 7 | Kept copy and every reminder test unchanged | Reviewer; gates |
