# Dashboard Redesign, PR 4 of 6: The Overview Becomes `/app`, DocBot Moves to `/app/ask`

**Status:** approved by the owner on 22 November 2026, including adjustment 4 (action targets, the return path and the calm state). **Revision 1 (22 November):** the "Inside the Vault" visual direction, the agent header with a vault brief, the command bar at the top, "Needs your yes" approval strips, the weekly ledger, the right rail and the revised calm and empty states. Nothing in it is implemented. Shared diagnosis, decisions D1–D7 and global constraints: see `2026-11-22-dashboard-redesign-1-extraction.md`, section "Programme".

**Issue:** `Part of #48`.

**Start condition:** PR 3 has merged (`useOverview`, `attention.ts`), and PR 6 has merged (the empty-state drop zone hands files to its deduplicating `choose()`).

**Goal:** `/app` is an actionable Overview that feels like stepping through `/login`'s SafeDoor into a quiet private vault room. It shows what needs the owner's yes, what is coming up in 60 days, what DocBot just did and what is in the vault. DocBot is one chat surface at `/app/ask`, reached from the menu or from the Overview's command bar. The Documents "Ask" button goes. Desktop 1366×768 and mobile 390×844 are both deliberate layouts.

Frontend only. **Size seam:** if the build passes about 300 lines of application code, split at Task 2/Task 3 into PR 4a (routes, menu, hand-off, detail return path, copy) and PR 4b (the vault materials and the Overview page), each with this plan's tests for its tasks. No other split.

## Decision D8 (Revision 1): no mascot inside `/app`

Inside `/app` (menu, Overview, bell, DocBot page header and empty thread), the folder mascot `DocBotMark` is replaced by a minimal geometric mark, `DocBotGlyph`, always paired with a status LED. The landing page keeps `DocBotMark` unchanged (decision 2 of the DocBot redesign plan still holds there). `ASSISTANT_NAME` stays "DocBot".

## Visual direction: "Inside the Vault" (atmospheric, not skeuomorphic)

The material language of `SafeDoor` carries inside, with restraint. Documents, dates and amounts stay the clearest things on screen.

### Materials

