# Website redesign: screens before and after

This folder holds the screenshots that compare the web app before and after the redesign in
[`specs/plans/2026-11-18-website-redesign.md`](../../specs/plans/2026-11-18-website-redesign.md).
Every document, name, amount and date in them is synthetic.

## What is here

| Folder | What it shows | Recorded |
| --- | --- | --- |
| `before/` | The app on `main` at `9939121`, before any redesign change | Task R0 |
| `after/` | The same screens after the redesign | Task R11 (PR 2) |

Files are named `<screen>-<width>-<theme>.png`, for example `documents-390-dark.png`.
Widths are 1366 and 390 pixels. Themes are `light` and `dark`.

## The screens

| Screen | Route | State |
| --- | --- | --- |
| `landing` | `/` | Signed out |
| `login` | `/login` | Signed out, email step |
| `documents-empty` | `/app/documents` | Signed in, no documents yet |
| `home` | `/app` | Signed in, twelve documents, the bill read but not confirmed |
| `documents` | `/app/documents` | The same account |
| `documents-search` | `/app/documents?q=october` | The search "october" |
| `documents-no-match` | `/app/documents?q=octber` | A search that matches nothing |
| `bill-unconfirmed` | `/app/documents/<October bill>` | The bill review before confirming |
| `bill-confirmed` | the same | Confirmed as revision 1 |
| `reminder-proposal` | the same | Split saved, reminder proposed and waiting for approval |
| `upload-mid` | `/app/upload` | One file chosen, its upload held in flight |

Before the redesign, the Documents page has no search field, so `documents-search` and
`documents-no-match` show the same list as `documents`. They are recorded anyway so that the
after set compares like with like.

## How they were recorded

The spec is [`frontend/e2e/redesign-screens.spec.ts`](../../frontend/e2e/redesign-screens.spec.ts). It is
skipped unless `E2E_SCREENSHOTS=1`. It needs a disposable stack and a verified synthetic account,
and it clears that account's documents and housemates first.

```powershell
cd frontend
$env:E2E_BASE_URL = 'http://localhost:3300'
$env:E2E_EMAIL = 'e2e-verified@example.com'
$env:E2E_PASSWORD = '<the disposable account password>'
$env:E2E_SCREENSHOTS = '1'
$env:E2E_SCREENSHOT_SET = 'before'   # or 'after'
npx playwright test redesign-screens --retries=0
```

The twelve documents are defined in
[`frontend/e2e/fixtures/redesign/documents.ts`](../../frontend/e2e/fixtures/redesign/documents.ts).
The spec draws each one as an image of its text and uploads it, so OCR reads it the way it reads the
bill in `app.spec.ts`. Their titles in the list end in `.png` because the title comes from the file name.

## Run record: before set

- Commit: `9939121` plus the R0 spec and fixtures.
- Stack: a disposable Compose project (`rdsn1`) on ports 3300 (web), 8300 (API), 9300 (storage) and
  8325 (mail). The `dvdemo` project was not touched.
- Result: one test passed, 44 screenshots (11 screens, 2 widths, 2 themes).

## Identity, landing and Documents verification

On 19 November 2026 the first redesign branch ran the gates at `dbdcf0f`. Windows Node 24.11.1 ran npm ci, TypeScript, ESLint, 228 Vitest tests and the production build. Chromium ran all 14 ordinary scenarios on the disposable `rdsn1` stack, using ports 3300, 8300, 8325 and 9300. The nine app scenarios covered OCR, evidence, equal splits, two accounts and the exact reminder approval. The other five covered accessibility, sign-in and account recovery.

The first local inbox scenario failed because verification links used port 3000. Setting the disposable API's `FRONTEND_URL` to port 3300 and rerunning all five accessibility and recovery scenarios passed. At 390 and 1366 pixels, Chromium measured the landing page's scroll width equal to the viewport and the hero's account link inside the first screen.

## PR 1 verification

On 19 November 2026, at the head of branch `feature/website-redesign-pr1`:

- **Frontend gates** (Windows, Node 24.11.1): `npm ci`, `npx tsc -b`, `npm run lint`, `npm test` (31 files, 228 tests) and `npm run build` all passed.
- **Browser suite** (Chromium, disposable `rdsn1` stack on ports 3300, 8300, 8325 and 9300; `dvdemo` untouched): all 14 ordinary scenarios passed with `--workers=1 --retries=0`, run per spec file (`app` 9, `accessibility` 3, `password-reset` 2). The screenshot spec was skipped, as intended.
- **Rate limit, not a defect:** the API allows 10 sign-ins a minute per address. Running all specs together with four workers exceeds it, so scenarios failed on a 429 and passed on retry in three full-suite runs. The per-file run above waited a minute between files.
- **Not run in PR 1:** the "after" screenshots (Task R11, PR 2) and the backend gates, because nothing under `backend/` changed.

## PR 1 verification at the review fixes

On 19 November 2026, at `184f5e3` plus this note: `npx tsc -b`, `npm run lint`, `npm test` (35 files, 264 tests) and `npm run build` passed. All 14 ordinary Playwright scenarios passed with `--workers=1 --retries=0` on a disposable stack (ports 3400, 8400, 8425, 9400), run per spec file a minute apart. At 360 px the landing page measured the same width as the viewport, the header showed the glyph with the name "DocVault" and both account links at `h-9` height, and the headline computed to Archivo with the face loaded. The `dvdemo` stack was not touched.

## PR 1 verification at the merge with main and the final fixes

On 19 November 2026, at `bf25273` (the merge of `main` with PR 29, then the fixes for the final review): `npx tsc -b`, `npm run lint`, `npm test` (36 files, 278 tests) and `npm run build` passed. All 15 ordinary Playwright scenarios, including PR 29's split-by-days one, passed with `--workers=1 --retries=0` on a disposable stack (ports 3400, 8400, 8425, 9400), run per spec file a minute apart. A separate browser check on that stack confirmed a bill and went straight back to Documents: the row read "Confirmed · revision 1" and the bill was no longer under Needs attention. The `dvdemo` stack was not touched. The hosted e2e check on the merge head `da42d06` failed on a 429 from the sign-in rate limit, which also hit `main`'s own merge run.
