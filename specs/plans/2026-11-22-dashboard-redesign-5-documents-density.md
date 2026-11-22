# Dashboard Redesign, PR 5 of 6: A Dense, Calm Documents List on Mobile

**Status:** approved by the owner on 22 November 2026. Nothing in it is implemented. Shared diagnosis, decisions D1–D7 and global constraints: see `2026-11-22-dashboard-redesign-1-extraction.md`, section "Programme".

**Issue:** `Part of #48`.

**Start condition:** PR 4 has merged (the Overview owns attention and "Check now").

**Goal:** at 390 × 844 the Documents page shows about 9–10 documents instead of 2.5. Filters fit on one row. Attention is one line that links to the filtered list, because the Overview now owns the full list. Desktop keeps its table and inline filters, minus the attention panel.

Frontend only.

## Task 1: Attention becomes one line

**Files:** `frontend/src/pages/Dashboard.tsx`, `Dashboard.test.tsx`.

- Remove the "Needs attention" panel at every width.
- When `overview.attention_count > 0`, show one line under the header: amber dot + "{n} {item|items} need{s|} you" as a button that sets the Status facet to the attention labels present ("Needs confirming", "Reminder awaiting approval", "Split out of date", "Could not read this file") and moves focus to the list's result count; a trailing link "See Overview" goes to `/app`. Hidden at 0.
- **Allowed e2e edits:** `docbot.spec.ts:166` opened the bill from the Documents attention row with "Open bill"; it opens the bill's row in the list instead (its title link), or from the Overview's "Approve reminder". Grep `Needs attention` and `Review and confirm` in `frontend/e2e` and move each to the Overview or the list row.
- [ ] **Tests first:** with two attention items the line reads "2 items need you"; pressing it filters the list to those two; with none, no line.
- [ ] Commit: `Point to the Overview instead of repeating the attention list`

## Task 2: One filter row on phones

**Files:** `Dashboard.tsx`, new `frontend/src/components/DocumentFilterSheet.tsx`, its test.

- Below 768 px the controls are one row, 40 px tall: the search input (`flex-1`, placeholder "Search documents") and a "Filters" button (`SlidersHorizontal` icon + "Filters" + a count badge of active filters). Status, Type, Folders and List options are not shown inline.
- "Filters" opens a bottom sheet built on `components/ui/dialog` (focus trapped, Escape closes, returns focus to the button). Content, top to bottom: **Status** (checkboxes with counts, same options and counts as the desktop facet), **Type** (the seven kinds present, with counts), **Folder** (All Documents, each folder, "New folder"; rename and delete stay in the desktop menu), **Sort** (Date added, Name, Size, Kind; Ascending/Descending), **View** (List, Grid), **File type** (All, PDF, Image). Footer: "Clear all" and a primary "Show {n} documents" that closes the sheet.
- From 768 px the current inline facets stay as they are.
- [ ] **Tests first:** at 390 px the controls occupy one row (all control tops equal); the sheet applies Status and Type the same as the desktop facets; "Show {n} documents" reflects the filtered count; Escape returns focus to "Filters".
- [ ] Commit: `Fit the phone's search and filters on one row`

## Task 3: Two-line rows and select mode

**Files:** `Dashboard.tsx`, `Dashboard.test.tsx`.

- Below 768 px each list row is two lines, about 56 px with `py-2`:
  - Line 1: star (if starred) and the title, truncated, `text-[15px] font-medium`.
  - Line 2, `text-[13px] text-muted-foreground`: "{kind}" then " · " then the row's fact:
    - a status in the attention or danger tone: a 6 px dot in that tone and the status label ("Needs confirming", "Could not read this file", "Reading the text")
    - otherwise a bill with facts: "€{amount} due {d MMM}" from `statuses[id].bill`
    - otherwise the date added ("21 Nov")
  - "Try again" for failed rows stays, inline at the end of line 2.
  - The title link covers both lines (the row's tap target is at least 44 px; `redesign-screens.spec.ts` checks every title link is at least 44 px tall and keeps passing).
  - The row menu (`…`) stays at the right, vertically centred.
- **Select mode:** checkboxes are hidden on phones until "Select" (a text button in the header, next to "Upload") is pressed; then each row shows its checkbox, the header shows "{n} selected", "Delete selected" and "Done". Desktop keeps the always-visible checkbox column.
- Grid view on phones is unchanged.
- [ ] **Tests first:** at 390 × 844 with twelve documents, at least nine rows have their top inside the viewport below the header (measure in a new `e2e/documents-density.spec.ts` with the redesign seed); no sideways scroll at 390 and 320 px; checkboxes appear only in select mode on phones; a bill row reads "Bill · €45.00 due 20 Nov".
- [ ] Commit: `Show two-line document rows and select on demand on phones`

## Task 4: Screenshots, record, review and PR

- [ ] Headless Playwright script saves `after-empty-documents-1366.png`, `after-empty-documents-390.png`, `after-populated-documents-1366.png`, `after-populated-documents-390.png` to the untracked `C:\DocVault\evaluation\dashboard-redesign\`. Not committed. Show them to the owner before the PR opens.
- [ ] Gates: frontend `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`; Playwright full suite on a disposable stack.
- [ ] Reviewer: `reviewer`.
- [ ] PR `feature/dashboard-redesign-5-documents-density`, `Part of #48`.

## Acceptance checks

| # | Check | Verified by |
| --- | --- | --- |
| 1 | At 390 × 844 at least nine document rows are visible with twelve documents | `documents-density.spec.ts` |
| 2 | Phone search and filters fit on one row; the sheet filters exactly like the desktop facets | Task 2 tests |
| 3 | Attention is one line linking to the filtered list and the Overview | Task 1 tests |
| 4 | Title links stay at least 44 px tall; no sideways scroll at 390 and 320 px; axe clean | `redesign-screens.spec.ts`; `documents-density.spec.ts` |
| 5 | Desktop table, folders, rename, delete and undo unchanged | `Dashboard.test.tsx`; `DocumentDeleteList.test.tsx` |
| 6 | Kept copy ("Upload") unchanged | Reviewer |