New `frontend/src/components/vault/vault.css`, imported by `Overview.tsx` and `AppNav.tsx`. It defines custom properties on `.vault-room` (the `/app` shell's main area) and copies, without importing, the values `SafeDoor.css` uses. `SafeDoor.tsx` and `SafeDoor.css` are not changed (their tests must pass unedited).

| Token / class | Value and use |
| --- | --- |
| `--vault-canvas` | `#0B0B0C` matte obsidian page background; a single 2% noise-free radial lift at the top centre (`radial-gradient(ellipse 80% 30% at 50% 0%, rgba(255,255,255,.035), transparent 70%)`). No other gradient on any container. |
| `--vault-hairline` | `#2A2A2F`, 1 px. Separates sections and rows. No boxed cards and no card fills. |
| `.vault-well` | A recessed surface for active input only (the command bar, each approval strip, the empty drop zone): background `#0E0E10`, `box-shadow: inset 0 1px 0 rgba(0,0,0,.6), inset 0 0 0 1px #232328, 0 1px 0 rgba(255,255,255,.04)`, radius 10 px. Focus-within: 1 px ring `#3A3A40` plus the existing visible focus outline on the control. |
| `.vault-key` | The brushed-platinum key, the same gradient and text colour as `.safe-stage .safe-primary` (`repeating-linear-gradient(90deg, rgba(255,255,255,.22) 0 1px, rgba(0,0,0,.025) 1px 2px, transparent 2px 4px), linear-gradient(180deg, #F5F5F7 0%, #DCDCE1 46%, #C6C6CD 54%, #D6D6DB 100%)`). **Used once per screen**: the Overview's Upload button (and the empty state's "Choose files", which replaces it there). Every other action is a plain text or outline button. |
| `--vault-led-amber` `#FFC23D`, `--vault-led-emerald` `#7EEDB0`, `--vault-led-blue` `#7DB8FF`, `--vault-led-idle` `#8C8C93` | The LED colours, the same as SafeDoor's verifying, unlocked, sent and locked lights. |
| `.vault-ledger` | `font-mono tabular-nums` (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`), 13 px, `#D4D4DA`. Used for dates, euro amounts, warranty ends and verbatim source lines. |

**Guardrails:** no cartoon or mascot avatars, no rivets, screws, hinges or padlocks, no metallic gradient on any container, no glow behind text. AA contrast for every text colour on `--vault-canvas` and `.vault-well`; record the ratios in the PR.

### The status LED (`components/vault/StatusLed.tsx`)

`<StatusLed state="attention" | "processing" | "clear" | "empty" />` draws a 10 px circle (SVG, `aria-hidden`) in the matching colour. It always sits beside a text label, so colour is never the only cue: `clear` also draws SafeDoor's tick, `attention` draws a small vertical bar.
- `processing` pulses opacity from 1 to .35 over 1.4 s.
- Nothing pulses under `prefers-reduced-motion`.

**State, from the overview (one function, `ledState(overview)` in `lib/attention.ts`):** `empty` when `counts.total == 0`; otherwise `attention` when `attention_count > 0`; otherwise `processing` when `processing > 0`; otherwise `clear`.

**Pill label** (`ledLabel(overview)`, rendered with CSS `uppercase tracking-[.24em] text-[11px] font-bold`, so screen readers hear sentence case):

| State | Label |
| --- | --- |
| `attention` | "1 needs your yes" / "{n} need your yes" |
| `processing` | "Reading 1 document" / "Reading {p} documents" |
| `clear` | "All caught up" |
| `empty` | "Vault empty" |

**One source of words:** PR 4 changes `attentionStatusText()` (PR 3) to return `ledLabel()`'s sentence-case text, so the menu's DocBot status line, the bell's `aria-label` ("Notifications, 2 need your yes") and the Overview pill say the same thing. Update the PR 3 tests that pinned "1 item needs you" (allowed edit).

### `DocBotGlyph` (`components/vault/DocBotGlyph.tsx`)

A 20 px (menu, bell) or 28 px (Overview header) SVG built from a rounded square outline (1.5 px stroke `#D4D4DA`, radius 6) with a single short horizontal slot two-thirds down, like a document slot in a vault door. No face, no limbs. `aria-hidden`; its label comes from the adjacent text.

## Task 1: Routes, the menu and the glyph

**Files:** `frontend/src/App.tsx`, `frontend/src/components/AppNav.tsx`, `frontend/src/pages/AskAI.tsx`, `frontend/src/components/CommandPalette.tsx`, new `components/vault/DocBotGlyph.tsx`, `components/vault/StatusLed.tsx`, `components/vault/vault.css`, `lib/attention.ts`, tests (`AppNav.test.tsx`, `AskAI.test.tsx`, new `StatusLed.test.tsx`, `attention.test.ts`).

- Routes: `index` → lazy `Overview` (new `pages/Overview.tsx`). `ask` → `<AskAI />`, which now restores this session's last thread (the behaviour `home` had: `sessionStorage['docbot-thread:' + accountId]`). `ask/:conversationId` is unchanged. The `home` prop is removed.
- Primary menu, in order: **Overview** (`/app`, `House` icon), **Documents**, **Upload**, **DocBot** (`/app/ask`, `DocBotGlyph` with a `StatusLed` dot at its corner; on desktop the status line under the label; `aria-label` "DocBot, {status}"). The phone's bottom bar shows the same four. "More" (Search, Warranties) is unchanged.
- `isCurrent`: Overview only for exactly `/app`; DocBot for `/app/ask` and `/app/ask/*`.
- `AskAI` header and empty thread use `DocBotGlyph` + `StatusLed` instead of `DocBotMark` (D8).
- The `/app` shell's main area gets class `vault-room`.
- Command palette: add "Overview" (`/app`) and rename the old home entry to "DocBot" (`/app/ask`).
- [ ] **Tests first:**
  - the menu has four primary items in order on desktop and phone; Overview is current on `/app` only, and DocBot is current on `/app/ask/123`
  - `/app/ask` restores the stored thread id
  - `ledState` and `ledLabel` for every state, including the precedence attention > processing > clear
  - `StatusLed` renders a tick for `clear` and no animation under reduced motion
  - no `DocBotMark` renders inside `/app` (grep in a test over `src/pages` and `src/components/AppNav.tsx`)
- [ ] Commit: `Make the Overview the home and give DocBot its own page`

## Task 2: The Ask hand-off, Documents, the kind filter link and the return path

**Files:** `frontend/src/pages/AskAI.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/DocumentDetail.tsx`, `frontend/src/components/BillReview.tsx` (one attribute), `frontend/src/pages/Upload.tsx` (accept handed-over files), tests.

- **Ask hand-off:** the Overview's command bar and its prompt chips submit with `navigate('/app/ask', { state: { question } })`. `AskAI` reads `location.state.question` once and sends it as a new conversation, as if typed. It then clears it with `navigate(location.pathname, { replace: true, state: null })`, so a reload does not resend. The question never goes into the URL.
- **Documents:**
  - Remove the header "Ask" button. "Upload" stays (kept copy).
  - Read an optional `type` search parameter (one of the seven kinds) as the initial Type facet, so the Vault index can link to `/app/documents?type=Bill`. A kind is not personal data.
- **File hand-off:** `Upload` reads `location.state.files` (an array of `File`) once on mount, passes it to its existing `choose()` (so PR 6's dedupe and type filter apply), then clears the state with `replace`.
- **Return path (adjustment 4):**
  - Every Overview link to a document passes `state: { from: 'overview' }`.
  - `DocumentDetail`: when `location.state?.from === 'overview'`, the first breadcrumb reads "Overview" and goes to `/app`, and the back button's `aria-label` is "Back to Overview". Otherwise unchanged ("All Documents", "Go back").
  - The hash list that scrolls to and focuses a heading becomes `['#bill-review-heading', '#bill-reminder-heading', '#bill-split-heading']`. `BillReview`'s `h3#bill-review-heading` gains `tabIndex={-1}` (no other change to the component).
- [ ] **Tests first:**
  - a question typed on the Overview arrives as the first user message on `/app/ask`, is not in `location.search`, and a reload does not resend it
  - Documents has no "Ask" button; `/app/documents?type=Bill` opens with the Bill facet selected
  - files handed to `/app/upload` are queued once each
  - opening a bill with `from: 'overview'` and `#bill-review-heading` focuses the Bill review heading and shows the "Overview" breadcrumb
- [ ] Commit: `Hand questions and files on from the Overview and bring the owner back to it`

## Task 3: The Overview page

**Files:** new `frontend/src/pages/Overview.tsx`; new `frontend/src/components/overview/` with `AgentHeader.tsx`, `CommandBar.tsx`, `NeedsYourYes.tsx`, `ComingUp.tsx`, `RecentActivity.tsx`, `VaultIndex.tsx`, `EmptyVault.tsx`; new `frontend/src/lib/vaultBrief.ts`; new `Overview.test.tsx` and `vaultBrief.test.ts`.

### Composition

- **1366 × 768:** `vault-room` canvas; content `max-w-[72rem]`, `px-10 pt-10`.
  1. **Agent header** (full width).
  2. **Command bar** (full width, directly under the header; never pinned).
  3. From 1280 px, a 12-column grid. **Left 8:** Needs your yes, then Coming up. **Right 4 (rail):** Recent DocBot activity, then Vault index. Below 1280 px the rail drops under the left column in the same order.
- **390 × 844:** `px-4 pt-5`, one column in this order: agent header (Upload omitted; it is in the bottom bar) → command bar (scrolls with the page) → Needs your yes → Coming up → Recent DocBot activity. Vault index is not shown on phones (the Documents tab covers it). Nothing is sticky except the existing 4-tab bottom bar. The page scroll ends 16 px above the bar. No sideways scroll at 320 px.

### Agent header (Grok-style brief)

- Row 1: `DocBotGlyph` (28 px) and the **LED pill** (`StatusLed` + `ledLabel`, in a hairline-bordered pill 24 px tall). At the right on desktop, the **Upload** button with `.vault-key` (icon `Upload`, label "Upload", goes to `/app/upload`).
- Row 2: `h1` greeting: "Good morning" (05:00–11:59), "Good afternoon" (12:00–17:59), "Good evening" (otherwise), followed by ", {display_name}" when the profile has one. Never "Welcome back" (kept copy of the sign-in page). 30 px Geist 600, tight tracking; 26 px on phones.
- Row 3: the **vault brief**, at most two lines, 15 px `#C9C9CF`, built by `vaultBrief(overview, today)`. It is deterministic, has no model call, and works in local dates with weeks starting Monday:

  | Situation | Line 1 | Line 2 (only if it has content) |
  | --- | --- | --- |
  | attention ≥ 1 | "{n} need{s} your yes: {first item's phrase}{, and {k} more}." | "This week: {title} €{amount} due {Thu 20 Nov}{; {k} more}." from upcoming items dated this week, else "Next: {title} on {Thu 20 Nov}." from the first upcoming item |
  | attention 0, upcoming ≥ 1 | "Nothing needs your yes." | the same line 2 rule |
  | calm (attention 0, upcoming 0) | "Nothing needs you this week." | "Next: {title} on {d MMM yyyy}." from `next_after_window`, if it exists |
  | processing > 0 (any situation) | unchanged | appends " Reading {p} new document{s}." to line 2, or becomes line 2 |

  The item phrases are: `bill_unconfirmed` "{title} to confirm"; `reminder_pending` "a reminder for {title}"; `split_stale` "the split on {title}"; `processing_failed` "{title} could not be read"; `warranty_ending` "the warranty on {title} ends {d MMM}". Amounts and dates in the brief use `.vault-ledger`.

### Command bar

- A `.vault-well` form, 52 px tall: `DocBotGlyph` (16 px) at the left; the input (placeholder "Ask DocBot…", `aria-label` "Ask DocBot"); a send button (`ArrowUp`, `aria-label` "Send to DocBot"), disabled while empty.
- Under it, three compact prompt chips (hairline border, 28 px, 13 px text): "When is my next bill due?", "Which warranties end this year?", "What does my insurance cover?". Pressing a chip hands its text over exactly like a typed question (Task 2).
- Hidden in the empty vault.

### Needs your yes (approval strips)

- `h2` "Needs your yes". At its right, the "Check now" text button, moved from Documents (same handler, toast, live-region copy and 409/429 messages as `Dashboard.tsx` `checkNow()`; it invalidates `['overview']`).
- One `.vault-well` strip per `overview.attention` item, all of them (no cap), 12 px apart. Each strip has three parts:
  1. **Extracted summary**, 15 px medium, with amounts and dates in `.vault-ledger`.
  2. **Verbatim source line**, when the item has `source`: `L{line}` then the text exactly as stored, in muted `.vault-ledger` (`#8C8C93`), truncated to one line with the full text in `title`.
  3. **One action**: an outline button with sharp 6 px corners, at the right on desktop and full-width under the text on phones, at least 44 px tall.

| Kind | Extracted summary | Action | Target |
| --- | --- | --- | --- |
| `bill_unconfirmed` | "{title} · €{amount} due {d MMM}" (parts that were not read are omitted) | "Confirm bill" | Link to `/app/documents/{id}?tab=info#bill-review-heading`, `state: { from: 'overview' }`. Lands on Bill review with its heading focused; the owner confirms there with the existing flow. |
| `reminder_pending` | "{title} · remind {d MMM} · €{amount} due {d MMM}" | "Approve reminder" | Link to `#bill-reminder-heading`. Lands on the Reminder panel showing the exact proposal; the owner approves there with "Approve and save". **The Overview never approves.** |
| `split_stale` | "{title} · €{amount} · the bill changed after the split" | "Update split" | Link to `#bill-split-heading`. Lands on Bill split. |
| `processing_failed` | "{title} · could not be read" | "Read details again" | Button in place. It calls `retryDocumentProcessing(id)` (a full re-read, because a failed document has no text to re-read details from), shows "Reading again…", and invalidates `['overview']`. The strip leaves when processing starts. On error, toast "Could not retry processing. Try again." |
| `warranty_ending` | "{title} · warranty ends {d MMM yyyy}" | "View document" | Link to `/app/documents/{id}`, `state: { from: 'overview' }`. |

- **How the owner returns:** the detail page's "Overview" breadcrumb or back button (Task 2), the browser back button, or the menu. `useOverview` refetches on mount, so the strip the owner just resolved is gone on return, and the LED, pill and brief update with it. The bill panels' save logic does not change.
- **No items:** one line, "Nothing needs your yes.", with an emerald LED dot.

### Coming up (60-day archival ledger)

- `h2` "Coming up". Groups: "This week" (today to Sunday), "Next week" (the following Monday to Sunday) and "Later" (the rest of the 60 days). Empty groups are hidden.
- A vertical ledger. A fixed 92 px `.vault-ledger` date column ("Thu 20 Nov") and a 1 px `--vault-hairline` timeline rule with a 5 px node per row. Then the title (15 px) and, on the right, the amount in `.vault-ledger`. The whole row links to the document with `state: { from: 'overview' }`.
- Each row carries a provenance tag, 11 px uppercase tracking, hairline pill:

| Kind | Detail | Tag |
| --- | --- | --- |
| `bill_due`, confirmed | "Due" + amount | "Confirmed" (emerald text `#7EEDB0`) |
| `bill_due`, not confirmed | "Due" + amount (if read), and the source line under it in muted `.vault-ledger` | "From document" (`#C9C9CF`) |
| `renewal` | "Renewal" and the source line | "From document" |
| `contract_end` | "Term ends" and the source line | "From document" |
| `warranty_end` | "Warranty ends" | "Saved" (`#C9C9CF`) |

- **None in 60 days:** "No due dates, renewals or warranty ends in the next 60 days." plus, when `next_after_window` exists, "Next: {title} on {d MMM yyyy}" as a link.

### Right rail (desktop ≥ 1280 px; below 1280 px it stacks under the left column, and Recent activity stays on phones)

- **Recent DocBot activity** (`h2` "Recent activity"): `overview.recent` as compact chips, one per line, each a link to its document (`state: { from: 'overview' }`).
  - A chip is a hairline pill, 32 px, holding an outcome dot, "{title}", a muted " · ", then `outcome_label`. The title truncates first.
  - Dot colour by `outcome`: `due_date_flagged` amber; `bill_confirmed`, `warranty_added`, `renewal_found`, `term_end_found` and `ready` emerald; `processing` blue, pulsing (static under reduced motion); `failed` `#FF9A9A`.
  - Example: "Linkline Broadband bill — November 2026 · Due date flagged".
  - Footer link "All documents".
- **Vault index** (`h2` "Vault index"; not shown on phones): one column. Each kind with `counts[kind] > 0`, in the fixed order Bill, Insurance, Warranty, Receipt, Contract, Manual, Other. Labels are plural: "Bills", "Insurance", "Warranties", "Receipts", "Contracts", "Manuals", "Other". Each row has the count right-aligned in `.vault-ledger` and links to `/app/documents?type={Kind}`. The last row reads "All documents" with `counts.total` and links to `/app/documents`.

### States

| State | What shows |
| --- | --- |
| Loading | Header with the glyph and an idle LED reading "Checking…", the greeting and the command bar render at once. Each section shows three 12 px skeleton bars with `aria-busy="true"`. No spinner. |
| Error | The pill reads "Status unavailable" with an idle LED. Under the brief: "Could not load your overview." and a "Try again" button that refetches. The command bar stays usable. |
| **Empty vault** (`counts.total == 0`) | Header: glyph, idle LED "Vault empty", greeting. Then a centred `.vault-well` drop zone (min 240 px tall desktop, 200 px phone) holding a status line in `.vault-ledger`: "DocBot reads due dates, renewals and warranty end dates automatically." Under it, the line "Drop a bill, receipt or policy here" and the `.vault-key` button "Choose files", which opens a hidden `input[type=file]` with the Upload page's `accept`. Dropped or chosen files go to `/app/upload` with `state: { files }` (Task 2), where they are queued. The zone highlights its hairline on drag-over and announces "Release to add files". There is no command bar and no other section. |
| **Calm** (documents exist, `attention == []`, `upcoming == []`) | Emerald LED "All caught up". The brief reads "Nothing needs you this week." plus "Next: {title} on {date}." when `next_after_window` exists. The command bar and its three chips are the focal point, with 24 px more space above and below than in other states. Needs your yes shows "Nothing needs your yes."; Coming up shows its none-in-60-days line. Recent activity and Vault index render as usual, so the page is never blank. |
| Processing | Blue pulsing LED "Reading {p} documents" when nothing needs a yes. The brief gains " Reading {p} new documents." Recent activity shows blue processing chips. The overview polls (PR 3). |

### Accessibility

- One `h1`. Every section is an `h2` with `aria-labelledby`. Strips, ledger rows and chips are list items in `ul`s.
- Navigation actions are links. "Read details again", "Check now", send and "Choose files" are buttons.
- The pill text is real text, not CSS content. The LED never carries meaning alone.
- The retry, check and drop results are announced in one polite live region.
- Visible focus everywhere. AA contrast. No motion under `prefers-reduced-motion`.

- [ ] **Tests first** (`Overview.test.tsx` with a mocked overview; `vaultBrief.test.ts`):
  - **Live-run scenario:** amber pill "2 need your yes". Brief line 1 is "2 need your yes: {first bill's title} to confirm, and 1 more." Two strips with "Confirm bill" links to `#bill-review-heading` carrying `from: 'overview'`. The broadband strip shows "€45.00 due {d MMM}" and the source line `L{n} Payment due date: {date}` exactly as in the mocked `source`. Coming up puts the broadband bill under "This week" with a "From document" tag and the renewal under "Later" with its source line. Recent activity shows "Due date flagged", "Warranty added" and "Renewal found" chips.
  - A pending reminder shows "Approve reminder" linking to `#bill-reminder-heading`, and no approve control exists on the page.
  - A failed document shows "Read details again", which calls `retryDocumentProcessing`.
  - Calm: emerald "All caught up", the brief with "Next:", the three chips.
  - Empty: idle "Vault empty", the drop zone, no command bar; dropping two files navigates to `/app/upload` with them.
  - Processing-only: blue "Reading 1 document".
  - Error and retry.
  - The brief's grammar for 1 and 3 items, and the "This week" vs "Next" rule across a Sunday/Monday boundary.
  - Phone (390 px): section order, no Vault index, no Upload in the header.
  - Vault index links to `/app/documents?type=Bill`.
- [ ] Commits: `Add the vault materials, LED and DocBot glyph`, `Open the Overview with DocBot's brief and command bar`, `Show what needs the owner's yes as approval strips`, `Show the 60-day ledger and DocBot's recent activity`, `Show the empty and calm vault`

## Task 4: Move "Check now", update the e2e suite

**Files:** `frontend/src/pages/Dashboard.tsx` (remove "Check now"; the Needs attention panel stays until PR 5), `frontend/e2e/*.spec.ts`.

- **Allowed e2e edits** (grep before each):
  - Sign-in assertions that expected `heading 'DocBot'` on `/app` (`accessibility.spec.ts:57,93,117`, `app.spec.ts:56,68`) expect `heading level 1` matching `/^Good (morning|afternoon|evening)/`.
  - `redesign-screens.spec.ts:123` shoots `home` on `/app` with the Overview heading, and adds `docbot` on `/app/ask` with `heading 'DocBot'`.
  - `docbot.spec.ts:157,182` press "Check now" on the Overview (`/app`) instead of Documents; the bill-row assertions after it are unchanged.
  - Any step that clicked the old "Ask" item opens "DocBot" instead.
  - Any step that located the DocBot mascot inside `/app` locates the glyph or the status text instead.
- New `e2e/overview.spec.ts` (second account; synthetic documents drawn as in `fixtures/redesign/documents.ts`):
  - after the October bill is read, the Overview shows the amber pill and a "Confirm bill" strip with its source line
  - clicking the strip lands on Bill review with focus on its heading, and the "Overview" breadcrumb returns to `/app`
  - after confirming, the strip is gone and the pill count drops by one
  - a chip question lands on `/app/ask` as the first message
  - axe passes on `/app` at 1366 and 390 px, with no sideways scroll at 390 and 320 px
- [ ] Commit: `Check the Overview end to end`

## Task 5: Screenshots, record, review and PR

- [ ] A headless Playwright script (run from `frontend/`, `chromium.launch({ headless: true })`) saves these to the untracked `C:\DocVault\evaluation\dashboard-redesign\`, not committed (populated = the four live-run documents):
  - `after-empty-app-1366.png`, `after-empty-app-390.png`
  - `after-populated-app-1366.png`, `after-populated-app-390.png`
  - `after-calm-app-1366.png`, `after-calm-app-390.png`
  - `after-processing-app-1366.png`
- [ ] **Owner look before the PR opens:** show the owner the screenshots next to `/login` and the live page in the Browser pane. Apply only the changes the owner asks for.
- [ ] Gates: frontend `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`, and the full Playwright suite on a disposable stack; backend tests as a regression check.
- [ ] Reviewer: `reviewer`.
- [ ] PR `feature/dashboard-redesign-4-overview-home`, `Part of #48`. Record in `Repo_Current_State.md` that decision 5 of the DocBot redesign plan is superseded by D1, and that D8 removes the mascot inside `/app`.

## Acceptance checks

| # | Check | Verified by |
| --- | --- | --- |
| 1 | `/app` shows the agent header with LED pill and brief, the top command bar, Needs your yes, Coming up, Recent activity and Vault index, all from one overview request | `Overview.test.tsx`; `overview.spec.ts` |
| 2 | Each strip shows the extracted summary, the verbatim source line when one exists, and the one action and target in the table; the Overview never approves a reminder or saves a bill | `Overview.test.tsx`; Reviewer |
| 3 | The LED and pill follow attention > processing > clear > empty, and the menu, bell and pill use the same words | Task 1 tests |
| 4 | From a bill opened on the Overview, the owner returns with the "Overview" breadcrumb and the resolved strip is gone | `overview.spec.ts` |
| 5 | Empty, calm, processing, loading and error states render as specified | `Overview.test.tsx`; screenshots |
| 6 | The brushed-platinum key appears once per screen; no mascot, rivets, padlocks or container gradients inside `/app` | Reviewer; screenshots; Task 1 test |
| 7 | DocBot is one chat at `/app/ask`; a question or chip from the Overview arrives there without entering the URL; Documents has no "Ask" button | Task 2 tests |
| 8 | Four primary menu items on desktop and phone; axe clean; no sideways scroll at 390 and 320 px | `AppNav.test.tsx`; `overview.spec.ts` |
| 9 | Kept copy, `SafeDoor` tests and every reminder test unchanged | Reviewer; gates |
