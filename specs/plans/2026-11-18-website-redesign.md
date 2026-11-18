# Website Redesign: a Document-First Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Also load the `frontend-design`, `ui-ux-pro-max` and `modern-web-design` skills before Task R1.

**Status:** proposed on 18 November 2026. The same day, the owner asked for a shadcn/ui look, and Section 3R replaces the first identity (Sections 3 and 7). The plan is waiting for the owner's approval of the decisions below. Nothing in it is implemented. No GitHub issue exists yet (Decision D6).

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

## 2. Two landing directions (Taste Skill)

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
| `/` | `Landing.tsx` | Direction A, exact copy from Section 2. Remove the Samsung manual, the Tech Stack and FAQ sections and the "Final Year Project" pill (the fact moves to the footer line). |
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

1. **D1. Landing direction.** *Recommended:* A, "The check". Alternative: B, "The question".
2. **D2. Signed-in home.** *Recommended:* `/app` opens Documents with Needs attention; Ask stays in the navigation. Six browser-test assertions expect the heading "Ask anything about your documents" right after sign-in, and they change to expect the heading "Documents". This is the only test change outside new tests. Alternative: keep Ask as the home; the rest of the plan is unchanged.
3. **D3. Typeface.** *Recommended (Section 3R):* Geist for everything, loaded from Google Fonts exactly as Inter is today (no new dependency, €0). The Section 3 pairing of Public Sans and Source Serif 4 is withdrawn.
4. **D4. Themes.** *Recommended:* follow the system setting, with a manual override in Settings (today's `lib/theme.ts` behaviour). The rail is no longer forced dark.
5. **D5. Remove `canvas-confetti`.** *Recommended:* yes; it is used only for the upload celebration that Section 5 replaces.
6. **D6. A GitHub issue and two pull requests.** *Recommended:* I open an issue, "Redesign the website around finding, checking and deciding", with the acceptance checks at the end of this plan.
   - PR 1 (Tasks R0 to R8 and R10) starts after Demo 1 (from 21 November 2026) and can run alongside issue #5 Phase 2. It avoids `AskAI.tsx` and `AssistantAction.tsx`.
   - PR 2 (Task R9 and the final screenshots) starts after issue #5 Phase 2 merges.
   - Nothing merges before 21 November.
7. **D7. Impeccable.** It is not installed, because its hooks download and run a binary at every session start, after every file edit and at every turn end, in all your sessions. *Recommended:* leave it uninstalled; this plan used its critique method without the detector. If you want it, install it yourself with `claude plugin install impeccable@impeccable`, knowing the hooks will run.

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

- **Files:** `pages/Landing.tsx`, `components/Navbar.tsx`, `components/Footer.tsx`; create `pages/Landing.test.tsx`.
- [ ] Failing tests:
  - The heading reads "Know what your bills say before you act on them."
  - A link "Create an account" goes to `/register`, and a link "Sign in" goes to `/login`.
  - The hero shows the three quoted lines ("Total amount due: EUR 123.47", "Payment due date: 23 November 2026", "Billing period: 1 October 2026 to 31 October 2026") and their values (€123.47, 23 Nov 2026, 1–31 Oct 2026).
  - No text contains "Samsung".
- [ ] Implement Section 2 Direction A, with the exact copy (or Direction B if D1 picks it).
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
