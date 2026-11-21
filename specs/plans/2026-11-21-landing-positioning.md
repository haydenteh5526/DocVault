# Landing Page Positioning: Introduce DocVault as a Personal AI Document Assistant

**Status:** proposed by the Architect on 21 November 2026. Approved by the owner the same day with D1–D5 as recommended. Implemented on `feature/landing-positioning`, which is stacked on `feature/landing-hover-parallax` (t3 header hover, tile layout and load-in, Inter at 600). **Owner changes after review (21 Nov), which override the tasks below where they differ:**
- The eyebrow is removed (D2 withdrawn). The category now lives in the lead.
- The lead is shortened to two lines at 1366 px, as on t3.codes, with `max-width: 680px` instead of `60ch`: "Your personal AI document assistant. Upload photos or PDFs, ask in your own words, and get answers that cite their source line." Approval, the honest miss and running locally are shown further down the page.
- The hero is placed as on t3.codes: `.docbot-site main > .landing-hero { padding-top: clamp(56px, 8.8vw, 120px) }` (the headline starts 120 px below the header on desktop), the `h1` maximum is 4.75rem (76 px) with `max-width: 16ch` and a 22 px gap to the lead. The owner overrode Task 1's "do not shrink the `h1`".
- The lower pair of hero tiles moves from y 440 px to 370 px so it stays beside the buttons of this shorter hero.
- The miss in Meet DocBot shows no caption ("No matching source line" was dropped), because the product shows no source on a miss.
- Tests follow these changes: no eyebrow, the new lead, and the e2e first-screen scenario asserts the lead and the `h1` are each two lines at 1366 px.

**Issue:** #35. The PR says `Part of #35`.

**Start condition:** `main` at or after `ae59752` (PR 42, landing polish and logo).

**Why:** the owner finds that the landing page reads as a bills tool. The lead names bills first, Meet DocBot shows a bill and a reminder, the document cards and the question marquee start with bills, and the stats point at the bill's line 17. The headline and lead were approved copy in `2026-11-21-docbot-redesign-1-takeover-and-landing.md` (Task 5), so this plan replaces only that copy and the order of the examples. Everything else in Task 5 and PR 42 stays.

**Goal:** a first-time visitor learns in the first screen that DocVault is a personal AI document assistant: you upload paperwork, ask in your own words, and get answers tied to the line they came from. Bills, leases, manuals, warranties and receipts become examples, with bills no longer first.

Frontend only: `pages/Landing.tsx`, `pages/landing.css`, `pages/Landing.test.tsx`, `components/landing/QuestionMarquee.tsx` (order only), `e2e/landing.spec.ts`, and, if D1 is approved, `index.html` and `public/manifest.json`. No backend, API, approval-path or dependency change.

## Kept (do not change)

- The t3.codes structure, the sticky header (wordmark, Sign in, GitHub), the dark theme, the floating tiles, the grid behind the hero, the footer.
- "Get started" as the hero's only primary button; "Run it yourself on GitHub" as its text link; the closing "Get started".
- DocBot only through `ASSISTANT_NAME`. Citations are OCR lines ("line 14"), never clauses or sections.
- The product picture's markup and content (lease line 14, kettle receipt). Only its alt text changes.
- "One button to approve" with the electricity-bill card and line 17, the terminal block, the closing `h2`.
- No testimonials, no company logos, no invented numbers. The banned-claims test is unchanged.

## Claims check (what the copy may say)

