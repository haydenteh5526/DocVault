# Website Redesign: a Document-First Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Also load the `frontend-design`, `ui-ux-pro-max` and `modern-web-design` skills before Task R1.

**Status:** proposed on 18 November 2026. The same day, the owner asked for a shadcn/ui look, and Section 3R replaces the first identity (Sections 3 and 7). Later that day the owner found the landing page too close to the generic AI-product template, and Section 2R replaces Directions A and B with three bolder directions, C, D and E (Decisions D1, D8 and D9). The owner then kept the yellow and asked for Direction C to lead with DocVault as a personal knowledge base, not a bill checker (Decision D10). On 18 November the owner put the plan on hold until the audit defects (issue #24) were fixed. Section 0R records what changed underneath since then, and the new schedule: redesign PR 1 runs alongside issue #25 once #24 PR 2 merges. The owner approved the plan and decisions D1 to D10 as recommended on 18 November 2026. Nothing in it is implemented. The GitHub issue (D6) is drafted for the owner to see before it is opened.

**Goal:** Give DocVault a recognisable visual identity built around what people do with it: find a household document, check what it says, and decide what needs attention. Retire the purple and indigo gradient branding, glows, frosted surfaces and colourful feature cards. Every function, check and piece of evidence the app has today stays.

**Out of scope:** the Expo mobile app (`mobile/`), server code, API behaviour, database, ownership checks, and the wording of any copy that tests match on (listed under Global Constraints). The redesign changes how screens look and how the web app is navigated. It changes no rule about what is saved or approved.

**How this plan was made**

- **Browser observations** on 17 and 18 November 2026: the `dvdemo` stack on `main` `84730f9` at <http://localhost:3100>, signed in as a disposable account, at 1366×850 (desktop) and 390×844 (phone). The signed-out landing page was viewed on the older `issue3` stack at <http://localhost:3000>, because the demo account redirects `/` to `/app`. `git diff main -- frontend/src/pages/Landing.tsx` on that branch is empty, so the page is the same. The browser pane was hidden, so entrance animations did not run. For inspection only, I forced elements stuck at `opacity: 0` to show; no source was changed. Findings marked **[seen]** come from the browser.
- **Source inspection** of `frontend/src/App.tsx`, `index.css`, `index.html`, every page and shared component, and the browser tests in `frontend/e2e/`. Findings marked **[source]** come from code.
- **Design tools**, each for one decision:
  - **Impeccable** v4.9.2 for the critique (Section 1). Its launcher downloads and runs a binary, and the plugin is not installed (Decision D7). So the run is a single-context critique without its detector: **⚠️ DEGRADED: single-context (detector not installed; no sub-agents spawned)**.
  - **Taste Skill** (`design-taste-frontend` v2.5.1) for the two landing compositions (Section 2). It is a "software" page: its own UI as live HTML showing what it works on, and no violet anywhere.
  - **Frontend Design** for the identity (Section 3).
  - **UI/UX Pro Max** v2.15.0 for the signed-in flows and its accessibility and touch checklist (Section 4). Its `--design-system` query proposed a generic teal and orange flat palette. I kept its structural advice (flat surfaces, no gradients, 150–200 ms transitions, product-demo hero) and rejected the palette as not specific to this product.
  - **Modern Web Design** for the one interaction where feedback earns its place (Section 5).

---

## 0R. Revision, 18 November 2026 (evening): what changed underneath, and the new schedule

The owner put this plan on hold until the 18 November audit defects were fixed. That work changed several screens this plan restyles, and two PRs merged. This section updates the plan; where it disagrees with a later section, this section wins.

**Merged into `main` since this plan was written:**
- PR 23 (issue #5 Phase 2, `b86a27f`): `AssistantAction.tsx` and the chat cards. **Task R9 is no longer blocked.**
- PR 26 (issue #24 PR 1, `57d4ea4`):
  - **Upload:** "View Documents" goes to `/app/documents`, and the list refreshes after an upload (part of P10).
  - **Rows:** they no longer show summary JSON (P9).
  - **Document page:** shows only real summaries and filled fields, through `lib/summary.ts` (`isGeneratedSummary`, `summaryOverview`).
  - **Sidebar:** links to Search, Warranties and Settings. On a phone it starts off-screen and closes on every route change and on the logo (part of P4).
  - **Other:** sign-in changes follow across tabs; a failed reload after a confirmation is reported (`ReloadFailedError`); timestamps in Irish time (`lib/dates.ts`); the landing page's untrue claims were corrected.

**Still to come before or alongside this plan:**
- issue #24 PR 2 (server fixes: Ask's "not found", 2FA confirmation, the Google button, password rules, and the rest)
- issue #25 (split by days at home), which adds controls to `BillSplit.tsx`

**What this changes in the tasks:**
- **R3 (App shell):** `AppNav` replaces the sidebar, so it must keep PR 26's behaviour. The existing `AppShell.test.tsx` cases (Search, Warranties and Settings reachable; the phone navigation closed on route change and on the logo; a backdrop that closes it) are kept, moved to `AppNav.test.tsx` and adapted:
  - in the three-item phone tab bar, Search, Warranties and Settings sit behind the account menu and the command palette
  - on desktop they appear in the rail under "More"
- **R4 (Landing):** builds Section 2R Direction C as revised (knowledge base, highlighter yellow, 8 px controls). It replaces the whole page, including PR 26's corrected copy. The new `Landing.test.tsx` keeps PR 26's banned-claims assertions, which still hold.
- **R6 (Documents home) and R7 (Upload):** start from PR 26's behaviour. R7 keeps the `['documents']` invalidation and still ends on the documents list. Its in-row upload states replace the success panel.
- **R8 (bill panels):** waits for issue #25 to merge, and restyles its "How to split" choice and days fields along with the rest of `BillSplit.tsx`.
- **D2 (home route):** the e2e assertions that expect "Ask anything about your documents" right after sign-in move to "Documents". Today there are six such places across `accessibility.spec.ts`, `app.spec.ts` and `password-reset.spec.ts`. The Issue session greps for the exact list.
- **Frozen copy:** add the copy that PR 26, PR 23 and issue #25 introduce and test, for example "Saved as revision {n}…", "Ask in your own words", "Split by days at home" and "Days at home for {label}". Before changing any visible string, grep `frontend/e2e/*.ts` and `frontend/src/**/*.test.tsx`, as the global constraints say.

**New schedule (owner, 18 November 2026: "in parallel"):**
- **Redesign PR 1 = Tasks R0 to R7 and R10.** R10 leaves out `BillSplit.tsx` and `BillReminder.tsx`, which R8 does in PR 2. PR 1 starts after issue #24 PR 2 merges, on its own branch from that `main`, and runs **at the same time as issue #25**. It does not touch `BillSplit.tsx`, `BillReminder.tsx`, `services/bill_split.py` or the split types in `lib/api.ts`.
- **Redesign PR 2 = Tasks R8, R9 and R11.** It starts after issue #25 and redesign PR 1 have merged.
- Each PR is reviewed and merged under `AGENTS.md`. A merge into `main` needs the owner's words in the session that merges.

**Clarifications, 18 November 2026 (Architect, during PR 1)**
- **R7 (Upload):** keep the "Upload Complete!" panel, its file-name buttons and "View Documents" (to `/app/documents`), restyled flat with no confetti. The in-row states ("Uploading", "Reading the text", "Needs confirming" or "Ready", "Could not read this file", and the polite live region) live on the Documents list. There is no automatic navigation after an upload.
- **R3 (tour):** keep `OnboardingTour` mounted in PR 1, restyled. PR 2 removes it together with its `accessibility.spec.ts` assertions, which is allowed there.
- **R3 (navigation):** `AppNav` renders `<button>` elements, with `aria-current="page"` on the current item, so the existing role-based e2e lines still match. The Documents and Ask lines change only under D2.
- Reason: the global constraint that e2e changes only under D2 wins over R3 and R7 where they conflict.

---

### Implementation clarification from the Architect (19 November)

PR 1 keeps the **Upload Complete!** panel and **View Documents** action. The panel uses the new tokens, and processing is shown in the Documents list. PR 1 keeps the welcome tour and restyles it. PR 2 removes it with its browser check. Navigation items remain buttons with `aria-current="page"` on the current destination. Only the approved home assertions change in the existing browser tests.


## 0R-2. Revision, 19 November 2026: yellow as an accent, motion, one set of account buttons

Approved by the owner on 19 November 2026, before Demo 1. Built in PR 30 (redesign PR 1). It replaces the parts of Section 2R Direction C that it names; everything else in 2R stays.

**R-A. Yellow is an accent, never a surface.**
- **Surfaces.** The landing page's header, hero and every section use the theme tokens (`--background`, `--foreground`, `--muted`, `--card`): white with near-black text in light mode, near-black with white text in dark mode. No full-bleed `#FFD83D` field anywhere on the site. The perforation edges between bands are removed.
- **The split band** ("It proposes. You decide.") becomes a `--muted` band with a 1 px `--border` top and bottom. Its four numerals are set in `--foreground`, no longer yellow.
- **Yellow stays in exactly two places:**
  - the highlighter: `--mark` (`#FFE98A`, ink text) behind quoted source lines and search matches, with Section 7's marker values in dark mode
  - the margin tags on the hero's document card: `#18181B` with `#FFD83D` text, the same in both themes, because the card stays paper-white in both
- **The demo deck follows the same rule** (the Architect changes it).
- **Contrast** uses Section 3R's measured token pairs, plus the tag pair `#FFD83D` on `#18181B` at 12.9:1.

**R-B. Account buttons in one place, plus one closing call to action.**
- **Hero:** the hero has no buttons. Remove "Create an account" and "Sign in" from it.
- **Header:** the header shows "Sign in" (ghost) and "Create an account" (default) at **every** width, phones included. At 360 px they stay on one line beside the wordmark, using `h-9 px-3 text-sm`.
- **Closing section:** after the last section and before the footer, a closing section has the H2 "Start with one document.", the line "Upload a bill, a lease or a manual and ask about it in your own words.", and one button, "Create an account" (to `/register`). There is no "Sign in" there.
- **Tests** (`Landing.test.tsx`):
  - the hero region contains no link named "Create an account" or "Sign in"
  - the banner (header) contains both
  - exactly one more "Create an account" link exists, in the closing section
  - the existing banned-claims checks are unchanged
  - `e2e/accessibility.spec.ts` (landing `h1` and axe) passes unchanged

**R-C. Motion, with no new dependency.** CSS keyframes, CSS scroll-driven animations, one `IntersectionObserver` hook, and React Router 7's built-in view transitions.

**Rules that apply to every effect:**
- Content is visible by default. Animation rules live only under `html.motion-ok`, a class a small script adds when `matchMedia('(prefers-reduced-motion: no-preference)')` matches and `IntersectionObserver` exists.
- A safety timer reveals every hidden element 2.5 s after load, so nothing stays invisible: not with a background tab, a failed observer, or a screenshot.
- Only `transform`, `opacity` and `clip-path` animate.
- Nothing loops, and nothing hijacks scrolling.
- The class names avoid the retired ones that `designGuard.test.ts` bans (`animate-fade-in`, `animate-slide-up`, `animate-scale-in`, `animate-float`).

**Effects:**
1. **Hero on load, once (landing only), about 1.6 s in all:**
   - each headline line rises 40 px inside its own clipped line box (700 ms, `cubic-bezier(.2,.7,.2,1)`, 90 ms stagger)
   - the lead fades in at 450 ms
   - the question bar slides in from 24 px at 500 ms
   - the three back sheets fan out from a stack at 650 ms, then the front sheet rises
   - the margin tags draw out from their lines with `clip-path` at 1100 ms and 1250 ms
2. **Scroll reveals (landing sections below the hero):** each section's heading, then its visual, enters once when 20% of it is in view. They go from `opacity: 0.001; transform: translateY(32px)` to rest, 600 ms, with children staggered 80 ms (at most four steps). This is a `useReveal()` hook (`frontend/src/lib/useReveal.ts`) that sets `data-revealed` and disconnects after the first reveal.
3. **Scroll-linked (landing hero):** as the hero scrolls out, the document stack drifts up 60 px and the question bar 30 px. This uses `animation-timeline: view()` inside `@supports (animation-timeline: view())`; without support, nothing moves.
4. **Page transitions (app and account pages):**
   - **Triggers:** `AppNav` links and the main flow navigations ("View Documents", "Open bill to see its status", the document rows) use React Router's `viewTransition`, through the `<Link viewTransition>` prop or `navigate(to, { viewTransition: true })`.
   - **Look:** `::view-transition-old(root)` and `::view-transition-new(root)` cross-fade over 180 ms, with an 8 px rise on the new page.
   - **Opt-outs:** under reduced motion, `::view-transition-group(*)` gets `animation: none`. Browsers without the API simply navigate.
5. **Micro-interactions:**
   - buttons press to `scale(0.98)` in 120 ms
   - hover colours transition in 150 ms
   - text links draw their underline from the left
   - the `AppNav` current-item indicator slides between items
   - list rows tint on hover
   - no hover lift on cards (P8 stays retired)
6. **The signed-in app stays calm.** No scroll reveals on working screens: only page transitions, micro-interactions and the upload states already planned.

**Tests:**
- `useReveal.test.ts`: the hook sets `data-revealed` when the observer reports an intersection, and the safety timer sets it after 2500 ms with no intersection.
- `motion.test.ts`: with `prefers-reduced-motion: reduce` mocked, `html` never gets `motion-ok`.
- `Landing.test.tsx`: with no `motion-ok`, no hero element has an inline `opacity: 0`.
- `AppNav.test.tsx`: the three navigation links render with view transitions enabled.
- The existing unit tests, e2e and `designGuard.test.ts` pass unchanged.

**Built differently from the text above (PR 30, 19 November 2026).** Page transitions use the browser's `document.startViewTransition` with `flushSync`, through `useTransitionNavigate`, not React Router's `viewTransition` option. That option only works under a data router, and a data router does not follow the history entries that the unchanged browser tests add by hand (`pushState` plus `popstate`): the two-account scenario hung on the landing page. The app keeps `<BrowserRouter>`. The hook navigates plainly under reduced motion and where the API is missing. Logout navigates at once, without a transition, because a delayed transition callback pushed `/` after the test's own navigation to `/login`. The landing links do not use transitions.

**Demo note.** Tomorrow's demo runs on the local preview (port 3700), which is not reviewed. After R-A to R-C are pushed, the preview is refreshed to PR 30's head merged with PR 29's head. The Reviewer's check of PR 30 at its new head follows the demo; nothing merges without it.

## 1. What is wrong today, and what stays (Impeccable critique)

**Mode.** The landing page is *Persuade*: the visitor decides whether to sign up. Every signed-in screen is *Operate*: the visitor completes a task. Today both modes wear the same costume: a dark AI-product theme, gradient text, glow halos and fade-ins. On Operate screens, that costume competes with the task.

**Design specificity verdict.** Not specific. Swap the copy and the landing page would sell any AI startup. Its only product picture is a Samsung washing-machine manual (`Landing.tsx`), and the product's real strength appears nowhere on it. That strength is a bill's amount beside the exact line it came from.

### What works and stays

| Element | Why it stays |
| --- | --- |
| The bill review's value plus OCR line plus quote (`BillReview.tsx`) | It is the product's truth and its most distinctive screen. It becomes the visual signature of the whole identity (the *source tie*, Section 3). |
| Split and reminder copy ("Nothing is sent to anyone. The reminder is saved in your account only.", "3 leftover cents went one each to the first 3 people in this order.") | Plain, exact, trustworthy. Every word is kept; only the layout around it changes. |
| History lists ("Proposed by the assistant", "Approved", "Saved") | They make the approval rule visible. |
| Lucide icons, Tailwind v4, the shared `button`, `card` and `input` components, `lib/theme.ts` (follows the system theme) | A sound base. The redesign changes tokens and variants, not the stack. |
| The reduced-motion block at the end of `index.css` | It works. It will cover less motion, because there will be less of it. |

### Priority issues

| # | Element and reference | The task it gets in the way of | Proposed change |
| --- | --- | --- | --- |
| P1 | Purple and indigo brand: `.gradient-bg` and `.gradient-text` in `index.css`, used about 30 times across 15 files. That covers the logo (`Navbar.tsx:44`, `ForgotPassword.tsx:38`), every primary button (`Auth.tsx:140,162,221`, `Navbar.tsx:69,92`, `Dashboard.tsx:297,618`, `DocumentDetail.tsx:91,931`, `AskAI.tsx:307`), avatars (`App.tsx:385`), the unread dot (`NotificationCenter.tsx:177,224`) and chat bubbles (`AskAI.tsx:231`, `DocumentDetail.tsx:883`) **[source][seen]** | Recognising DocVault at all. Its colour says "generic AI product", not "your household paperwork". | Retire both utilities. The primary action becomes ink-filled (Section 3). Highlighter yellow is reserved for evidence. |
| P2 | Glow halos behind buttons: `absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 ... blur` (`Dashboard.tsx:296`, `AskAI.tsx:301`); blurred circles behind empty states (`AskAI.tsx:207`, `Dashboard.tsx:591`, `DocumentDetail.tsx:865`) **[source]** | Telling what is clickable. The glowing Upload button outshines the documents the page exists to show. | Remove them. One button style per level of importance; no halo. |
| P3 | `/app` opens on an empty chat ("Ask anything about your documents") with a forced-dark ChatGPT-style sidebar (`App.tsx:154`, index route → `AskAI`) **[seen][source]** | Finding a document and seeing what needs attention. The first screen asks the visitor to think of a question instead of showing them their bills. | Make **Documents** the signed-in home, with a "Needs attention" block above the list (Decision D2). Ask stays one click away. |
| P4 | Phone: the sidebar opens over the page by default, with no backdrop or way back. At `App.tsx:154`, when `sidebarOpen` and `sidebarCollapsed` are both false, the drawer is neither hidden nor translated off-screen. **[seen at 390 px][source]** | Everything on a phone. The document page sits behind a 290 px drawer. | Below 1024 px: a top bar plus a three-item bottom tab bar (Documents, Ask, Upload). No off-canvas drawer. |
| P5 | Landing first screen on a phone: the badge, the headline with "think for you" in gradient, and a paragraph. No action button; "Get started" is hidden behind the menu (`Landing.tsx`, `Navbar.tsx`) **[seen at 390 px]** | Signing up from a phone. | The primary action ("Create an account") sits in the first screen at every width. |
| P6 | The landing story is a Samsung manual, plus "Tech Stack" and "FAQ" sections about tools and models the product no longer uses (`Landing.tsx`) **[seen][source]** | Understanding what the product does for a household. | Replace it with one synthetic electricity bill, the same one the demo uses (Section 2). |
| P7 | Motion everywhere: `animate-slide-up`, `animate-fade-in` and `animate-scale-in` about 40 times, `animate-float`, an infinite `animated-gradient` on the auth panel, confetti on upload (`Upload.tsx`, `canvas-confetti`) **[source]**. Content stays invisible until the animation runs **[seen with the pane hidden]**. | Reading. Content that waits for an animation is content that is late, and is missing whenever the animation does not run. | Remove entrance animations and infinite loops. Keep only motion that answers an action, and the one designed upload-to-processing transition (Section 5). |
| P8 | Colourful feature cards with pastel gradient icon tiles (`.icon-gradient-*`), lift-on-hover cards (`.hover-lift`), frosted panels (`.glass`, `backdrop-blur-*` in `Dashboard.tsx`, `DocumentDetail.tsx`, `AskAI.tsx`, `Upload.tsx`) **[source][seen]** | Scanning. Six identical cards make six equal claims, so none stands out. | Flat surfaces separated by hairlines and spacing. Icons stay monochrome, at text size and without tiles. |
| P9 | The document card shows a raw JSON summary snippet (`{"overview": "EXAMPLE ENERGY\n\n...`) under the filename (`Dashboard.tsx`) **[seen]** | Recognising a document from the list. | The list row shows the title, type, date and status. Summary text appears only on the detail page, parsed. |
| P10 | "View Documents" after an upload goes to `/app` (Ask), not the documents list (`Upload.tsx`) **[seen]** | Seeing the file you just uploaded. | The upload flow ends on the document's own row in the list, processing in place (Section 5). |
| P11 | First sign-in opens a four-step product tour (`OnboardingTour.tsx`) over an empty screen **[seen]** | Starting. The tour describes features before there is anything to use them on. | Replace the tour with the empty Documents state, which has one action: "Upload a bill" (Section 4). |
| P12 | Body copy and labels at 11–13 px in places (`text-[9px]` badge, `text-xs` meta), and low-contrast grey on dark (`muted-foreground` on `background` in dark mode, about 4:1) **[source]** | Reading amounts and dates. | A type scale whose smallest size is 13 px, used only for metadata; body text at 16 px; every pair in the contrast table (Section 7). |

**Cognitive load.** The documents page shows an analytics chart, folders, sort, filter, view, New Folder and Upload before the first document: seven competing controls. Target: a search field, a type filter and Upload, then the list.

**Personas walked through the primary action (find the October bill, check the amount, approve the reminder):**

- *Housemate on a phone, in a hurry:* blocked by P4 and P5.
- *Careful checker, who will not trust a number without its source:* the current bill review serves them well (it stays). They have to find the "View original bill" button to compare against the page; the new layout shows the original beside the values on desktop.
- *Keyboard user:* default focus rings survive in places but are overridden by `outline-none` on custom buttons. Every interactive element gets the same visible focus (Section 3).

---

## 2. Two landing directions (Taste Skill) — withdrawn, replaced by Section 2R

*Kept for the record. The bill and the copy of Direction A are reused where Section 2R says so.*

Both directions use the same synthetic bill: **Example Energy, electricity bill, statement issued 2 November 2026, billing period 1–31 October 2026, total amount due EUR 123.47 (line 15), payment due 23 November 2026 (line 17), billing period (line 9).** They differ in what visitors see and learn first.

### Direction A — "The check" (recommended)

*The first thing visitors see is a bill with its figures pulled into the margin, each tied by a highlighter band to the line it came from. What they learn first: DocVault shows its work.*

- **Headline:** Know what your bills say before you act on them.
- **Supporting line:** DocVault reads your household paperwork, puts every amount and date beside the line it came from, and saves a split or a reminder only when you approve it.
- **Primary action:** Create an account
- **Secondary action:** Sign in
- **Under the first screen**, three short sections, one screen each:
  1. **Check it** — "Every value keeps its source. Correct anything OCR got wrong, then confirm it." Visual: the review panel with a corrected value ("Corrected from €123.47").
  2. **Decide what it needs** — "Split it to the cent among the people you live with. Approve one reminder before it is saved. Nothing is paid or sent for you." Visual: the four shares €30.87, €30.87, €30.87, €30.86 and the reminder proposal with its Approve and save button.
  3. **Find it again** — "Search by the words on the page or by what you mean. Ask in everyday language and get the line that answers." Visual: the documents list with "October" typed in the search field.
- **Footer line:** A final-year project at TUS Athlone. It runs on your own computer, and the examples on this page are synthetic.

```text
DESKTOP 1366 — first screen                                      [A]
┌──────────────────────────────────────────────────────────────────────────┐
│ ▤ DocVault                                       Sign in  [Create an account]│  ← one top bar, no anchor links
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Know what your bills say          ┌───────────────────────────────┐     │
│  before you act on them.           │ EXAMPLE ENERGY                │     │  ← a white "sheet": radius 2px,
│                                    │ Electricity bill               │     │    one soft shadow, serif text
│  DocVault reads your household     │ Statement issued: 2 Nov 2026   │     │
│  paperwork, puts every amount and  │▌Billing period: 1 October 2026 │──── 1–31 Oct 2026 │ ← source tie: highlighter
│  date beside the line it came      │  to 31 October 2026        L9  │     │   band + rule to the margin
│  from, and saves a split or a      │ Electricity charges: EUR 102.00│     │   value (sans, tabular)
│  reminder only when you approve.   │ Taxes and fees: EUR 21.47      │     │
│                                    │▌Total amount due: EUR 123.47 L15──── €123.47     │
│  [Create an account]  Sign in      │▌Payment due date: 23 Nov 2026 L17──── 23 Nov 2026 │
│                                    └───────────────────────────────┘     │
│                                     Confirm these values  [Confirm and save]│ ← the real panel's copy
└──────────────────────────────────────────────────────────────────────────┘
  left column 520px, text left-aligned; sheet 560px; margin values 200px
```

```text
PHONE 390 — first screen                                         [A]
┌──────────────────────────────┐
│ ▤ DocVault           Sign in │
├──────────────────────────────┤
│ Know what your bills say     │  36px / 42px, ink
│ before you act on them.      │
│                              │
│ DocVault reads your household│  18px lead, graphite
│ paperwork, puts every amount │
│ and date beside the line it  │
│ came from …                  │
│                              │
│ [ Create an account ]  full  │  ← primary action on screen one (fixes P5)
│                              │
│ ┌──────────────────────────┐ │
│ │▌Total amount due:        │ │  ← sheet cropped to the 3 tied lines
│ │ EUR 123.47           L15 │ │
│ │  └─ €123.47              │ │    margin values drop under each line
│ │▌Payment due date:        │ │
│ │ 23 November 2026     L17 │ │
│ │  └─ 23 Nov 2026          │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### Direction B — "The question"

*The first thing visitors see is a question typed in everyday words and the answer quoted from the bill, with the next decisions offered as buttons. What they learn first: you can ask, and the answer comes with proof.*

- **Headline:** Ask your paperwork a question. Get the line that answers it.
- **Supporting line:** Type it the way you would say it. DocVault answers from your own documents, quotes the line it used, and offers the next step.
- **Primary action:** Create an account
- **First screen:** one chat exchange. The question: "When is the electricity bill due?" The answer: "€123.47 is due on 23 November 2026." Under it, a quoted serif line: *Payment due date: 23 November 2026 — Example Energy, line 17*. Two buttons sit below: "Split it four ways" and "Remind me 2 days before".

```text
DESKTOP 1366 — first screen                                      [B]
┌──────────────────────────────────────────────────────────────────────────┐
│ ▤ DocVault                                       Sign in  [Create an account]│
├──────────────────────────────────────────────────────────────────────────┤
│        Ask your paperwork a question. Get the line that answers it.      │  centred, one line at 44px
│                                                                          │
│                            ┌─────────────────────────────────┐           │
│                            │ When is the electricity bill due?│ (you)    │
│   ┌──────────────────────────────────────────────┐                       │
│   │ €123.47 is due on 23 November 2026.          │                       │
│   │ ▌"Payment due date: 23 November 2026"        │  ← serif quote, line 17 │
│   │   Example Energy · line 17                   │                       │
│   │ [Split it four ways]  [Remind me 2 days before]│                     │
│   └──────────────────────────────────────────────┘                       │
│                         [Create an account]                              │
└──────────────────────────────────────────────────────────────────────────┘
```

### Recommendation: Direction A

1. **It shows what is verified.** Review, confirm, split and approve are the four merged stories, with tests, CI and manual checks behind them. The chat picks a tool with a keyword router whose limits are recorded (Revisions 5 and 6 of the issue #5 plan). Leading with the chat promises more than the evidence supports.
2. **It matches the lecturer's priority** of retrieval accuracy and answer reliability. A value tied to its source line is answer reliability made visible.
3. **It gives the identity its signature.** The source tie (Section 3) starts on the landing page and recurs on the dashboard, in the bill review and in chat answers, so the whole site looks like one product. Direction B's chat bubble belongs to a category of products, not to this one.
4. **It holds up without motion and on a phone**, because it is a still document, not a conversation that has to play out.

---

## 2R. Landing, revised 18 November 2026 (second revision): three bolder directions

The owner found Directions A and B underwhelming. Both follow the generic AI-product template: a centred pill, a big centred headline, two buttons and a product screenshot below. **This section withdraws A and B** and replaces them with Directions C, D and E. The copy of A survives only where C, D or E repeat it. Section 3R still holds for every signed-in screen; the landing page may go further than 3R, as each direction states.

**Canvas:** the row "Bolder landing directions (18 Nov, second revision)" on [DocVault redesign direction](https://claude.ai/artifact/8gxv5H9WbxGnh3bJ2bZJeD). Boards `LandingC`, `LandingCPhone`, `LandingD`, `LandingDPhone`, `LandingE` and `LandingEPhone`. The eight earlier boards are kept; A and B carry a "withdrawn" note.

### How this revision was made

- **References studied in the browser pane on 18 November 2026** (at 1440×900, with computed styles read from the page; non-essential cookies declined):
  - **hackathlone.com.** A left-aligned hero, not centred. The display face is Overpass 900, uppercase, 53–80 px, with tracking of about −2.8 px. Body text is Inter 16/25.6. Full-bleed colour bands alternate: white, brand blue `#0042A6`, white, black `#111`, a pale tint. A motif from the place (Athlone Castle's battlements) cuts the band edges. Big-number statistics (4, 169, 111). A numbered list with hairlines, used for a real sequence. A photo filmstrip by year. Headline left and body right, in an asymmetric two-column grid.
  - **higgsfield.ai.** A near-black ground (`#0F1113`) and one acid-lime accent, used only on calls to action. Headings in Space Grotesk 700, uppercase, tracking −4%. The product's own output fills the page: 65 videos and about 100 images in dense mosaics and bento tiles. The page works like a catalogue rather than a pitch.
  - **granola.ai** (the owner asked for wider inspiration instead of a portfolio link). A serif display at 86 px in the hero, with section statements up to 160 px, all at weight 400 and left-aligned. The product window overlaps the hero's right edge. A quiet ground; scale does the work.
  - **mercury.com**, as a counter-example. It uses the centred template, rescued by an atmospheric photograph. DocVault has no photography to lean on, so this route is closed.
- **What makes them work, taken forward:** the hero is the work itself, not a picture of a product next to a pitch. Type is set at poster scale and left-aligned. Colour comes in full-bleed bands, not tinted cards. A motif comes from the subject's own world. The rhythm changes from section to section: white, colour, white, dark.
- **Design tools:**
  - **Taste Skill** (`design-taste-frontend` 2.5.1). DocVault is a *software* page: it shows its own UI working on real content. No violet. One section per screen. One orchestrated moment, not fades on every section. The kit's page scripts and gate were not run, because this is a plan for the React app, not a static page built with the kit.
  - **Frontend Design.** Two of the references sit on its list of generated defaults: Higgsfield's near-black with one acid accent, and Granola's warm ground with a serif display. So D uses carbon blue with highlighter yellow, and no direction uses a cream ground or a clay accent. Its rule on numbering (only for a real sequence) decides where E may number steps.
  - **UI/UX Pro Max** 2.15.0 (`--design-system`, variance 8, motion 4, density 3). It proposed the "Trust & Authority" pattern, an asymmetric Brutalism style and IBM Plex Sans, with an amber primary and a violet accent. **Kept:** the asymmetric, high-variance structure and the warm amber–yellow signal. **Rejected:** the violet accent (Taste Skill forbids it, and Section 1 retires purple), and Brutalism's instant transitions.
  - **Modern Web Design.** Motion budget: CSS transforms and opacity only, `prefers-reduced-motion` honoured, no scroll hijacking, no parallax on text.
- **Test constraint checked:** the landing page has no frozen copy. `e2e/accessibility.spec.ts` only requires a visible `h1` on `/` and no axe A/AA violations, so every colour pair below must pass. `Landing.tsx` has no unit test today.

### Shared across C, D and E

- **The bill:** the same synthetic Example Energy bill as Section 2. Billing period on line 9, total EUR 123.47 on line 15, payment due 23 November 2026 on line 17. The split among four is Aoife, Ben, Chidi and Dara: €30.87, €30.87, €30.87 and €30.86. The reminder falls 2 days before the due date, on 21 November 2026.
- **Actions:** the primary is "Create an account" (`/register`) and the secondary is "Sign in" (`/login`), in the top bar and in the hero. No anchor links. The primary action is on the first screen at 390 px (fixes P5).
- **Footer line:** "A final-year project at TUS Athlone. It runs on your own computer, and the examples on this page are synthetic."
- **The highlighter mark.** A quoted source line sits on `--mark` `#FFE98A` with ink text (14.7:1). Muted grey text never sits on the mark: `#6B6B6B` on it measures 4.3:1 and fails. See Decision D9 for carrying the mark into the app.
- **No new package.** Motion is CSS keyframes and transitions, plus at most one `IntersectionObserver` (a browser API) in E. The only new external resource is one Google Fonts family in C (Decision D8).
- **Product truth kept:** every value on the page is shown beside its line; the approval copy is the app's real copy; nothing claims payment, sending or automatic saving; all examples are synthetic.

### Positioning, revised 18 November 2026

The owner corrected the subject. DocVault is not a bill checker. In the README's words, it "helps users turn the documents they keep into a personal knowledge base they can talk to", uses those files as its long-term memory, answers with evidence, connects information across documents and proposes actions for approval. **The landing page leads with that.** The Example Energy bill stays, but as the first worked example, because it is the one flow built and verified end to end. Direction C below is rewritten on this basis. D and E still lead with documents and the bill; if the owner picks either, it gets the same change of subject before it is built.

**What the page may show as working** (the product-truth rule, Section 2R):

| Claim | State on 18 November 2026 | How the page uses it |
| --- | --- | --- |
| Search by the words on the page or by meaning, across every document | Implemented: hybrid search, PostgreSQL full text plus local embeddings | Shown working (C section 2) |
| Answers about a bill (amount, dates, split, reminder proposal) from confirmed values, with their source lines | Implemented and tested (issue #5 Phase 1, PR 22) | Shown working (C hero) |
| A split or reminder proposed, saved only on approval | Implemented and tested (issues #2, #3, #5) | Shown working (C section 3) |
| Answers to general questions, written from retrieved passages | Needs a hosted Q&A key. Without one, the app shows raw excerpts. Local answer generation is not built, so it is not available at €0 today. | Described in the copy, never shown as a working screen |
| Connecting information across documents | Not built | Not shown and not claimed in the hero. The README's wording may stay in the copy only once it is built and evaluated. |

### Direction C — "The poster" (recommended)

*The first screen is a full-bleed highlighter-yellow field. A huge condensed headline sits on the left. On the right, a question typed in everyday words sits above a stack of mixed household documents. The front one, the Example Energy bill, has its answer pulled into the margin as black tags, each touching the line it came from.* From hackathlone.com: a field colour, heavy condensed display type, colour bands, big numerals and a motif from the subject. The motif here is a bill's perforated tear-off edge, used where one band meets the next.

- **Type:** display in **Archivo** (Google Fonts, variable `wdth` 62–125 and `wght` 100–900), set at `font-stretch: 75%` and weight 800 with tracking −0.02 em. Text and UI in Geist (Section 3R).
- **Corners:** buttons, inputs and tags are 8 px (shadcn's `rounded-md`, as in the app); panels and the question bar are 12 px. Only paper stays nearly square (2 px), because a document is a sheet. No pills. *Why the change:* the first draft used 4 px to echo the poster and the sheet, but that was a style choice with no usability reason behind it. The landing page leads straight into the app, so its controls should match the app's.
- **Colour:**

  | Token | Hex | Use |
  | --- | --- | --- |
  | `--field` | `#FFD83D` | Hero field; numerals and tags on ink |
  | `--ink` | `#14171F` | Text, primary button, question bar, ink band, tags |
  | `--paper` | `#FFFFFF` | Documents, white sections |
  | `--mark` | `#FFE98A` | Quoted source line; search matches |
  | `--muted` | `#5B6170` on paper; `#A9B0BF` on ink; `#4A4422` on the field | Supporting text |

  Contrast: ink on field 12.9; ink on paper 17.9; muted on paper 6.2; `#4A4422` on field 7.1; white on ink 17.9; `#A9B0BF` on ink 8.2; field on ink 12.9; ink on mark 14.7. The input border `#8F8F8F` on paper is 3.2 (controls need 3.0).
- **Copy and sections** (each one screen at 1440×900):
  1. **Hero, on the field.**
     - H1 (136 px desktop, 60 px phone, line height 0.88): **"Everything you keep, ready to answer."**
     - Lead (20/30): "DocVault turns the documents you keep into a personal knowledge base. Ask in your own words, and every answer comes with the line it came from. Nothing is saved or acted on until you approve it."
     - Buttons: "Create an account" and "Sign in".
     - Visual: an ink question bar reading "You asked" and "When is the electricity bill due?". Under it, a stack of four documents offset down and to the left, never rotated: "Tenancy agreement 2026–27", "Washer-dryer warranty card", "Linkline Broadband, November 2026", and the Example Energy bill in front. Lines 15 and 17 of the bill sit on the mark with a 4 px ink edge. Margin tags read "€123.47" against line 15 and "23 Nov" against line 17.
  2. **Perforation edge, then white.**
     - H2: **"Find anything by what it says or what it means."**
     - Body: "Search the words printed on the page, or describe what you are looking for. Results come from every document you have uploaded: bills, leases, manuals, warranties and receipts."
     - Visual: a search panel with the visible label "Search your documents" and the query "how long is the washer guaranteed for". Under it, "3 documents match" and three result rows, each with the matched phrase on the mark:
       - Washer-dryer warranty card: "Warranty period: 2 years from the date of purchase, parts and labour."
       - Washer-dryer manual (model WD8): "Keep your proof of purchase. The guarantee does not cover misuse."
       - Kettle receipt: "Returns within 30 days. Manufacturer warranty applies after that."
     - In the built page, this panel is a static picture (`figure`, `role="img"`, labelled "A search across three documents"), not a working input. A field on the signed-out page would promise a search that cannot run.
  3. **Perforation edge, then the ink band.**
     - H2: **"It proposes. You decide."**
     - Body: "Ask DocVault to split a bill among the people you live with, or to remind you before it is due. You see the exact shares and the exact reminder first. Nothing is saved until you approve it."
     - Visual: four numerals at 96 px in Archivo (30.87, 30.87 and 30.87 in yellow; 30.86 in white), with Aoife, Ben, Chidi and Dara under them. Beside them, the reminder proposal with the app's copy: "Approve this reminder", "Proposal 2 · not saved yet", Amount due €123.47, Remind on 21 November 2026, "Nothing is sent to anyone. The reminder is saved in your account only.", then "Approve and save" and "Cancel proposal".
  4. **White.**
     - H2: **"Your documents stay on your computer."**
     - Body: "DocVault runs on your own machine. It stores the originals, reads their text and searches them locally, and each account sees only its own documents."
  5. **Footer**, with the shared footer line.
- **Layout:** a 12-column grid with 64 px side margins and 24 px gutters. The hero text spans 7 columns. The question bar and the stack span 5, running 40 px past the right margin, cropped by the section. No element is centred.
- **Motion** (once, on load only):
  - The question bar fades in first (200 ms).
  - Each margin tag then draws out from its line with `clip-path: inset()`, 400 ms ease-out, the second 150 ms after the first.
  - Buttons darken on hover and press 1 px on click.
  - Nothing moves on scroll. Under reduced motion, everything is simply there.
- **Phone (390):**
  - the field, the H1 at 60 px and a shorter lead ("Ask in your own words. Every answer comes with the line it came from, and nothing is saved until you approve it.")
  - a full-width "Create an account"
  - the question bar, then the bill cropped to line 17, with the tag "23 Nov 2026" under it
- **Dark theme:** the field and the ink band stay as they are. White sections become `#101218` with white text. The documents and panels stay paper-white, like documents on a dark desk.

### Direction D — "The pile"

*The first screen is a carbon-blue desk covered in twelve household documents. A search for "electricity due date" has just run: the wall dims, the October bill lifts out with a yellow ring, and line 17 is lit with the answer beside it.* From Higgsfield: the product's material fills the page as a dense wall, so the page reads like a catalogue of real things.

- **Type:** Geist only. The H1 is 84 px, weight 600, tracking −0.045 em.
- **Colour:** carbon `#0F2236` ground; paper `#FAFAF7` tiles; yellow `#FFD83D` for the primary button, the ring and the match; `#FFE98A` for the lit line; muted `#9FB0C6` on carbon; `#5E6675` on paper; outline-button border `#607D9E`. Contrast: white on carbon 16.1; muted on carbon 7.3; carbon on yellow 11.6; tile text `#1F2633` on paper 14.5; tile muted on paper 5.5; border on carbon 3.8 (controls need 3.0).
- **Copy and sections:**
  1. **Hero.** H1: **"Find any household document by what it says."** Lead: "Bills, leases, manuals and warranties in one place. Search the words printed on the page, and DocVault opens the line that matches." Buttons: "Create an account" (yellow) and "Sign in" (outline). The search shown is a `figure` with `role="img"` and the label "A search for electricity due date", **not an input**: a working field on the landing page would promise a search that cannot run signed out. Its text reads "electricity due date", with "1 of 12 documents" beside it. The wall below holds the twelve seed documents of Section 4, staggered in six columns, every tile at 38% opacity except the October bill. Answer chip on the bill: "Due 23 November 2026", with "Example Energy, October 2026, line 17" under it.
  2. **Paper.** H2: **"Open it and check the line."** Body: "Each value sits beside its source. Confirm the bill, split it among the people you live with, and approve one reminder before anything is saved." Visual: the Bill review panel and the Bill split panel side by side, with the app's copy.
  3. Footer.
- **Motion** (one orchestrated moment, once, on load, about 2.4 s, CSS only): the query types in with `steps()`, 1.2 s. Then the other tiles fade to 38% (300 ms), the bill scales from 1 to 1.02 and gains its ring (300 ms), and the chip fades in. After that the page is still. Under reduced motion, the end state is shown at once.
- **Phone:** the H1 at 42 px, a full-width "Create an account", the search figure, then the bill tile across two columns with its chip, and two dimmed tiles under it.
- **Truth check:** document search over page text exists today (the search endpoint used by `/app/search`). The page shows an exact-match search, not a chat answer, so it claims nothing the keyword router has not shown. If D is chosen, its H1 and lead change to the knowledge-base positioning first (Positioning, above).

### Direction E — "The walkthrough"

*The first screen is one statement in Geist at 150 px, left-aligned across the full width. The bill rises from the bottom edge on the right. Below it, a pinned section keeps the bill still while four numbered steps change its state as you scroll.* From Framer-style portfolio pages and Granola: a single oversized statement, then sticky storytelling. It stays inside Section 3R (shadcn neutral tokens and Geist), so it is the lowest-risk direction and the least loud.

- **Copy and sections:**
  1. **Hero.** H1 (150 px desktop, 58 px phone, tracking −0.06 em): **"Check the bill before you pay it."** Lead: Direction A's supporting line, unchanged. Buttons: "Create an account" and "Sign in". The sheet has line 15 on the mark, with the badge "Line 15".
  2. **Pinned steps,** a real sequence, so the numbers are justified. The steps are: 1 "Upload the bill", 2 "Check each value", 3 "Split it to the cent", 4 "Approve one reminder". The active step is set at 56 px, with one line under it. Its copy for step 2 is "Every amount and date sits beside the line it came from. Correct anything the scan got wrong, then confirm." The frame on the right shows the matching state:
     - step 1: the processing row from Section 5
     - step 2: the Bill review panel with the source line outlined on the page
     - step 3: the four shares
     - step 4: the reminder proposal with "Approve and save"
  3. Footer.
- **Motion:** the frame is `position: sticky`. One `IntersectionObserver` sets `data-step` on it as each step crosses the middle of the viewport. States cross-fade in 200 ms. Under reduced motion, and below 1024 px, there is no pinning: the four states are stacked in order, each under its step.

### Recommendation: Direction C

1. **The hero is the product's promise, at poster scale:** ask in your own words, and the answer is tied to its source line. It is readable from across a room and survives a shared screen in Demo 1's ten minutes. In A, the same idea sat at 14 px inside a screenshot. The example question is one the app answers today.
2. **It answers the owner's reference most directly:** a field colour, heavy condensed type, colour bands, a motif from the subject and big numerals. It borrows the structure, not hackathlone's blue, typeface or battlements.
3. **It holds still.** Its only motion is two tags drawing out once. It reads the same with reduced motion and at 390 px.
4. **Cheap and contained:** one Google Fonts family and CSS only. It touches `Landing.tsx`, `Navbar.tsx`, `Footer.tsx`, `index.html` and the tokens, and nothing that issue #5 Phase 2 changes.
5. **D** argues best for the lecturer's retrieval priority, but costs the most to build (twelve tiles and a timed sequence). **E** is the safest, but the least bold; it could later become C's section 2, if the owner wants the steps.

### Signed-in home

No direction changes the signed-in home's structure (Section 4, Decision D2). The one carry-over is the highlighter mark (Decision D9): it changes how `SourceTie` shows the quoted line.

---

## 3. The identity (Frontend Design) — palette, typefaces and surfaces superseded by Section 3R

**Subject:** household paperwork — bills, receipts, manuals, warranties — and the moment of checking a figure on paper before paying, sharing or filing it.

**Principles**

1. **Show the source.** Any value the app read from a document appears with its line. This is the one memorable element: a highlighter band on the quoted line, tied by a hairline to the value. Everything else stays quiet.
2. **Two voices.** What the document says is set in a serif (Source Serif 4): quotes, OCR text, the sheet. What DocVault says is set in a sans (Public Sans). A reader can always tell evidence from interface.
3. **Ink, paper, highlighter.** The palette is the desk: cool paper, blue-black ballpoint ink, one highlighter yellow. Yellow appears only on evidence and on the single thing that needs attention, never as decoration.
4. **Hierarchy by weight and space, not by boxes.** Rows and hairlines, not stacks of rounded cards. Radius follows meaning: a document sheet is nearly square (2 px), a control 6 px, a panel 10 px.
5. **Motion only answers an action.** Nothing animates on load or loops for ever. One designed transition: upload to processing (Section 5).

**Self-review against the generic defaults** (Frontend Design process):

- **Palette:** the first draft paired cream paper with a terracotta stamp red. That is the most common generated palette (cream plus clay), so I changed it. The paper is now cool green-grey (#F6F7F4), and red is kept for errors only.
- **Labels:** the first draft used tracked-out capitals above every section ("CHECK", "DECIDE"). That is template chrome, so I removed it. Sections are introduced by sentence-case headings. Capitals appear only where the source document itself uses them ("EXAMPLE ENERGY" on the sheet).
- **Line numbers:** the first draft set them in a monospace face. That is another default, so I changed it to the sans in tabular figures with an "L" prefix ("L15").

**Wordmark:** "DocVault" in Public Sans 700, ink, preceded by a 16 px glyph: a sheet with a folded corner and one highlighter band. It replaces the layered-stack icon and the gradient text. The favicon is the glyph alone.

**Icons:** keep `lucide-react`, at stroke width 1.75, 18 px inline and 20 px in navigation. Icons are ink or graphite, never in tinted tiles. An icon-only button always has an `aria-label`.

**Navigation**

- **Signed out:** one top bar with the wordmark on the left, and "Sign in" (quiet) plus "Create an account" (primary) on the right. No anchor links.
- **Signed in, desktop (≥1024 px):** a left rail, 232 px wide, on the page colour in both themes; it is no longer forced dark. Links: **Documents** (home), **Ask**, **Upload**. Under them, "Recent chats" (collapsible, at most 5). At the bottom, an account menu: Profile, Settings, Theme, Sign out. The current link gets ink text, a 3 px ink bar on its left and a `sunken` background.
- **Signed in, phone (<1024 px):** a top bar (wordmark, a search button that opens the command palette, account), plus a bottom tab bar 56 px tall. The three tabs are Documents, Ask and Upload, each an icon with a text label. No drawer.

**Example — dense document list** (identity under load): rows 52 px tall, separated by hairlines, with no cards. The title is 16/24 ink and truncates in the middle; it carries a `title` attribute with the full name. The type is 15 px graphite, the date tabular, and a status tag on the right. One row in a list of twelve:

```text
│ ▤ Example Energy — October 2026        Bill   2 Nov 2026   [Needs confirming] │
│ ▤ Scan_2026-11-02_EXAMPLE-ENER…page1-of-1-FINAL(2).pdf  Bill  2 Nov  [Ready]  │  ← middle truncation
```

**Example — plain account form** (identity at rest): one column, 400 px wide on desktop and full width minus 16 px gutters on a phone. The wordmark and the heading are "Welcome back" (unchanged copy). Fields have visible labels above them, 44 px tall, with a 6 px radius and the `rule-strong` border. The primary button is full width and ink-filled. No gradient panel and no animated background: the left half of the screen shows the sheet from the landing page, still, on `sunken`, and only on desktop.

---

## 3R. Identity, revised 18 November 2026: the shadcn/ui look

The owner asked for a look "like shadcn/ui: clean, professional, minimalistic, modern, premium". This section **replaces Section 3's palette, typefaces and surfaces, and Section 7's tokens**. Kept from Section 3:
- the subject and the source-tie idea (every value read from a document sits beside its line)
- the restraint on motion
- the navigation structure
- the dense-list and account-form patterns

Sections 1, 2 (the copy of both directions), 4, 5, 6 and the implementation sequence still hold. Where they say "highlighter", "marker", "ink" or "paper", read them through the mapping at the end of this section.

**Why it fits this codebase:** the app already uses the shadcn pattern. That covers `class-variance-authority` buttons in `components/ui/`, Radix primitives (`@radix-ui/react-dialog`, `react-dropdown-menu`, `react-slot`, `react-tabs`), `cmdk`, `tailwind-merge`, and token names in `index.css` that are shadcn's (`background`, `foreground`, `primary`, `muted-foreground`, `border`, `ring`). The redesign moves those tokens to shadcn's **neutral** base colour and writes the missing components by hand in shadcn's API, so no new dependency is added.

**Principles**

1. **Monochrome first.** Neutral greys and one near-black primary. Colour appears only to mean something: destructive red, saved green, and amber for "needs attention". Each always comes with its words.
2. **Hierarchy by type weight, size and muted text, not by colour.** Headings `font-semibold tracking-tight`; supporting text `text-muted-foreground`.
3. **Cards with a 1 px border and a barely-there shadow** (`shadow-xs`), a 10 px radius, and generous padding. No gradients, glows or blur.
4. **The source tie, shadcn style.** The value sits on top (`text-2xl font-semibold tabular-nums`). Under it is an outline badge "Line 15", then the quoted line in a muted block: `bg-muted` with a 2 px left border in `border-foreground/20`, `text-sm`, regular weight. It stays a `blockquote`. Quiet, but unmistakably evidence.
5. **Motion as shadcn does it:** 150–200 ms colour and opacity transitions on interaction, and dialogs and menus that fade and zoom in at 95%. Nothing on page load and nothing looping. Section 5's upload states keep their behaviour; the highlighter sweep becomes a progress bar and a `Skeleton` pulse on the new row, which stop when processing ends.

**Typeface:** **Geist** (Google Fonts, weights 400, 500 and 600) for everything, replacing Inter, with `tabular-nums` for amounts and dates. A single family keeps it minimal. The serif document voice from Section 3 is dropped; the muted quote block carries that distinction instead.

**Type scale** (Tailwind classes):

| Role | Class | Size / line height |
| --- | --- | --- |
| Landing display | `text-4xl md:text-6xl font-semibold tracking-tight` | 36 / 40 → 60 / 60 |
| Landing lead | `text-lg md:text-xl text-muted-foreground` | 18 → 20 |
| Page title (app) | `text-2xl font-semibold tracking-tight` | 24 / 32 |
| Card title | `text-base font-semibold` (`CardTitle`) | 16 / 24 |
| Card description, meta | `text-sm text-muted-foreground` | 14 / 20 |
| Body and controls | `text-sm` | 14 / 20 |
| Value in review | `text-2xl font-semibold tabular-nums` | 24 / 32 |
| Badge, table header | `text-xs font-medium` | 12 / 16 (never body text) |

**Tokens** (replace the `:root` and `.dark` values in `index.css`; names unchanged, so every component picks them up; `--radius: 0.625rem`):

| Token | Light (oklch → hex) | Dark (oklch → hex) |
| --- | --- | --- |
| `--background` | 1 0 0 → #FFFFFF | 0.145 0 0 → #0A0A0A |
| `--foreground` | 0.145 0 0 → #0A0A0A | 0.985 0 0 → #FAFAFA |
| `--card`, `--popover` | 1 0 0 → #FFFFFF | 0.205 0 0 → #171717 |
| `--primary` | 0.205 0 0 → #171717 | 0.922 0 0 → #E5E5E5 |
| `--primary-foreground` | 0.985 0 0 → #FAFAFA | 0.205 0 0 → #171717 |
| `--secondary`, `--muted`, `--accent` | 0.97 0 0 → #F5F5F5 | 0.269 0 0 → #262626 |
| `--secondary-foreground`, `--accent-foreground` | 0.205 0 0 → #171717 | 0.985 0 0 → #FAFAFA |
| `--muted-foreground` | **0.52 0 0 → #6B6B6B** (shadcn's 0.556 fails on `muted`) | 0.708 0 0 → #A1A1A1 |
| `--border` (cards, separators) | 0.922 0 0 → #E5E5E5 | 1 0 0 / 10% → #2E2E2E on background |
| `--input` (control borders) | **0.64 0 0 → #8F8F8F** (3:1 for controls, WCAG 1.4.11) | **0.52 0 0 → #6B6B6B** |
| `--ring` | 0.708 0 0 → #A1A1A1 (shown as a 3 px ring at 50% plus the border) | 0.556 0 0 → #737373 |
| `--destructive` | 0.577 0.245 27.3 → #DC2626 | 0.704 0.191 22.2 → #FF6467 |
| `--success` (new) | 0.527 0.154 150 → #15803D | 0.792 0.209 151.7 → #4ADE80 |
| `--attention` (new) | 0.555 0.163 48.998 → #B45309 (text); 0.987 0.022 95 → #FFFBEB (wash) | 0.837 0.164 84.4 → #FBBF24 (text); 0.279 0.077 45.6 → #451A03 (wash) |
| `--sidebar` | 0.985 0 0 → #FAFAFA | 0.205 0 0 → #171717 |

**Contrast** (computed 18 November 2026 from the hex values; the Reviewer re-measures on the built CSS):

| Pair | Light | Dark | Needs |
| --- | --- | --- | --- |
| foreground on background | 19.8 | 19.0 | 4.5 |
| muted-foreground on background | 5.3 | 7.7 | 4.5 |
| muted-foreground on muted | 4.9 | 5.9 | 4.5 |
| muted-foreground on card | 5.3 | 6.9 | 4.5 |
| primary-foreground on primary | 17.2 | 14.2 | 4.5 |
| destructive on background | 4.8 | 6.9 | 4.5 |
| success on background | 5.0 | 11.4 | 4.5 |
| attention on background | 5.0 | 11.9 | 4.5 |
| attention on attention wash | 4.8 | 9.0 | 4.5 |
| input on background (control border) | 3.2 | 3.7 | 3.0 |

**Components** (shadcn's API, written by hand in `components/ui/`; no new packages):
- **Kept and restyled:** `button.tsx` (variants `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`; sizes `sm`, `default`, `lg`, `icon`), `card.tsx` (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction`), `input.tsx`.
- **Added:** `badge.tsx` (`default`, `secondary`, `outline`, `destructive`, plus `attention` and `success`), `label.tsx`, `separator.tsx` (a styled `div role="separator"`, no Radix package), `skeleton.tsx`, `table.tsx` (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`), `tabs.tsx` (wraps the installed `@radix-ui/react-tabs`), `dialog.tsx` and `dropdown-menu.tsx` (wrap the installed Radix packages), `kbd.tsx`.
- **Product components built from them:** `SourceTie`, `StatusTag` (now a thin wrapper over `Badge`), `Wordmark` and `AppNav`, as in Section 8.

**Wordmark:** "DocVault" in Geist 600 with `tracking-tight`, after a 20 px glyph. The glyph is a rounded square in `primary` with a white folded-corner sheet cut out. There is no second colour.

**Navigation:**
- **Desktop:** shadcn's sidebar pattern. A 240 px `sidebar` panel with a 1 px right border, links as `ghost` buttons (`h-9`, `text-sm`), the current link `bg-accent font-medium`. A header strip on each page has the page title and the page's actions (search, Upload).
- **Phone:** Section 3's top bar and three-item bottom tab bar, unchanged.

**Mapping from Sections 4 to 6:**
- "highlighter band" or "marker" on evidence → the muted quote block
- "highlighter" for attention → an amber `attention` badge or dot with its words
- "ink" button → `default` button
- "paper" → `background`
- "sheet" (the document page) → a `Card` with `shadow-sm` showing the page in `text-sm`
- the search match highlight → `bg-attention-wash` with `text-foreground`

---

## 4. The signed-in experience (UI/UX Pro Max)

**Seed content for every wireframe and screenshot** (synthetic, one account, twelve documents):

| # | Title | Type | Date | Status |
| --- | --- | --- | --- | --- |
| 1 | Example Energy — October 2026 | Bill | 2 Nov 2026 | Needs confirming |
| 2 | Example Energy — September 2026 | Bill | 3 Oct 2026 | Confirmed · revision 1 |
| 3 | Linkline Broadband — November 2026 | Bill | 5 Nov 2026 | Ready to review |
| 4 | Water charges — July to September 2026 | Bill | 14 Oct 2026 | Confirmed · revision 1 |
| 5 | Tenancy agreement 2026–27 | Lease | 28 Aug 2026 | Ready |
| 6 | Washer-dryer manual (model WD8) | Manual | 12 Jun 2026 | Ready |
| 7 | Washer-dryer warranty card | Warranty | 12 Jun 2026 | Ready |
| 8 | Kettle receipt | Receipt | 30 Sep 2026 | Ready |
| 9 | Car insurance renewal 2027 | Insurance | 9 Nov 2026 | Ready |
| 10 | Bin collection calendar 2026 | Other | 4 Jan 2026 | Ready |
| 11 | Home contents insurance schedule | Insurance | 1 Mar 2026 | Ready |
| 12 | Scan_2026-11-02_EXAMPLE-ENERGY-statement-account-ending-0042-page1-of-1-FINAL(2).pdf | Bill | 2 Nov 2026 | Processing |

### Flow 1 — find one file among twelve

- **Desktop:** the Documents page shows the heading "Documents" (copy unchanged), then a search field that is full width and focused on load, placeholder "Search by name or by what's on the page". Beside it sit a type filter (All, Bills, Receipts, Manuals, Warranties, Other) and the Upload button. Above the list, **Needs attention** shows at most three rows: unconfirmed bills, a pending reminder proposal, an out-of-date split. Each row has the reason and one action ("Review and confirm", "Open bill").
- **Typing "october"** filters the list as you type. It matches titles and, through the existing search endpoint, page text. The matched words are marked with the highlighter in the title and, under it, in a one-line serif snippet from the page. A result count sits above the list: "2 documents match "october"".
- **Phone:** the same order, one column. The search field sits under the top bar; the filter becomes a horizontal set of chips that wraps without scrolling. Rows stack the title (two lines at most, middle-truncated) over the type, date and status.
- **Empty result:** "No documents match "octber". Check the spelling, or search the words printed on the page." plus a button, "Clear search". **No documents at all:** "Your bills, receipts and manuals will appear here." plus a button, "Upload a bill".
- **Error:** "Could not load your documents. Check that DocVault is running, then try again." plus a button, "Try again". The existing `QueryError` behaviour is kept and restyled.
- **Keyboard:** "/" focuses search; Tab order is search, filter, Upload, then the Needs attention rows, then the list. Each row is a single link, with the full title as its accessible name.

### Flow 2 — check an extracted amount against its source

- **Desktop (≥1200 px):** two columns. Left (480 px): the existing Bill review panel, restyled. Each value (Amount due, Due date, Billing period) is a **source tie**: the value at 22 px tabular, then "OCR line 15" and the quoted line in serif on a highlighter band. Right: the original page (the existing preview) at a fixed width. Hovering or focusing a value outlines the matching line on the page, where the OCR position is known; otherwise nothing happens and no position is invented.
- **Phone:** one column. Values first, each with its quote. "View original bill" (copy unchanged) opens the preview full screen, with a close button labelled "Back to review".
- **Editing:** the existing Check values → Confirm these values → Confirm and save sequence is unchanged. Corrected values show "Corrected from €123.47" in the caution colour, with text, not colour alone.
- **Error:** the existing 409 message and reload behaviour are unchanged. It is restyled as a full-width notice in `danger-wash` with an icon and text. The draft stays visible, as the current panel already requires.

### Flow 3 — review the exact reminder before approving

- The Reminder panel keeps every line and button it has today: "Approve this reminder", "Proposal 2 · not saved yet", the Bill, Amount due, Due date, Remind on and Split rows, "Nothing is sent to anyone. The reminder is saved in your account only.", "Approve and save", "Cancel proposal" and the History list.
- **Layout:** a definition list in two columns (label 120 px graphite, value ink and tabular). The split shares are a nested table aligned on the decimal point. "Approve and save" is the only primary button in the panel; "Cancel proposal" is secondary. A proposal from the assistant shows "Proposed by the assistant" in the history (unchanged) and a small tag, "From Ask", beside the heading.
- **Phone:** the same rows stacked as label over value. The buttons are full width, Approve above Cancel, at least 44 px tall and 8 px apart.
- **States:** saved, out of date and cancelled keep their current copy. "Out of date" uses the caution colour plus its words; "Saved" uses the positive colour plus its words.

**Light and dark:** every token has both values (Section 7). Dark mode is a lamp-lit desk, not a black void. The sheet stays a lighter surface than the page in both themes. The highlighter band becomes a 3 px yellow left edge on a dim olive wash, so yellow never sits behind light text.

**Focus:** a 2 px solid `action` outline with a 2 px offset on every interactive element, in both themes, never removed. Remove `outline-none` wherever it has no replacement. Add a skip link, "Skip to content", as the first focusable element in the app shell.

---

## 5. The one interaction that earns motion: upload to processing (Modern Web Design)

**Why this one:** it is the only moment where the user waits on the system, and today it ends in confetti and a link to the wrong page (P10).

**What the user sees** (the same row in the Documents list, from start to finish):

1. **Choose files:** the file name appears at once as a row at the top of the list, with the status "Uploading 0%". A 2 px ink bar fills the bottom edge of the row as bytes are sent. Progress comes from the upload request's progress events where the browser supplies them; otherwise the status reads "Uploading" with no percentage.
2. **Upload accepted (201):** the bar completes, and the status changes to "Reading the text". A thin highlighter band sweeps once down a small sheet icon in the row: 1.2 s, ease-out, run once per status change, never looped. The row is already a link to the document page.
3. **Processing complete** (the existing document polling): the status becomes "Needs confirming" for a bill with candidates, or "Ready" otherwise. The row's background flashes the highlighter wash for 600 ms and fades to normal. A polite live region announces "Example Energy — October 2026 is ready to review."
4. **Failure:** the status becomes "Could not read this file" in the danger colour, with "Try again" and "Remove" actions. The live region announces the failure.

**Reduced motion:** the same four statuses as text, with no sweep, flash or bar animation; the bar jumps between states. The live-region announcements are the same.

**Implementation:** CSS only (`@keyframes` plus classes), no new dependency. Remove `canvas-confetti` (Decision D5).

---

## 6. Wireframes: one bill across landing, dashboard and bill review

The landing page wireframes are in Section 2 (Direction A).

```text
DOCUMENTS (signed-in home) — DESKTOP 1366
┌──────────────┬───────────────────────────────────────────────────────────┐
│ ▤ DocVault   │ Documents                                                 │ h1 28/34
│              │ [/ Search by name or by what's on the page      ] [All ▾] [Upload] │
│ ▌Documents   │                                                           │
│  Ask         │ Needs attention                                           │ h2 22/28
│  Upload      │ ▌Example Energy — October 2026   Not confirmed yet  [Review and confirm] │ ← yellow edge = attention
│              │  Linkline Broadband — November   Ready to review    [Open bill]          │
│ Recent chats │                                                           │
│  When is …   │ All documents · 12                                        │ ← count, sentence case
│              │ ─────────────────────────────────────────────────────────── │
│              │ ▤ Example Energy — October 2026   Bill  2 Nov 2026 Needs confirming │
│              │ ▤ Car insurance renewal 2027      Insurance 9 Nov  Ready   │
│              │ ▤ Scan_2026-11-02_EXAMPLE-ENER…FINAL(2).pdf Bill 2 Nov Processing ░░ │ ← Section 5 states
│              │ …                                                          │
│ (D) Demo …   │                                                           │
└──────────────┴───────────────────────────────────────────────────────────┘

DOCUMENTS — PHONE 390
┌──────────────────────────────┐
│ ▤ DocVault            ⌕  (D) │ top bar 56px
├──────────────────────────────┤
│ Documents                    │
│ [⌕ Search name or page text ]│
│ (All)(Bills)(Receipts)(More▾)│ chips wrap, no sideways scroll
│ Needs attention              │
│ ▌Example Energy — October    │
│  2026                        │
│  Not confirmed yet           │
│  [ Review and confirm ]      │ full width, 44px
│ All documents · 12           │
│ ▤ Example Energy — October   │
│   2026                       │
│   Bill · 2 Nov 2026          │
│   Needs confirming           │
├──────────────────────────────┤
│ ▤ Documents   ? Ask   ⇪ Upload│ bottom tabs 56px, labels always shown
└──────────────────────────────┘

BILL REVIEW — DESKTOP 1366 (document detail, Summary tab)
┌──────────────┬───────────────────────────────────────────────────────────┐
│ rail         │ ← All documents                                           │
│              │ Example Energy — October 2026          [Download] [Share] │
│              │ Bill · uploaded 2 Nov 2026 · 1.9 KB                       │ meta 15px graphite
│              │ (Summary) (Preview) (Ask)                                 │ tabs: underline current
│              │ ┌ Bill review ──────────────┐ ┌ original page ──────────┐ │
│              │ │ Not confirmed yet          │ │ EXAMPLE ENERGY          │ │
│              │ │ Amount due                 │ │ Electricity bill        │ │
│              │ │ €123.47 ───────────────────┼─┤▌Total amount due:      │ │ ← tie runs to the page
│              │ │ OCR line 15                │ │  EUR 123.47        L15  │ │
│              │ │ ▌"Total amount due: EUR 123.47"│ …                    │ │
│              │ │ Due date                   │ │▌Payment due date: …    │ │
│              │ │ 23 November 2026           │ │                         │ │
│              │ │ OCR line 17 ▌"Payment due …"│ └─────────────────────────┘ │
│              │ │ Billing period             │                           │
│              │ │ 1 October 2026 – 31 October 2026                       │
│              │ │ [Review and confirm]       │                           │
│              │ └────────────────────────────┘                           │
│              │ Bill split · Reminder (below, same restyle)               │
└──────────────┴───────────────────────────────────────────────────────────┘

BILL REVIEW — PHONE 390
┌──────────────────────────────┐
│ ← All documents              │
│ Example Energy — October 2026│
│ Bill · 2 Nov 2026            │
│ (Summary)(Preview)(Ask)      │
│ Bill review                  │
│ Not confirmed yet            │
│ Amount due                   │
│ €123.47                      │ 22px tabular
│ OCR line 15                  │
│ ▌Total amount due: EUR 123.47│ serif on highlighter band
│ Due date                     │
│ 23 November 2026             │
│ OCR line 17                  │
│ ▌Payment due date: 23 Nove…  │ wraps; never truncated
│ [ View original bill ]       │ secondary, full width
│ [ Review and confirm ]       │ primary, full width
├──────────────────────────────┤
│ ▤ Documents   ? Ask   ⇪ Upload│
└──────────────────────────────┘
```

---

## 7. Design tokens — superseded by Section 3R (kept for the record)

Replace the `@theme` block and the `.dark` block in `frontend/src/index.css` with these. Tailwind v4 reads `--color-*`, `--font-*`, `--radius-*` and `--shadow-*` from `@theme`. The old names (`background`, `foreground`, `primary`, `muted-foreground`, `border`, `ring` and so on) stay as aliases, so untouched components keep working during the migration (Task R1).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--color-paper` | #F6F7F4 | #15181E | Page background |
| `--color-surface` | #FFFFFF | #1D2129 | Panels and the document sheet |
| `--color-sunken` | #ECEEEA | #111419 | Rail, table header, wells |
| `--color-ink` | #1C2230 | #E9ECF1 | Text, primary button fill |
| `--color-graphite` | #586170 | #A9B1BE | Secondary text, labels |
| `--color-rule` | #D8DCD7 | #2C323C | Hairlines |
| `--color-rule-strong` | #868E98 | #69727E | Control borders (3:1 against paper and surface, WCAG 1.4.11) |
| `--color-marker` | #FFE15A | #3A3414 | Highlighter band (dark: a dim wash) |
| `--color-marker-edge` | #D9B300 | #E8C93A | 3 px left edge of the band |
| `--color-marker-ink` | #1C2230 | #FFF3BD | Text on the band |
| `--color-action` | #1F57B5 | #8DB4FF | Links, focus ring, current tab |
| `--color-positive` | #2D6A4D | #82CBA5 | Saved and confirmed text |
| `--color-caution` | #8A5800 | #F2BC5C | Out of date, corrected, due soon text |
| `--color-caution-wash` | #FFF4D9 | #2E2614 | Caution notice background |
| `--color-danger` | #B3261E | #FF8E85 | Errors |
| `--color-danger-wash` | #FCEAE8 | #3A1C1A | Error notice background |

Aliases: `background` → `paper`; `foreground` and `card-foreground` → `ink`; `card` → `surface`; `primary` → `ink`; `primary-foreground` → `paper`; `secondary`, `muted` and `accent` → `sunken`; `muted-foreground` → `graphite`; `border` and `input` → `rule-strong`; `ring` → `action`; `destructive` → `danger`.

**Contrast** (WCAG 2 relative luminance, computed from these hex values on 18 November 2026; the Reviewer re-measures them on the built CSS in Task R1 Step 4):

| Pair | Light | Dark | Needs |
| --- | --- | --- | --- |
| ink on paper | 14.8 | 15.0 | 4.5 |
| graphite on paper | 5.8 | 8.2 | 4.5 |
| graphite on surface | 6.3 | 7.5 | 4.5 |
| graphite on sunken | 5.4 | 8.5 | 4.5 |
| marker-ink on marker | 12.2 | 11.2 | 4.5 |
| action on paper | 6.3 | 8.6 | 4.5 |
| action on surface | 6.8 | 7.8 | 4.5 |
| positive on paper | 6.0 | 9.3 | 4.5 |
| caution on paper | 5.6 | 10.3 | 4.5 |
| danger on danger-wash | 5.6 | 7.0 | 4.5 |
| paper on ink (primary button text) | 14.8 | 15.0 | 4.5 |
| rule-strong on paper (control border) | 3.1 | 3.7 | 3.0 |
| rule-strong on surface | 3.3 | 3.3 | 3.0 |

Any pair under its threshold on the built CSS is a defect.

**Type:** `--font-sans: 'Public Sans', system-ui, sans-serif`; `--font-serif: 'Source Serif 4', Georgia, serif`. Load both from Google Fonts in `index.html`, replacing the Inter link: Public Sans weights 400, 500, 600 and 700; Source Serif 4 weights 400 and 600. Amounts, dates and counts use `font-variant-numeric: tabular-nums`.

| Role | Size / line height | Weight | Face |
| --- | --- | --- | --- |
| Landing display | clamp(36px, 4vw + 12px, 52px) / 1.08 | 700 | sans |
| h1 (app) | 28 / 34 | 650 (600 if 650 is unavailable) | sans |
| h2 | 22 / 28 | 600 | sans |
| h3, panel title | 18 / 24 | 600 | sans |
| Body | 16 / 24 | 400 | sans |
| Lead | 18 / 28 | 400 | sans |
| Small | 15 / 22 | 400 | sans |
| Meta (the smallest size anywhere) | 13 / 18 | 500 | sans |
| Value (amount, date in review) | 22 / 28 tabular | 600 | sans |
| Source quote | 16 / 26 | 400 | serif |

**Space:** a 4 px base: 4, 8, 12, 16, 24, 32, 48, 64, 96. Phone gutters are 16 px and desktop content gutters 32 px. The content maximum is 1120 px on the landing page; the app content is fluid next to the rail.

**Radius:** `--radius-page: 2px` (document sheet, thumbnails); `--radius-control: 6px` (buttons, inputs, tags); `--radius-panel: 10px` (panels, dialogs, notices). No pills, except the phone filter chips (`9999px`). A pill there signals a toggle.

**Shadow:** `--shadow-sheet: 0 1px 2px rgb(28 34 48 / .06), 0 4px 12px rgb(28 34 48 / .06)` for the document sheet only; `--shadow-pop: 0 8px 24px rgb(28 34 48 / .16)` for menus, dialogs and the command palette. Panels have no shadow.

**Motion:** `--ease-out: cubic-bezier(.2,.7,.2,1)`; durations 120 ms (press), 180 ms (open and close), 600 ms (ready flash), 1200 ms (one marker sweep). Nothing loops.

---

## 8. Shared component changes

| Component | Change |
| --- | --- |
| `components/ui/button.tsx` | Variants: `primary` (ink fill, paper text), `secondary` (surface, rule-strong border, ink text), `quiet` (no border, action text, underline on hover), `danger` (danger text and border). Height 40 px (44 px when the pointer is coarse), radius `control`. The press state is a 1 px downward translate; no lift or glow. Remove every `gradient-bg` caller. |
| `components/ui/input.tsx` | 44 px tall, rule-strong border, 6 px radius, focus ring in `action`. A visible label is required; the component warns in development if it gets neither `id` plus label nor `aria-label`. |
| `components/ui/card.tsx` | Becomes `Panel`: surface background, 1 px rule border, 10 px radius, no shadow, padding 24 px (16 px on a phone). Keep `Card` as an alias export until every caller has moved. |
| New `components/SourceTie.tsx` | `SourceTie({ label, value, lineNumber, quote, corrected?: string })`. It renders the label (meta), the value (value style), "OCR line {n}" and the quote as a `blockquote` in serif on the marker band. The browser test counts `blockquote` elements, so the quote must stay a `blockquote`. Used by `BillReview.tsx`, the landing hero and (after issue #5 Phase 2) `AssistantAction.tsx` facts. |
| New `components/StatusTag.tsx` | `StatusTag({ tone: 'neutral' \| 'attention' \| 'positive' \| 'caution' \| 'danger', children })`. Always text; tone only reinforces it. Attention is ink on a marker wash with a 3 px marker edge. |
| New `components/Wordmark.tsx` | The glyph plus "DocVault". Used by `Navbar.tsx`, the app rail, the top bar on a phone and the auth pages. |
| New `components/AppNav.tsx` | The desktop rail and the phone bottom tab bar from one list of links (`Documents` → `/app/documents`, `Ask` → `/app/ask`, `Upload` → `/app/upload`). It replaces the sidebar markup in `App.tsx:154` and the drawer state. |
| `components/Navbar.tsx`, `Footer.tsx` | Signed-out top bar and footer as in Section 2. |
| `components/NotificationCenter.tsx` | The unread badge becomes an ink dot with a count and an `aria-label`; no gradient. |
| `components/OnboardingTour.tsx` | Removed from the shell (P11). The file stays until Task R10 removes it with its tests. |
| `components/CommandPalette.tsx` | Restyled: surface, pop shadow, sans, the result row like a list row. "/" also opens search on the Documents page. |
| `components/QueryError.tsx`, `ErrorBoundary.tsx`, `Toast.tsx`, `DocumentPreviewModal.tsx` | Restyled with the danger notice and the new buttons. Copy unchanged. |

---

## 9. Route-by-route summary

| Route (`App.tsx`) | Page | Change |
| --- | --- | --- |
| `/` | `Landing.tsx` | The direction chosen in D1 (C recommended), exact copy from Section 2R. Remove the Samsung manual, the Tech Stack and FAQ sections and the "Final Year Project" pill (the fact moves to the footer line). |
| `/login`, `/register` | `Auth.tsx` | One-column form (Section 3). Retire `.animated-gradient`. All test-matched copy stays ("Welcome back", "Continue with Email", "Sign in", "Check your email", the email and password placeholders). |
| `/verify`, `/forgot-password`, `/reset-password`, `/auth/callback` | `VerifyEmail.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `OAuthCallback.tsx` | Same form shell; the wordmark replaces gradient text; copy unchanged ("Send reset link"). |
| `/app` (index) | today `AskAI` | Becomes `Dashboard` (Documents home with Needs attention), if D2 is approved. |
| `/app/documents` | `Dashboard.tsx`, `AnalyticsWidgets.tsx` | List view by default (Section 4). The analytics chart moves to a collapsed "Storage and activity" section at the bottom. Folders stay as a filter. The heading "Documents" and the button "Documents" keep their names. Fix the raw JSON snippet (P9) by not showing summaries in rows. |
| `/app/upload` | `Upload.tsx` | The drop zone becomes a plain dashed rule-strong area with one "Choose files" button. The progress-to-processing states from Section 5 replace the success modal and confetti; after upload, go to `/app/documents` with the new row highlighted. |
| `/app/documents/:id` | `DocumentDetail.tsx`, `BillReview.tsx`, `BillSplit.tsx`, `BillReminder.tsx` | Two-column bill review on wide screens (Section 6); panels restyled; every existing string, role and label unchanged. The document Ask tab gets the new chat style. Remove the progress shimmer and glow. |
| `/app/ask`, `/app/ask/:conversationId` | `AskAI.tsx` | Messages as plain rows: the user's in a sunken bubble right-aligned, DocVault's on paper with the wordmark glyph. The heading "Ask anything about your documents" stays. After issue #5 Phase 2 merges, its result cards use `SourceTie` and `StatusTag` (Task R9). |
| `/app/chats` | `SearchChats.tsx` | List rows like documents. |
| `/app/search` | `Search.tsx` | The same row and highlight treatment as the Documents search (Section 4). |
| `/app/warranties` | `Warranties.tsx` | List rows with the expiry date tabular and caution text under 30 days ("Expires in 12 days"). |
| `/app/profile`, `/app/settings` | `Profile.tsx`, `Settings.tsx` | The plain account form pattern; the theme setting offers System, Light and Dark. |
| (unrouted) | `Categories.tsx` | Not routed today; restyle its one gradient button only. |

---

## Decisions for the owner

1. **D1. Landing direction (revised in Section 2R).** *Recommended:* C, "The poster". Alternatives: D, "The pile", or E, "The walkthrough". A and B are withdrawn.
2. **D2. Signed-in home.** *Recommended:* `/app` opens Documents with Needs attention; Ask stays in the navigation. Six browser-test assertions expect the heading "Ask anything about your documents" right after sign-in, and they change to expect the heading "Documents". This is the only test change outside new tests. Alternative: keep Ask as the home; the rest of the plan is unchanged.
3. **D3. Typeface.** *Recommended (Section 3R):* Geist for everything, loaded from Google Fonts exactly as Inter is today (no new dependency, €0). The Section 3 pairing of Public Sans and Source Serif 4 is withdrawn.
4. **D4. Themes.** *Recommended:* follow the system setting, with a manual override in Settings (today's `lib/theme.ts` behaviour). The rail is no longer forced dark.
5. **D5. Remove `canvas-confetti`.** *Recommended:* yes; it is used only for the upload celebration that Section 5 replaces.
6. **D6. A GitHub issue and two pull requests.** *Recommended:* I open an issue, "Redesign the website around finding, checking and deciding", with the acceptance checks at the end of this plan.
   - Superseded by Section 0R: PR 1 is Tasks R0 to R7 and R10 (not the bill panels), alongside issue #25, once #24 PR 2 merges. PR 2 is Tasks R8, R9 and R11, after #25 and PR 1 merge. The Demo 1 merge freeze was lifted on 18 November.
7. **D7. Impeccable.** It is not installed, because its hooks download and run a binary at every session start, after every file edit and at every turn end, in all your sessions. *Recommended:* leave it uninstalled; this plan used its critique method without the detector. If you want it, install it yourself with `claude plugin install impeccable@impeccable`, knowing the hooks will run.
8. **D8. A display face for the landing page.** Only under Direction C. *Recommended:* Archivo (variable width and weight), loaded from Google Fonts in the same `<link>` as Geist, at €0 and with no package. It is used only for the landing display type and the wordmark; the app keeps Geist (D3). D and E need no new face.
9. **D9. The highlighter mark in the app.** *Recommended:* yes, with any of C, D or E. `SourceTie` shows the quoted line on `--mark` (`#FFE98A` with ink text, 14.7:1) and a 3 px ink edge in light mode. In dark mode it uses a `#3A3414` wash, a `#E8C93A` edge and `#FFF3BD` text (Section 7's marker values). This replaces the grey `bg-muted` block of Section 3R principle 4, so the landing page and the bill review mark evidence the same way. Muted text never sits on the mark. Alternative: keep 3R's grey block.
10. **D10. The landing page's subject (Section 2R, Positioning).** *Recommended:* lead with DocVault as a personal knowledge base you can ask, with the bill as the first worked example. Show as working only what the table there marks as implemented; general answers and connecting documents are not shown until they are built and evaluated. Agreed by the owner on 18 November 2026 for Direction C.

## Global Constraints

- Branch `feature/website-redesign` from `origin/main`. Issue sessions work in their own worktree, cut from this branch. Pull requests target protected `main`. The Issue session never merges; the Reviewer merges only under `AGENTS.md`, and not before 21 November 2026.
- No AI or tool attribution in commits, pull requests or branch names.
- **No behaviour change**, except D2 (the home route), Section 5 (upload states, ending on the documents list) and the phone navigation. Server code, API calls, ownership checks, evidence, conflict handling and the explicit approval of the exact reminder proposal are untouched. `authorizedFetch` stays the only path for protected calls.
- **Copy the tests match is frozen.** Before changing any visible string, grep `frontend/e2e/*.ts` and `frontend/src/**/*.test.tsx` for it. Frozen strings include every string in the bill review, split, reminder and auth flows that the tests use. Examples: "Bill review", "Bill split", "Review and confirm", "Check values", "Confirm and save", "Confirmed · revision 1", "Split this bill", "Calculate shares", "Save split", "Saved · split 1", "Propose reminder", "Approve and save", "Proposal 2 · not saved yet", "Propose a different reminder", "Add a housemate", "Days before the due date", "Amount due (€)", "Welcome back", "Continue with Email", "Check your email", "Send reset link", "Documents", "Ask anything about your documents". Under D2, only the six home assertions change.
- `mobile/` is not touched.
- No new runtime or development dependencies. `canvas-confetti` is removed if D5 is approved. Fonts come from Google Fonts as today.
- Gates: frontend `npm ci`, `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`; browser `npx playwright test` against a disposable stack (never the `dvdemo` project); backend unchanged, so its gate need not rerun unless a file outside `frontend/` changes.
- Synthetic documents and disposable accounts only. The twelve seed documents are generated as PDFs from text by a script under `frontend/e2e/fixtures/redesign/` (Task R0), using the existing `uploadBillImage` approach or plain PDFs like `evaluation/demo-1/synthetic-electricity-bill.pdf`.

## Implementation sequence

### Task R0: Seed data and "before" screenshots

- **Files:** create `frontend/e2e/redesign-screens.spec.ts` (skipped unless `E2E_SCREENSHOTS=1`), `frontend/e2e/fixtures/redesign/` (the twelve synthetic documents) and `evaluation/redesign/README.md`.
- [ ] Write a Playwright spec that signs in a seeded account, uploads the twelve documents, confirms nothing, and saves screenshots to `evaluation/redesign/before/<route>-<width>-<theme>.png`. Routes: `/`, `/login`, `/app`, `/app/documents`, `/app/documents?q=october` (or the search route the list uses), an empty search, `/app/documents/<October bill>` unconfirmed, the same after confirming, the reminder proposal state, and `/app/upload` mid-upload. Widths 1366 and 390; themes light and dark.
- [ ] Commit the screenshots. Commit: `Record the screens before the redesign`

### Task R1: Tokens, typefaces and the retired-style guard

- **Files:** `frontend/src/index.css`, `frontend/index.html`; create `frontend/src/designGuard.test.ts`.
- [ ] **Step 1: failing test.** `designGuard.test.ts` reads every file under `src/` and fails on any of: `gradient-bg`, `gradient-text`, `animated-gradient`, `icon-gradient-`, `hover-lift`, `glass`, `from-purple`, `to-purple`, `from-violet`, `to-violet`, `from-indigo`, `canvas-confetti`, `animate-float`, `animate-slide-up`, `animate-fade-in`, `animate-scale-in`, `blur-2xl`, `blur-xl`, `shadow-primary/`. It lists each file and match. Expected now: fails with many matches. It stays failing until Task R10, so mark it `test.todo` until then, then switch it to a real test in R10 Step 1.
- [ ] **Step 2:** replace the token values in `index.css` with Section 3R's table: the same names, plus `--success`, `--attention`, `--attention-wash`, `--sidebar` and `--radius: 0.625rem`, mapped into `@theme` as `--color-*`. Delete the retired utilities and their keyframes. Keep the reduced-motion block. Add only the keyframes shadcn's dialogs, menus and `Skeleton` need.
- [ ] **Step 3:** replace the Inter font link with Geist (weights 400, 500 and 600) and set `--font-sans: 'Geist', system-ui, sans-serif`.
- [ ] **Step 4:** the Reviewer measures every pair in Section 3R's contrast table from the built CSS and records the numbers.
- [ ] Gates. Commit: `Replace the purple theme with paper, ink and highlighter tokens`

### Task R2: Shared components

- **Files:** `components/ui/button.tsx`, `input.tsx`, `card.tsx`; create `components/ui/badge.tsx`, `label.tsx`, `separator.tsx`, `skeleton.tsx`, `table.tsx`, `tabs.tsx`, `dialog.tsx`, `dropdown-menu.tsx` and `kbd.tsx` (shadcn's API, Section 3R, no new packages); create `SourceTie.tsx`, `StatusTag.tsx`, `Wordmark.tsx` and their `*.test.tsx`. Where Section 8 describes a variant by the Section 3 names (ink, marker, quiet), use Section 3R's mapping.
- [ ] Failing tests:
  - `SourceTie` renders the label, value, "OCR line 15" and the quote inside a `blockquote`, and with `corrected="€123.47"` shows "Corrected from €123.47".
  - `StatusTag` renders its text for every tone.
  - `Button` renders each variant with no class containing `gradient`.
  - `Wordmark` has the accessible name "DocVault".
- [ ] Implement. Gates. Commit: `Add the source tie, status tag and wordmark, and restyle buttons and inputs`

### Task R3: App shell and navigation

- **Files:** `App.tsx`; create `components/AppNav.tsx`, `AppNav.test.tsx`; `NotificationCenter.tsx`, `CommandPalette.tsx`; `e2e/*.ts` (only the D2 assertions).
- [ ] Failing tests:
  - At 1366 px, `AppNav` renders a navigation landmark with three links (Documents, Ask, Upload) and marks the current one with `aria-current="page"`.
  - At 390 px (`matchMedia` mocked), it renders the bottom tab bar with the same three labelled links and no drawer.
  - "Skip to content" is the first focusable element.
  - Under D2, `/app` renders the heading "Documents".
- [ ] Implement. Remove the drawer state and the `OnboardingTour` mount. Update the six e2e home assertions (D2 only).
- [ ] Gates, including Playwright. Commit: `Replace the chat sidebar with a document-first navigation`

### Task R4: Landing page, top bar and footer

- **Files:** `pages/Landing.tsx`, `components/Navbar.tsx`, `components/Footer.tsx`, `index.html` (the Archivo link, under D8 only); create `pages/Landing.test.tsx`.
- [ ] Failing tests:
  - The heading reads the chosen direction's H1: C "Everything you keep, ready to answer.". For D or E, the H1 is rewritten to the knowledge-base positioning before the build (Section 2R, Positioning).
  - A link "Create an account" goes to `/register`, and a link "Sign in" goes to `/login`.
  - The hero shows the quoted source lines and their values from Section 2R. C: the question "When is the electricity bill due?", the quoted lines "Total amount due: EUR 123.47" and "Payment due date: 23 November 2026", and the tags "€123.47" and "23 Nov"; the search picture is a `figure` with `role="img"` and the page has no `input`. D: "Payment due date: 23 November 2026", with "Due 23 November 2026". E: "Total amount due: EUR 123.47", with "Line 15".
  - The page has exactly one `h1`. With `prefers-reduced-motion: reduce` mocked, no hero element has an animation class.
  - The footer line reads "A final-year project at TUS Athlone. It runs on your own computer, and the examples on this page are synthetic."
  - Under D, the hero search is a `figure` with `role="img"`, and the page has no `input`.
  - No text contains "Samsung".
- [ ] Implement the direction chosen in D1 from Section 2R, with its exact copy, colours and motion. The axe check in `e2e/accessibility.spec.ts` must pass unchanged; Section 2R lists the contrast of every pair.
- [ ] Gates. Commit: `Redesign the landing page around checking a bill`

### Task R5: Account pages

- **Files:** `pages/Auth.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `VerifyEmail.tsx`, `OAuthCallback.tsx`, `components/PasswordStrength.tsx`, `PinInput.tsx`.
- [ ] Existing tests and e2e must pass unchanged. Add a test that the register page shows visible labels for the email and password fields.
- [ ] Gates. Commit: `Restyle the account pages`

### Task R6: Documents home and search

- **Files:** `pages/Dashboard.tsx`, `components/AnalyticsWidgets.tsx`; create `pages/Dashboard.test.tsx` (it has no unit tests today).
- [ ] Failing tests, with twelve mocked documents:
  - Typing "october" leaves two rows and shows "2 documents match "october"".
  - An unmatched search shows "No documents match" and a "Clear search" button.
  - The long filename row has a `title` attribute with the full name.
  - "Needs attention" lists the unconfirmed October bill with "Review and confirm".
  - With no documents, "Upload a bill" is shown.
  - No row shows a `{"` JSON fragment.
- [ ] Implement.
- [ ] Gates. Commit: `Make the documents list the place to find and act`

### Task R7: Upload to processing

- **Files:** `pages/Upload.tsx`, `pages/Dashboard.tsx` (the in-list row states), `package.json` and `package-lock.json` (remove `canvas-confetti` under D5).
- [ ] Failing tests:
  - After a mocked successful upload, the app navigates to `/app/documents`, and the row shows "Reading the text", then "Needs confirming" when the polled document has candidates.
  - A polite live region announces "… is ready to review."
  - A failed upload shows "Could not read this file" with "Try again".
  - With `prefers-reduced-motion: reduce` mocked, the row has no animation class.
- [ ] Implement Section 5.
- [ ] Gates. Commit: `Show an upload turning into a document in the list`

### Task R8: Document page and bill panels

- **Files:** `pages/DocumentDetail.tsx`, `components/BillReview.tsx`, `BillSplit.tsx`, `BillReminder.tsx`, `DocumentPreviewModal.tsx`.
- [ ] Every existing test in `BillReview.test.tsx`, `BillSplit.test.tsx`, `BillReminder.test.tsx`, `DocumentDetail.test.tsx` and the e2e bill scenarios must pass **unchanged**. That is the acceptance check for "no behaviour change".
- [ ] Add tests:
  - `BillReview` uses `SourceTie` for each value (three `blockquote` elements, as the e2e already counts).
  - At ≥1200 px, the original page is shown beside the panel.
  - The reminder panel's "Approve and save" is its only primary-variant button.
- [ ] Gates. Commit: `Restyle the document page and keep every bill check in view`

### Task R9 (PR 2, after issue #5 Phase 2 merges): Ask

- **Files:** `pages/AskAI.tsx`, `components/AssistantAction.tsx` (from Phase 2).
- [ ] Phase 2's card tests must pass unchanged. Add a test that the facts card renders its evidence through `SourceTie`.
- [ ] Gates. Commit: `Restyle Ask and its result cards`

### Task R10: Remaining screens and the guard

- **Files:** `pages/Search.tsx`, `SearchChats.tsx`, `Warranties.tsx`, `Settings.tsx`, `Profile.tsx`, `Categories.tsx`; `components/QueryError.tsx`, `ErrorBoundary.tsx`, `Toast.tsx`; delete `OnboardingTour.tsx`.
- [ ] **Step 1:** turn `designGuard.test.ts` from `todo` into a real test; it must now pass. In PR 1, it excludes `AskAI.tsx` and `AssistantAction.tsx` until R9.
- [ ] Gates. Commit: `Restyle the remaining screens and guard against the retired styles`

### Task R11: "After" screenshots, documents and review

- [ ] Run `redesign-screens.spec.ts` with `E2E_SCREENSHOTS=1` into `evaluation/redesign/after/`, using the same names, routes, widths and themes as R0.
- [ ] Update `README.md` (feature list wording only if needed) and `specs/Repo_Current_State.md` (a verified-results row: commit, gates, screenshot set). State only what was run.
- [ ] **Reviewer requirements:**
  - Compare each before/after pair. Check the Section 7 contrast numbers, keyboard focus on every interactive element of the landing page, Documents, bill review and the reminder panel, and the 390 px screens for horizontal scroll (`scrollWidth === innerWidth`).
  - Check reduced motion by emulating it in Playwright.
  - Confirm the frozen-copy list by running the unchanged e2e.
  - Put the full report and the screenshot list in the PR description.
- [ ] Commit: `Record the screens after the redesign`

## Acceptance checks (proposed for the issue)

| # | Check | Verified by |
| --- | --- | --- |
| 1 | No purple or indigo gradient, glow, frosted glass, floating animation or confetti remains in the web app | `designGuard.test.ts` (R1, R10); R11 screenshots |
| 2 | Every web route uses the new tokens in light and dark, with text contrast ≥4.5:1 and large text and controls ≥3:1 | Section 7 table re-measured (R1 Step 4); R11 screenshots in both themes |
| 3 | At 390 px, no page scrolls sideways, the landing page's primary action is on the first screen, and navigation is a bottom tab bar with no overlapping drawer | `AppNav.test.tsx` (R3); R11 width check; R11 screenshots |
| 4 | Every value the bill review shows sits beside its source line, and the original page is beside it on wide screens | `BillReview` tests (R8); e2e `blockquote` count unchanged |
| 5 | The reminder is saved only by "Approve and save" on the exact proposal shown; nothing about approval changes | Existing `BillReminder` tests and e2e unchanged (R8) |
| 6 | Every interactive element shows a visible focus ring; the first focusable element is "Skip to content" | `AppNav.test.tsx` (R3); Reviewer's keyboard pass (R11) |
| 7 | With reduced motion, nothing animates and the upload states are still clear | R7 test; Reviewer's emulated pass (R11) |
| 8 | All existing frontend and browser tests pass; only the D2 home assertions changed | Gates on every task; PR diff of `e2e/` |

## 0R-3. Revision, 20 November 2026: light public pages, the DocVault tab icon

Approved by the owner on 20 November 2026 (01:00), before Demo 1. Owner's answers: "Light landing + app logo icon (Recommended)" and "Tonight: build, review, merge (Recommended)". Built on branch `feature/website-redesign-light-landing`, cut from `main` at `da78e85`. It changes only what it names; 0R-2 R-A's rule (yellow as an accent, theme-token surfaces) still holds inside the light pages.

**R-D. Public pages are always light; the signed-in app keeps following the theme.**
- **Why:** with a dark system theme, the landing page renders near-black, and the owner finds that unappealing.
- **Rule:** the `dark` class on `<html>` is applied only on app paths: `/app` and anything under `/app/`. Every other path (`/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify`, `/auth/callback`) renders with the light tokens, whatever the system theme or the saved preference. The saved preference is not changed.
- **`frontend/src/lib/theme.ts`:**
  - add `export function isAppPath(pathname: string): boolean`, true for `/app` and paths starting with `/app/`
  - `initialiseTheme()`'s `apply` sets `dark` only when `resolved() === 'dark' && isAppPath(window.location.pathname)`
  - `apply` also runs on a `route-change` window event
- **`frontend/src/App.tsx`:** add a small `ThemeRouteSync` component inside the router that runs `window.dispatchEvent(new Event('route-change'))` in a `useEffect` on `location.pathname`. Render it once, beside the routes.
- **`frontend/index.html`:** set `<meta name="theme-color" content="#FFFFFF">`.
- **Unchanged:** the theme switch in Settings and the command palette, and the app's dark tokens. Leaving `/app` for `/` (sign-out, or the logo on a public page) turns the page light. Opening `/app` turns it dark again if that is the preference.

**R-E. The tab icon is the DocVault glyph.**
- **Why:** the tab and the installed app still show the purple Lucide "layers" icon from the original scaffold. The header logo is the `FileText` glyph in a rounded square (`Wordmark.tsx`).
- **`frontend/public/favicon.svg`:** replace it with the same glyph:
  - `viewBox="0 0 80 80"`, `<title>DocVault</title>`
  - a full-size rounded square, `rx="16"`, fill `#171717` (light `--primary`)
  - the Lucide `FileText` paths, copied exactly from the installed `lucide-react` package (`dist/esm/icons/file-text.js`), in a group with `transform="translate(15 15) scale(2.0833)"` (50 px of the 80), `fill="none" stroke="#FAFAFA" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"`
  - keep the Lucide ISC licence comment
- **`frontend/public/manifest.json`:** `theme_color` `#FFFFFF`. The icon entry stays `/favicon.svg`.
- **Not in scope:** the mobile app icon, and a newly designed logo. A proper logo can be a later plan if the owner wants one.

**Tests (written first):**
- **`frontend/src/lib/theme.test.ts`** (new). Mock `prefers-color-scheme: dark` and keep the preference unset:
  - on `/`, `/login` and `/register`, `<html>` has no `dark` class
  - on `/app` and `/app/documents`, it has the class
  - after `history.pushState` from `/app/documents` to `/` and a `route-change` event, the class is gone
  - with the preference set to `light`, `/app` has no class
- **`frontend/src/brand.test.ts`** (new). Reads files from disk:
  - `public/favicon.svg` contains `<title>DocVault</title>`, `#171717` and the `FileText` path data, and does not contain the old layers path
  - `index.html` and `public/manifest.json` both carry `#FFFFFF` as the theme colour
- **`frontend/e2e/accessibility.spec.ts`.** Add one scenario with `colorScheme: 'dark'`:
  - the landing page's `.poster` background computes to `rgb(255, 255, 255)`, and axe passes
  - `/login` has no `dark` class on `<html>`, and axe passes
  - after signing in, `/app/documents` has the `dark` class
- **Unchanged:** all existing unit and e2e tests and `designGuard.test.ts` pass.

**Done when:**
- a dark-theme browser shows the landing and the sign-in pages white with near-black text and yellow only as accents
- the app after sign-in is dark
- the tab shows the dark rounded-square document icon
- the gates and the four hosted checks pass, the Reviewer's verdict is clean, and the 3700 preview is refreshed to the merge

## 0R-4. Revision, 20 November 2026: redesign PR 2, the product preview and a worklist Documents page

**Status:** proposed on 20 November 2026. On the same day, after Demo 1, the owner approved the direction:
- the [redesign review](https://claude.ai/artifact/PTaMXVE7b8zjQDHS7u6XQN) D1 to D5 as recommended
- the next-phase memo's C1 (0R-4 inside PR 2), C2 (reuse the 19 November drafts if they apply cleanly) and C3 (the findings list below)

The owner approved this revision as written on 20 November 2026. Where it disagrees with an earlier section, this section wins.

**Why:** the signed-in app still looks like an LLM chat site, mainly because the rail lists "Recent chats" with conversation menus. The homepage shows a picture of paper instead of the product answering. The fix borrows one idea each from two references:
- SlateAi's stacked hero with a window of the real app
- shadcn's Tasks page: page head, faceted filters, a table, one ⋯ menu per row

**Decisions (approved 20 November 2026):**
- **D1:** build it now, inside PR 2.
- **D2:** the only "Create an account" above the fold is the header's (0R-2).
- **D3:** keep the rail and take the chats out of it.
- **D4:** a table at 768 px and up, stacked rows below.
- **D5:** three steps replace the search and privacy sections, and the privacy point becomes one footer line.

**Two corrections to the review, from the code:**
- **The Documents page keeps the button text "Upload", not "Upload document".** `e2e/app.spec.ts:114` clicks `getByRole('main').getByRole('button', { name: 'Upload', exact: true })`, and the e2e lines change only where this plan allows.
- **Two items from the review's row menu change:**
  - "Ask about this" is dropped. Ask has no way to open scoped to one document from a link, and adding one is agent-experience work, not restyling.
  - Delete doesn't open a confirm dialog today; it removes the row and offers "Undo" for 5 seconds. The menu keeps that behaviour exactly.

### PR 2 scope and order

PR 2 is one branch, `feature/website-redesign-pr2`, cut from `main` at `2048c3f` or later. Tasks in this order, each with its own commit and gates:

1. **R8**, as written.
2. **R9**, as written.
3. **R12**, the landing product preview (new, below).
4. **R13**, the Documents worklist and a rail without chats (new, below).
5. **R14**, the findings left from PRs 30 and 31 (new, below).
6. **R11**, the "after" screenshots and review, as written. Last, so the screenshots show R12 and R13.

**Starting from the 19 November drafts (C2).** Branch `feature/website-redesign-bill-preview` holds two unreviewed commits made for the demo preview before PRs 29 and 30 merged:
- `349369d`, "Restyle the document page and keep every bill check in view" (R8)
- `a1efb3e`, "Restyle Ask and its result cards" (R9, which also deletes `OnboardingTour.tsx` and its e2e lines)

How the Issue session uses them:
- **Try each:** run `git cherry-pick 349369d`, then `git cherry-pick a1efb3e`.
- **Keep a draft** only if it applies with no conflict, or with conflicts limited to import lines and class names, and if R8's or R9's added tests then exist and every gate passes.
- **Otherwise:** run `git cherry-pick --abort` and build that task from the plan.
- **Either way:** record which way each task went in the PR description. The Reviewer reviews the result against R8 and R9 as if it were new code. The draft is never accepted as already reviewed.

**The welcome tour** goes in R9, as the 18 November clarification says:
- delete `OnboardingTour.tsx` and its mount in `App.tsx`
- remove `accessibility.spec.ts`'s tour assertions (the "Welcome to DocVault!" dialog and "Skip tour")
- remove the test-only tour wait that PR 31 added to `app.spec.ts` (the comment near line 50 and the step it describes)

These are the only e2e edits allowed outside D2.

### Task R12: Landing, a product preview above the fold

- **Files:**
  - `frontend/src/pages/Landing.tsx`, `landing.css`
  - new `frontend/src/components/landing/HeroPreview.tsx`
  - `frontend/src/components/Footer.tsx`
  - `ExampleBill.tsx`: delete it if `Landing.tsx` was its only importer, and move any `identity.test.tsx` assertion about it that still applies to `HeroPreview`
  - tests: `Landing.test.tsx`, `e2e/redesign-screens.spec.ts`, `e2e/accessibility.spec.ts`
- **Hero, top to bottom, one column at every width:**
  - the existing `h1` and its four animated lines, unchanged
  - **one** lead paragraph for every width, the existing phone lead word for word: "Ask in your own words. Every answer comes with the line it came from, and nothing is saved until you approve it." The longer desktop lead and the `phone-lead` duplicate are removed.
  - `<HeroPreview />`, full content width, directly under the lead
- **`HeroPreview`** is a static picture of the product, not a working form.
  - `export function HeroPreview(): JSX.Element` renders `<figure role="img" aria-label="DocVault answering “When is my electricity bill due?” with 23 November 2026, from the October electricity bill, line 17.">`.
  - **Window bar:** three 6 px dots (`aria-hidden`), on `--muted`, 1 px `--border`, radius 12 px (panel).
  - **Left pane (Ask):**
    - a right-aligned question bubble: "When is my electricity bill due?"
    - an answer card: "23 November 2026" in Archivo 600 at 1.5rem, then "October electricity bill · line 17" in Geist Mono at 0.8125rem, `--muted-foreground`
    - a `<span>` styled as a small dark chip, "Open bill", not focusable
  - **Right pane (the bill):** monospace lines with right-aligned line numbers:
    - "9 Billing period: 1–31 Oct 2026"
    - "15 Total amount due: EUR 123.47"
    - a blank bar for line 16
    - line 17 through the existing `SourceTie` (`label="Due date" value="23 November 2026" lineNumber={17} quote="Payment due date: 23 November 2026"`), so the yellow highlight is the same component the bill review uses
  - **Below 768 px**, the panes stack (Ask first) and the bill shows only lines 15 and 17.
  - **No animation.** It's above the fold and must be readable on first paint.
- **Sections after the hero:**
  - **New, "Three steps, and you decide."** (`h2`), an ordered list of three items, each an `h3` and one line:
    1. "Upload": "A bill, a lease, a manual or a receipt."
    2. "Ask": "In your own words. Every answer shows the line it came from."
    3. "Check and approve": "See the source line. Nothing is saved without you."

    On desktop it's three columns with a 2 px top rule each, as in the review's wireframe. Below 768 px it's one column.
  - **Kept unchanged:** "It proposes. You decide." and "Start with one document." with its "Create an account" button.
  - **Removed:** "Find anything by what it says or what it means." (the search sample) and "Your documents stay on your computer." with its "How does asking a question work?" details.
- **`Footer.tsx`:** add one line before the existing links: "DocVault runs on your own computer. Each account sees only its own documents." It's shared with the account pages, which is intended.
- **Tests first:**
  - **`Landing.test.tsx`:**
    - exactly one `h1`, and no `input`, `textarea` or `select`
    - the figure's accessible name contains "When is my electricity bill due?", "23 November 2026" and "line 17"
    - the three step headings appear in order
    - "Find anything by what it says" and "Your documents stay on your computer" are gone
    - the footer line is present
    - PR 26's banned-claims assertions still pass unchanged
  - **`e2e/redesign-screens.spec.ts`**, new scenario "landing preview is above the fold":
    - at 1366 × 768, the bounding boxes of the question, "23 November 2026", "line 17", the highlighted quote and the header's "Create an account" link all end at or above y = 768
    - at 390 × 844, "23 November 2026" ends at or above y = 844, `scrollWidth === innerWidth`, and the header's "Create an account" is visible
  - **`e2e/accessibility.spec.ts`:** the existing landing axe checks in light and dark schemes pass unchanged.
- [ ] Gates. Commit: `Show the product answering on the landing page`

### Task R13: Documents as a worklist, and a rail without chats

- **Files:**
  - `frontend/src/pages/Dashboard.tsx`
  - new `frontend/src/components/FacetFilter.tsx`
  - new `frontend/src/components/DocumentRowMenu.tsx`
  - `frontend/src/components/DocumentStatus.tsx`
  - `frontend/src/components/AppNav.tsx`
  - `frontend/src/pages/AskAI.tsx`
  - `frontend/src/pages/SearchChats.tsx`
  - tests: `AppNav.test.tsx`, `Dashboard.test.tsx`, new `Dashboard.filters.test.tsx`, new `SearchChats.test.tsx`
- **Page head:**
  - left: `h1` (unchanged), then the count line, unchanged: "{n} documents · {m} folders"
  - right, in this order: an outline button "Ask" (to `/app/ask`) and the primary button "Upload" (to `/app/upload`)
  - the toolbar's current "Upload" button moves here, so there is still exactly one button named "Upload" inside `main`
- **Order below the head:** Needs attention (unchanged content and copy), then the toolbar, then the list. Today the toolbar comes first.
- **Toolbar, left to right:**
  - the search box (unchanged)
  - `FacetFilter` "Status"
  - `FacetFilter` "Type", which replaces the `<select aria-label="Document type">` (no test or e2e line uses it)
  - the existing "Folders" and "List options" menus, unchanged
- **`DocumentStatus.tsx`:** add `export function statusLabel(doc: Document, detail?: Document): string`, returning exactly the text `DocumentStatus` shows. `DocumentStatus` then uses it, so the two can't drift.
  - For filtering, "Confirmed · revision n" counts as "Confirmed".
  - "Checking status" is never offered as a filter option.
- **`FacetFilter`**
  - **Props:** `{ label: string; options: { value: string; label: string; count: number }[]; selected: ReadonlySet<string>; onChange: (next: Set<string>) => void }`
  - **Trigger:** built on the existing `dropdown-menu`. An outline `Button` with a dashed border, `PlusCircle` icon and the label. Once anything is selected, it adds a separator and the number selected. Its accessible name is "Filter by {label lower-cased}" plus ", {n} selected" when that applies.
  - **Content:** one `DropdownMenuCheckboxItem` per option, with its count right-aligned in tabular figures. Options with a count of 0 are hidden. When anything is selected, a "Clear filter" item follows a separator.
  - **Status option order:** Needs confirming, Reminder awaiting approval, Split out of date, Confirmed, Ready, Reading the text, Could not read this file.
  - **Type options:** the document types present, capitalised as the old select did, in alphabetical order.
- **Filtering:** within one facet, options combine with OR; the facets combine with AND, and also with the search and the folder. The empty state's "Clear search" button also clears both facets (its copy is unchanged).
- **List view at 768 px and up**, `components/ui/table.tsx`:
  - **Columns:** an unlabelled checkbox column (each box keeps `aria-label="Select {title}"`), "Document", "Type", "Added", "Status", and an unlabelled actions column.
  - **Document column:** the title as the row's only link. A starred document gets a `Star` icon before the title with the hidden text "Starred". Below the title, the search excerpt as today when searching.
  - **Status column:** `DocumentStatus`, plus the existing "Try again" for a failed document.
  - **Actions column:** `DocumentRowMenu`.
- **Below 768 px (and in list view):** one stacked row per document, at least 44 px tall: the title link, then "{Type} · {date}", then the status, with the ⋯ menu on the right. Rows are not clickable outside the link and the menu.
- **Grid view** keeps its cards and replaces their four icon buttons with `DocumentRowMenu`.
- **`DocumentRowMenu`**
  - **Props:** `{ doc: Document; onPreview: () => void; onRename: () => void; onToggleFavourite: () => void; onDelete: () => void }`
  - **Trigger:** a ghost icon button, `MoreHorizontal`, `aria-label="Actions for {title}"`.
  - **Items:** "Open" (navigate to the document), "Preview", "Rename", "Star" or "Remove star", a separator, then "Delete" (destructive styling).
  - **Delete** calls today's `handleDelete`, so the row disappears with the "Undo" toast for 5 seconds, unchanged.
  - The old buttons "Favourite", "Preview", "Rename document" and "Delete document" are removed. No test or e2e line uses them.
- **`AppNav.tsx`:**
  - delete `RecentChats`
  - delete the "Search chats" entry from `more`
  - on the desktop rail, the "More" fold becomes a plain group: "Search", "Warranties", "Settings", with no `details` element
  - the phone account menu keeps Search and Warranties, and loses "Search chats"
- **`AskAI.tsx`:** a text link "Recent chats" in the page header, to `/app/chats`. Ask's own behaviour doesn't change in this task.
- **`SearchChats.tsx`:**
  - its `h1` becomes "Recent chats"
  - each conversation row gets a ⋯ menu (`aria-label="Conversation options for {title}"`, the label the rail used) with "Pin conversation" or "Unpin", "Rename" and "Delete"
  - these use the same API calls and the same error toast as the rail did: "Could not update the conversation."
  - the rename field keeps `aria-label="Conversation title"`
- **Tests first:**
  - **`AppNav.test.tsx`:**
    - no "Recent chats" text and no "Conversation options" button in the rail
    - "Search", "Warranties" and "Settings" are reachable on desktop and from the phone account menu
    - the existing navigation cases still pass
  - **`Dashboard.test.tsx` and `Dashboard.filters.test.tsx`**, with the eight-document fixture from the review: two bills (one needs confirming, one has a reminder awaiting approval), a lease, a manual, two warranty cards and two receipts:
    - Needs attention comes before the toolbar in document order
    - exactly one button named "Upload" in `main`, and it's the primary variant
    - Status → "Needs confirming" leaves one row, and the trigger's name ends ", 1 selected"
    - Type → "Bill" leaves two rows
    - both facets together combine with AND
    - "Clear filter" restores all eight
    - each row has one link, its full title
    - the ⋯ menu lists Open, Preview, Rename, Star and Delete, in that order
    - Delete removes the row and shows the "Undo" toast
    - `statusLabel` returns what `DocumentStatus` renders, for each state
  - **`SearchChats.test.tsx`:** pin, rename and delete call their API functions, and a failure shows "Could not update the conversation."
  - **`e2e/redesign-screens.spec.ts`:** at 390 px, `/app/documents` has `scrollWidth === innerWidth`, and each row's title link is at least 44 px tall.
  - **Unchanged:** every existing e2e scenario, including `app.spec.ts:114`.
- [ ] Gates. Commit: `Make Documents a worklist and keep chats on Ask`

### Task R14: Findings left from PRs 30 and 31

Each item is test first, with its own commit.

- **L-1 (PR 30):** a reminder proposal made on Ask leaves Documents stale for up to 30 s.
  - `AskAI.tsx` already invalidates `['document', id]` after a `reminder_proposal` action. It must also invalidate `['document-list-status']`.
  - **Test** (`AskAI.test.tsx`): after a reply whose action is a reminder proposal, `['document-list-status']` is invalidated.
  - Commit: `Refresh the Documents status after a proposal made on Ask`
- **L-2 (PR 30):** after a confirm, the first paint of Documents shows the old status until the reload finishes.
  - In `syncDocumentStatus`, when a document's fingerprint changes, first write the new record into every cached `['document-list-status', …]` entry that already holds that id (`client.setQueriesData`), then invalidate as today.
  - **Test** (`documentStatusSync.test.tsx`): with a list-status entry holding the old record, updating `['document', id]` with a confirmed bill leaves the entry holding the new record, synchronously, before any fetch resolves.
  - Commit: `Show the new status on Documents before the reload finishes`
- **N-1 (PR 30):** the production wiring is untested.
  - **Test** (`queryClient.test.ts`, new): set `['document', 'x']` twice on the exported `queryClient` with different statuses, and expect a `['document-list-status', ['x']]` query to be invalidated.
  - Commit with L-2.
- **N-2 (PR 30):** in `evaluation/redesign/README.md` (the sentence about main's merge run, line 86 on `2048c3f`), replace "which also hit `main`'s own merge run" with "and the same scenario was flaky on `main`'s merge run".
  - Commit with R11's records.
- **"[object Object]" on a rate-limited sign-in:**
  - The server answers 429 with `detail: {code: "RATE_LIMITED", message: "Too many requests."}`, and `loginUser` shows `detail` itself.
  - **Fix in `frontend/src/lib/api.ts`:**
    - `detailMessage` also accepts an object detail: code `RATE_LIMITED` gives "Too many attempts. Wait a minute, then try again."; any other object with a string `message` gives that message; else the fallback
    - `loginUser`, `verify2FA` and `forgotPassword` (the other `JSON.parse(text).detail || …` calls) use `detailMessage` through `safeJson`
  - **Tests:** `Auth.test.tsx`, a 429 on sign-in shows "Too many attempts. Wait a minute, then try again." and never "[object Object]"; plus unit cases for `detailMessage`.
  - Commit: `Explain a rate-limited sign-in instead of showing an object`
- **N1 (PR 31):** `isAppPath` is case-sensitive.
  - Compare `pathname.toLowerCase()`, because React Router matches `/APP/documents` to the app.
  - **Test** (`theme.test.ts`): `isAppPath('/APP/documents')` is true, and `isAppPath('/apple')` stays false.
  - Commit: `Treat app paths the same in any letter case`
- **Left by the owner (C3):** PR 31's N2 (cleanup untested), S1 (suspected one-frame flash, not reproduced) and S2 (the service worker caches `/` and `index.html`). S2 is pre-existing and worth a separate small fix. Record all three in the PR description as left by the owner's decision.

### Acceptance checks added by 0R-4

| # | Check | Verified by |
| --- | --- | --- |
| 9 | At 1366 × 768, the landing's first screen shows the question, "23 November 2026", "line 17", the highlighted due-date line and the header's "Create an account", with no scrolling. At 390 × 844, the answer is on the first screen and nothing scrolls sideways. | `redesign-screens.spec.ts` "landing preview is above the fold" (R12) |
| 10 | The landing has one `h1`, no form controls, a preview whose accessible name gives the question, the answer and the source line, and axe passes in light and dark. | `Landing.test.tsx`; `accessibility.spec.ts` (R12) |
| 11 | On Documents, Needs attention sits above the toolbar, "Upload" is the page's only primary button, and Ask is one click away at every width. | `Dashboard.test.tsx`; `AppNav.test.tsx` (R13) |
| 12 | The Status and Type filters narrow the list with correct counts and clear back to all documents; each row has one link and a ⋯ menu with Open, Preview, Rename, Star and Delete; Delete keeps its Undo. | `Dashboard.filters.test.tsx` (R13) |
| 13 | The rail has no chat history; "Recent chats" on Ask reaches it in one click, where pin, rename and delete still work. | `AppNav.test.tsx`; `SearchChats.test.tsx` (R13) |
| 14 | A proposal made on Ask or a confirm shows on Documents without waiting out the 30 s cache, and the production wiring is tested. | `AskAI.test.tsx`, `documentStatusSync.test.tsx`, `queryClient.test.ts` (R14) |
| 15 | A rate-limited sign-in explains itself; `/APP/…` paths get the app theme. | `Auth.test.tsx`; `theme.test.ts` (R14) |
| 16 | Reminder approval is unchanged: the `BillReminder` tests and the approval e2e pass without edits. | Gates on every task |
