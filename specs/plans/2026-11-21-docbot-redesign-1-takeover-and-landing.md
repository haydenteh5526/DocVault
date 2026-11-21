# DocBot Redesign, PR 1 of 2: Take Over Codex's Draft, DocBot, the Folder Mascot, the Logo and the t3 Landing Page

**Status:** approved by the owner on 20–21 November 2026 as revisions R1, R2 and R3 of `specs/plans/2026-11-20-agent-experience.md` (on `feature/agent-experience`), and the [redesign review](https://claude.ai/artifact/T92uXnst4xzik6TfqFSqJg) version 7. This file restates those decisions as one buildable PR. Nothing in it is implemented.

**Issue:** #35. The PR says `Part of #35`.

**Sequence:** PR 1 (this file), then PR 2 (`2026-11-21-docbot-redesign-2-vault-door.md`).
- **Start condition:** PR 38 (DocBot's daily check, PR A2) has merged into `main`. It brings `ASSISTANT_NAME = 'DocBot'`, household preferences and "Check now".
- **Later, in a separate plan:** the agent-experience plan's PR A1 work, which needs backend changes:
  - approving from the chat card
  - the trace
  - the lead-days preference in chat
  - `last_check_at` and migration 020
  - routine events in the thread

**Goal:** ship the redesign Codex drafted in draft PR 37 (branch `feature/pip-redesign-exploration`, head `210c7dd`, built from `23f5238`), corrected to the owner's later decisions:
- DocBot instead of Pip
- an original paper-and-folder mascot
- the Vault-Page Monogram logo
- a landing page in the t3.codes structure instead of x.ai's

Frontend only. No backend, migration or API change.

## Decisions (approved; do not reopen)

1. **Name:** "DocBot", one word, from `ASSISTANT_NAME` only. No visible "Pip" anywhere.
2. **Mascot:** a paper-and-folder figure, original (no stock art). Two variants and four states (Task 3).
3. **Logo:** the Vault-Page Monogram, exactly as the owner's reference, in ink `#171717` on light and `#F2F2F3` on dark. No hinge marks.
4. **Theme:** public pages always dark. The app is dark when no preference is stored; Settings still offers Light and System.
5. **Home:** DocBot's thread is `/app`. No chat list in the side menu, Settings only in the account menu. A "keeping track" panel shows from 1280 px.
6. **Landing:** t3.codes structure, bold Geist 800 headlines, no testimonials (Task 5).
7. **Codex's draft is unreviewed.** The Reviewer checks the whole result as new code.

## Global constraints

- Test first. No AI or tool attribution. No new npm dependency. €0. Synthetic data only. Disposable stacks only; never `dvdemo` (3100), `dvfriday` (3700) or the owner's account.
- **Approvals unchanged:** no new save path. Every `BillReminder` and `test_reminders` test passes unedited.
- **Kept copy** (tests depend on it):
  - "Reminder proposal", "not saved when proposed", "Open bill to see its status"
  - "Approve and save", "Cancel proposal", "Saved · reminder for {date}"
  - "Upload" (exact, on Documents), "Recent chats"
  - "Welcome back", "Sign in", "Create account"
- **Allowed e2e edits:**
  - the home assertions after sign-in move from "Documents" to the DocBot home `h1` "DocBot"
  - the landing scenarios are rewritten for Task 5
  - the dark-scheme scenario now expects the dark landing page
  - Codex's existing e2e edits, after checking each one against this list

  Grep `frontend/e2e` before changing any visible string.
- **Accessibility:** WCAG AA contrast on the dark palette (record the ratios in the PR), visible focus everywhere (keep PR 39's single soft composer border), one `h1` per page, and nothing moves under `prefers-reduced-motion`.

## Task 1: Bring in Codex's draft on top of `main`

- Cut the worktree from `feature/docbot-redesign`. Rename the tool branch to `feature/docbot-redesign` before pushing.
- `git fetch origin feature/pip-redesign-exploration`, then `git merge --no-ff origin/feature/pip-redesign-exploration`.
- **Resolve conflicts in favour of `main`'s behaviour:**
  - `AppNav.tsx`: no Settings in the rail (PR 39); Codex's presence row and no chat list are kept.
  - `AskAI.tsx`: PR 39's composer focus rule (`data-focus-ring="container"`, `focus-within:border-muted-foreground`) and Codex's home layout.
  - `index.css`: PR 39's focus exclusions plus Codex's dark tokens.
  - `theme.ts`: PR 39's lower-cased `isAppPath` plus Codex's dark default.
  - `Dashboard.tsx`: PR 38's "Check now" and warranty rows plus Codex's changes.
  - `lib/assistant.ts`: `main`'s `ASSISTANT_NAME = 'DocBot'` and `proposedByText`.
- Codex's screenshots under `evaluation/pip-redesign/` are kept as "before R3" evidence. Task 6 adds the new ones.
- [ ] `npm ci`, `npx tsc -b`, `npm run lint`, `npm test` pass on the merge before any new work. Commit: `Bring in the drafted redesign on top of main`

## Task 2: Rename Pip to DocBot throughout the draft

- **Components:**
  - `PipMark` becomes `DocBotMark` (replaced in Task 3)
  - `PipActivity` becomes `DocBotActivity`
  - `usePipActivity` becomes `useDocBotActivity`
  - the `pip-warranties` query key becomes `docbot-warranties`, with any `pip-*` CSS classes renamed to `docbot-*`
- **Copy:** every visible "Pip" becomes `ASSISTANT_NAME`, for example "Meet DocBot, who keeps your paperwork moving." and "Message DocBot".
- [ ] **Test first:** `src/noPipCopy.test.ts` reads every `src/**/*.tsx` and fails on the visible word `Pip` (case-sensitive `\bPip\b`, skipping comments and import paths). Update every test that matched "Pip".
- [ ] Commit: `Name the assistant DocBot everywhere`

## Task 3: The folder mascot (`DocBotMark`)

- **File:** `frontend/src/components/DocBotMark.tsx`, replacing Codex's page-with-eyes `PipMark`.
- **Interface:** `export function DocBotMark({ variant = 'head', state = 'idle', size = 24 }: { variant?: 'full' | 'head'; state?: 'idle' | 'working' | 'needs-approval' | 'done'; size?: number })`
- **Drawing:** inline SVG, with the geometry copied from the review's version 7 symbols `docbot-head*` and `docbot-full*`.
  - an amber folder: back `#E39A12`, front `#FFC23D`, 2 px ink outline `#14171F`
  - a white page with three blue lines (`#6E9BE0`) and a small photo card tucked behind the front
  - a face on the front: oval eyes with white highlights, a smile, and pink blush `#FF8FA3` at 75%
  - `full` adds ink arms and legs, with round hands and flat feet. `head` has no limbs and is used below 32 px.
- **States:**
  - `working`: eyes look up and right, with a flat mouth
  - `needs-approval`: taller eyes, a small open mouth, and an orange `#FF8A3D` badge with "!"
  - `done`: closed happy eyes and an open smile; `full` waves
- **Motion:** an occasional blink (class `docbot-blink`) and a 2 px bob in `working` (class `docbot-bob`). Both are off under reduced motion.
- **Use:**
  - `head` in the side-menu presence row (22 px), chat bubbles (20 px) and the home header (28 px)
  - `full` on the landing page's DocBot section and the empty thread
  - the state comes from Codex's existing logic (`needs-approval` replaces `needs-you`)
- **Accessibility:** `aria-hidden`. The status is always written beside it.
- [ ] **Tests first** (`DocBotMark.test.tsx`): each variant and state renders its own shapes, `aria-hidden`, and no `docbot-blink` or `docbot-bob` under reduced motion. Delete `PipMark.test.tsx`.
- [ ] Commit: `Draw DocBot as a paper-and-folder mascot`

## Task 4: The Vault-Page Monogram

- **File:** `frontend/src/components/VaultMonogram.tsx`. `export function VaultMonogram({ size = 28 }: { size?: number })` renders an inline SVG on a 64 grid, all in `currentColor`:
  - frame: `rect` x 5, y 5, 54 × 54, `rx` 14, stroke 6, no fill
  - page outline: path `M20.5 15h19l9 9v21.5a4.5 4.5 0 0 1-4.5 4.5h-23.5a4.5 4.5 0 0 1-4.5-4.5v-26a4.5 4.5 0 0 1 4.5-4.5z`, stroke 3.6
  - folded corner, filled: `M39.5 15v6.5a2.5 2.5 0 0 0 2.5 2.5h6.5z`
  - inner edge line: `M21.5 21.5v22`, stroke 2.6
  - keyhole: a circle at (32.5, 30.5) r 3.6, plus `M30.8 32.5h3.4l1.1 7h-5.6z`
  - `aria-hidden`
- **Where it's used:**
  - `Wordmark.tsx`: the monogram plus "DocVault" in Geist 700, coloured `#171717` on light and `#F2F2F3` on dark (via a `--brand-ink` token). It replaces the `FileText` glyph.
  - `public/favicon.svg`: the same SVG in `#171717` on a transparent background, with `<title>DocVault</title>`.
  - `public/manifest.json`: the icon stays `/favicon.svg`.
- [ ] **Test first:** update `brand.test.ts`. `favicon.svg` contains `<title>DocVault</title>`, the keyhole path, and no `FileText` path. `Wordmark` renders the monogram and the text "DocVault".
- [ ] Commit: `Use the Vault-Page Monogram as the logo`

## Task 5: The landing page in the t3.codes structure

> **Superseded in part (21 Nov 2026):** [`2026-11-21-landing-positioning.md`](2026-11-21-landing-positioning.md) replaces this task's `h1`, lead and section copy, and the landing page now uses the t3.codes font stack at weight 600 instead of Geist 800.

- **Files:** `pages/Landing.tsx`, `landing.css`, new `components/landing/FloatingTiles.tsx` and `components/landing/QuestionMarquee.tsx`. This replaces Codex's x.ai-style hero, the four product panels and the "Choose how to start" cards.
- **Order and exact copy.** The page is dark, with a faint 28 px grid of `--border` lines behind the hero.
  1. **Top bar:** the Wordmark; "Sign in" (link); "Create an account" (white button).
  2. **`h1`:** "Your documents, answered and kept on track." (Geist 800, `clamp(2.6rem, 6.5vw, 5rem)`, letter-spacing `-0.03em`).
     - **`FloatingTiles`:** six 56 px rounded tiles around the hero, tilted between −9° and 9°, drifting 4 px on a slow loop. Lucide `Receipt`, `FileText`, `BookOpen`, `ShieldCheck`, `ShoppingBag`, plus `DocBotMark` (head). `aria-hidden`; still under reduced motion; hidden below 640 px.
  3. **Lead:** "Ask your bills, leases and manuals in your own words. DocBot shows the line every answer came from and asks before it saves anything."
  4. **Buttons:** "Create an account" (`/register`, the only primary button in the hero), then a text link with the Lucide `Github` icon: "Run it yourself on GitHub", to the README's Quick start.
  5. **Product picture:** a `figure role="img"` of DocBot's home, built from real components with static synthetic data:
     - alt text: "DocBot's home: the side menu with DocBot's status, a question about the electricity bill answered with 23 November 2026 from line 17, and a reminder that requires approval."
  6. **`QuestionMarquee`:** two rows scrolling in opposite directions. Pauses on hover and focus; still under reduced motion. The moving copies are `aria-hidden`, and the list appears once as a visually hidden `ul`. The questions:
     - "When is the electricity bill due?"
     - "How much notice do I give the landlord?"
     - "What does E21 mean on the dishwasher?"
     - "Is the kettle still under warranty?"
     - "Split the gas bill by days at home"
     - "How much was the October bill?"
     - "When does the tenancy end?"
     - "Remind me two days before the bill is due"
  7. **`#meet-docbot` section:** `h2` "Meet DocBot, who keeps your paperwork moving." with `DocBotMark variant="full" state="done"`, beside Codex's static thread showing a "Requires approval" card.
  8. **"Bring your own documents"** (`h2`), with the line "Photos or PDFs. DocVault reads them on your computer." and five joined cards with Geist Mono captions:
     - Bills: "amount · due date"
     - Leases: "notice · rent day"
     - Manuals: "fault codes"
     - Warranties: "end dates"
     - Receipts: "proof of purchase"
  9. **Feature block 1:** a static "Requires approval" card ("Reminder on 21 November · proposal 2", "€123.47 · split 4 ways · line 17", plus "Approve and save" and "Review in bill" chips).
     - `h2` "One button to approve. Nothing saves without it."
     - ticks: "Every value tied to its source line", "Splits worked out in whole cents", "Reminders proposed, never sent"
  10. **Feature block 2:** a terminal card with the lines:
      - `$ git clone https://github.com/haydenteh5526/DocVault`
      - `$ docker compose up -d`
      - `✓ api, worker, db, ollama ready`
      - `$ open http://localhost:3000`

      Beside it:
      - `h2` "If you'd rather run it yourself, you can."
      - ticks: "Runs on your own computer", "Local OCR and search", "€0 to run"
      - the link "Read the setup"
  11. **Codex's stats row:** "0", "Line 17" and "€0", with the same captions.
  12. **Closing:** `h2` "Your paperwork deserves better than a drawer.", then "Create an account".
  13. **Footer, one line:** "© 2026 DocVault · final-year project" on the left; GitHub, Privacy, Evaluation on the right.
- No testimonials, logos of other companies, or invented numbers.
- [ ] **Tests first** (`Landing.test.tsx`, rewritten):
  - one `h1` with the text above
  - no form fields
  - the picture's alt text
  - the hidden question list has all 8 questions, and the moving rows are `aria-hidden`
  - 5 document cards
  - the 4 `h2`s (Meet DocBot, Bring your own documents, both feature blocks) plus the closing `h2`
  - no drift or marquee classes under reduced motion
  - PR 26's banned-claims assertions unchanged
- [ ] **`e2e/landing.spec.ts`:**
  - at 1366 × 768, the `h1`, the button and the top of the picture are on the first screen
  - at 390 × 844, no sideways scroll and no floating tiles
  - axe passes
  - the computed `body` background is `rgb(10, 10, 11)`
- [ ] Commit: `Rebuild the landing page in the t3 structure`

## Task 6: Check the home against the approved design, then record and review

- **Confirm, and fix where needed, with a test for each:**
  - `/app` renders DocBot's thread with `h1` "DocBot"
  - the side menu's first item is DocBot's presence row (mark, "DocBot", status text, accessible name "DocBot, {status}")
  - no chat list and no Settings item in the side menu
  - cards that need a decision show "Requires approval" above the kept "Proposal {n} · not saved when proposed"
  - the composer reads "Message DocBot", with PR 39's focus rule
  - the "keeping track" panel shows from 1280 px with only groups that have data; below that it opens from "Activity"
  - `theme.test.ts`:
    - public paths are dark with every preference
    - `/app` is dark with no stored preference
    - light with `'light'`
    - follows the media query with `'system'`
    - `/APP/documents` still counts as the app (PR 39)
- [ ] Screenshots of `/`, `/login` and `/app` at 1366 × 768 and 390 × 844, in light and dark for `/app`, into `evaluation/docbot-redesign/`. Record the contrast ratios in the PR.
- [ ] Update `specs/Repo_Current_State.md` and the README feature list: DocBot, the logo, the landing page. State only what was run.
- [ ] **Gates:** `npm ci`, `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`, and Playwright on a disposable stack. Backend untouched.
- [ ] Call `reviewer` with this plan and issue #35. Show the owner the full report, fix only what he approves, and open the PR from `feature/docbot-redesign`. It merges under the `AGENTS.md` merge rule on the owner's approval.
- [ ] After it merges, the owner closes draft PR 37 (or says so), with a comment linking this PR.

## Acceptance checks

| # | Check | Verified by |
| --- | --- | --- |
| 1 | No visible "Pip" remains; the assistant is DocBot from one constant | `noPipCopy.test.ts`; `lib/assistant.test.ts` |
| 2 | DocBot is an original folder mascot, full and small, in four states, still under reduced motion | `DocBotMark.test.tsx` |
| 3 | The header, favicon and app icon use the Vault-Page Monogram in ink, readable on light and dark | `brand.test.ts`; screenshots |
| 4 | The landing page follows the t3 structure with DocVault's own content and no testimonials, and passes axe | `Landing.test.tsx`; `landing.spec.ts` |
| 5 | DocBot's thread is the signed-in home: presence row, no chat list, Settings only in the account menu, the panel from 1280 px | Task 6 tests; e2e home assertions |
| 6 | Public pages are dark; the app is dark by default and keeps Light and System | `theme.test.ts` |
| 7 | No approval path, backend or dependency changes; all kept copy and existing reminder tests unchanged | Reviewer; gates |