| Copy | Supported by |
| --- | --- |
| "photos or PDFs" | `ALLOWED_TYPES` in `backend/app/routers/documents.py`: JPEG, PNG, WebP, PDF |
| "points to the line each answer came from" | Chat sources show `document_title · line {line_start}` (`AskAI.tsx`); bill facts show their OCR lines (`AssistantAction.tsx`). Limit: a source without `line_start` shows only its title; the copy was already approved in this form in Task 5 |
| "says so when your documents don't" | `NOT_FOUND_ANSWER = "I couldn't find this in your documents."` (`rag_service.py`) |
| "asks before it saves anything" | Reminders are pending proposals until approved; splits from chat are previews only (MVP design, issue #3 and #5) |
| "AI" | Answers to document questions are written by a local language model over local embeddings (Ollama). The tool selector is a keyword router by default; the copy does not claim the model picks tools |
| "runs on your own computer" | Local Tesseract OCR, Ollama, Compose stack; already approved in Task 5 |
| "E21 … water temperature too low" | Synthetic manual `evaluation/retrieval/corpus/D08-dishwasher-manual.txt`, line 22 |

Not allowed: "anything you ask is answered", accuracy figures, cloud or mobile-sync claims, "understands any document".

## Task 1: Hero, eyebrow and picture alt text

> Superseded in part by the owner changes in the status note: no eyebrow, the shorter lead, the t3 placement and the `h1` size.

- **Eyebrow** (new), first child of `.landing-hero` after `FloatingTiles`, before the `h1`:
  `<p className="hero-eyebrow">DocVault · personal AI document assistant</p>`
  - CSS: inline-flex pill, Geist Mono 13 px, weight 500, `color: var(--muted-foreground)`, 1 px `var(--border)` border, `border-radius: 999px`, padding 4 px 12 px, `margin: 0 auto 18px`. No icon, no motion.
  - Not a heading (one `h1` per page).
- **`h1`:** "Ask your documents anything." Same styles; `max-width` stays `15ch` so it breaks as "Ask your documents / anything." at 1366 px.
- **Lead** (replaces the Task 5 lead), with `{docbot}` from `ASSISTANT_NAME`:
  "Upload photos or PDFs of your paperwork and ask about them in your own words. DocBot points to the line each answer came from, says so when your documents don't, and asks before it saves anything. It all runs on your own computer."
- **Hero buttons:** unchanged.
- **First screen:** the eyebrow adds about 44 px. Reduce `.landing-hero` top padding from `clamp(40px, 5vw, 72px)` to `clamp(28px, 4vw, 56px)` so the picture's top stays inside 768 px. If the e2e first-screen check still fails, lower it further and record the value; do not shrink the `h1`.
- **Product picture alt text** (replaces the current one; the hero's first example is no longer framed as a bill):
  "DocBot's home: two questions answered from your own documents. How much notice to give the landlord: 28 days in writing, from line 14 of the tenancy agreement. Whether the kettle is still under warranty: yes, until 14 March 2027, from the kettle receipt."

## Task 2: Section order, headings and examples

> Item 4's miss has no source caption, per the status note.

Final order of `main` (headings exact):

1. Hero (`h1`, lead, buttons; the eyebrow was removed, see the status note). Section name stays from `aria-labelledby="hero-title"`, so it becomes "Ask your documents anything."
2. Product picture (unchanged markup).
3. `QuestionMarquee`: same eight questions, new order so a bill is not first:
   1. "What does E21 mean on the dishwasher?"
   2. "How much notice do I give the landlord?"
   3. "Is the kettle still under warranty?"
   4. "When does the tenancy end?"
   5. "When is the electricity bill due?"
   6. "How much was the October bill?"
   7. "Split the gas bill by days at home"
   8. "Remind me two days before the bill is due"
4. `#meet-docbot`: `h2` `Meet ${docbot}, who reads your paperwork so you don't have to.` with `DocBotMark variant="full" state="done"`, then a new paragraph:
   "Ask about anything you've uploaded. DocBot answers from your own files, shows where the answer is, and tells you when it isn't there."
   The figure beside it changes from the bill-and-reminder thread to a manual answer and an honest miss:
   - bubble "What does E21 mean on the dishwasher?" → answer **"Water temperature too low. Switch off and call the helpline."**, source "Dishwasher manual · line 22"
   - bubble "When does the car insurance renew?" → answer **"I couldn't find this in your documents."**, source "No matching source line"
   - figure `aria-label`: "DocBot answers that E21 on the dishwasher means the water temperature is too low, from line 22 of the dishwasher manual, then says it couldn't find when the car insurance renews in your documents."
   - Remove "Remind me two days before." and "Drafted a reminder for 21 November. / Waiting for your approval" (the approval story is told once, in item 6).
5. `h2` "Works with the paperwork you already have" (was "Bring your own documents"); the line "Photos or PDFs. DocVault reads them on your computer." stays. Cards reordered, captions unchanged: Leases, Manuals, Warranties, Receipts, Bills.
6. `h2` "One button to approve. Nothing saves without it." (unchanged block).
7. `h2` "If you'd rather run it yourself, you can." (unchanged block).
8. Stats row: "0", "Line 14", "€0". The middle caption stays "every answer points to its source line" (line 14 now matches the hero's lease answer).
9. Closing `h2` "Your paperwork deserves better than a drawer." and "Get started" (unchanged).

## Task 3: Tests (write first, see them fail, then change the page)

> The eyebrow tests and the eyebrow in the e2e first-screen check were replaced by the owner changes in the status note.

**`Landing.test.tsx`:**
- `has one headline, the lead, and no form fields`: `h1` text "Ask your documents anything."; the new lead exact; the eyebrow text "DocVault · personal AI document assistant" is visible, is a `p`, and comes before the `h1` in document order.
- `puts the wordmark, Sign in and GitHub in the banner…`: the hero region name becomes "Ask your documents anything."; the rest unchanged.
- `describes the product picture in words`: the new alt text exact; the content assertions unchanged.
- `lists the eight questions once…`: the `questions` array in the new order.
- `has the five document cards…`: heading "Works with the paperwork you already have"; card order Leases, Manuals, Warranties, Receipts, Bills.
- `has the five section headings…`: the new Meet DocBot `h2` and the renamed documents `h2`; the other three unchanged.
- `shows the approval card once…`: `#meet-docbot` has no `.approval-card` and no "Waiting for your approval"; it contains "Dishwasher manual · line 22" and "I couldn't find this in your documents.".
- `keeps the stats…`: "Line 14" instead of "Line 17".
- **New** `introduces the assistant before any document type`: in the hero region's text, "personal AI document assistant" appears and none of "bill", "lease", "manual", "warranty", "receipt" (case-insensitive) appears.
- Banned-claims test unchanged; it still finds "€123.47" in the approval block.

**`e2e/landing.spec.ts`:**
- First-screen scenario at 1366 × 768: `h1` name "Ask your documents anything."; hero region name the same; the eyebrow, the `h1`, "Get started" and the top of the picture are on the first screen.
- The other five scenarios unchanged; axe at 1366 and 390 px must still pass with the eyebrow (record its contrast: muted text on the page, 8.5:1 in the PR 41 record).

Grep `frontend/e2e` and `frontend/src` for "Your documents, answered", "Bring your own documents" and "who keeps your paperwork moving" before finishing; no other test may reference them.

## Task 4: Record and review

- [ ] Screenshots of `/` at 1366 × 768 and 390 × 844 into `evaluation/docbot-redesign/` as `landing-positioning-*.png`.
- [ ] Update `specs/Repo_Current_State.md` with one evidence row (what was run, what was not), and the redesign plan's Task 5 with a one-line note that this plan supersedes its `h1`, lead and section copy.
- [ ] Gates: `npm ci`, `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`, `npx playwright test e2e/landing.spec.ts` against the Vite dev server. Backend untouched.
- [ ] Call `reviewer` with this plan and issue #35; show the owner the full report; merge under the `AGENTS.md` merge rule.
- Commits: `Introduce DocVault as a personal AI document assistant on the landing page`, then `Record the landing positioning evidence`. The owner changes and review fixes added further commits on the branch.

## Owner decisions

| # | Decision | Architect's recommendation |
| --- | --- | --- |
| D1 | Change the browser title and manifest name from "DocVault — personal document assistant" to "DocVault — personal AI document assistant" | **Yes.** It matches the eyebrow, and the tab title is what a visitor sees first in search and bookmarks. Two one-line edits; no test reads the title today |
| D2 (withdrawn by the owner; no eyebrow) | Eyebrow wording: "DocVault · personal AI document assistant" or "Personal AI document assistant" | **Keep the brand name in it.** The wordmark sits in the header, but the eyebrow is what screenshots and the 390 px view show with the `h1` |
| D3 | `h1`: "Ask your documents anything." or "Ask your documents. Get answers with sources." | **"Ask your documents anything."** Short, one idea, and the lead immediately qualifies it (line citations, says when it can't find). The alternative is safer but reads as a feature list |
| D4 | Meet DocBot shows an honest miss ("I couldn't find this in your documents.") | **Yes.** It is the product's real reply, it supports the reliability point the lecturer asked for |
| D5 | Keep the closing line "Your paperwork deserves better than a drawer." | **Keep.** It is not about bills and was approved in Task 5 |

## Acceptance checks

| # | Check | Verified by |
| --- | --- | --- |
| 1 | The first screen names the category and explains upload, ask and cited lines (lead, after the owner changes), and asks the core question (`h1`); approval and local running are shown further down | `Landing.test.tsx`; e2e first-screen scenario |
| 2 | The hero names no document type; bills are no longer first in the marquee, the cards or Meet DocBot | New hero test; question, card and Meet DocBot tests |
| 3 | The approval card appears once; citations are OCR lines; every claim is in the claims table | `Landing.test.tsx`; Reviewer |
| 4 | Kept structure, header, theme, button, banned claims and accessibility unchanged; axe passes at 1366 and 390 px | Unchanged tests; `landing.spec.ts` |
| 5 | No backend, approval-path or dependency change | Reviewer; gates |
