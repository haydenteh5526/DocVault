# Dashboard Redesign, PR 6 of 6: No Duplicate Files in the Upload Queue

**Status:** approved by the owner on 22 November 2026 (D6: queue-level dedupe only). Nothing in it is implemented. Shared diagnosis, decisions D1–D7 and global constraints: see `2026-11-22-dashboard-redesign-1-extraction.md`, section "Programme".

**Issue:** `Part of #48`.

**Start condition:** none. This PR is independent of PRs 1–5 and may be built in parallel with any of them (it touches only `Upload.tsx` and a new test).

**Goal:** choosing or dropping the same files twice queues them once and says so. Selecting the 4 live-run files twice gives 4 rows, not 8.

Frontend only. Vault-level duplicate detection (the same file uploaded on another day) is out of scope; it needs a content hash and a migration, and gets its own plan later.

## Task 1: Dedupe on choose and drop

**Files:** `frontend/src/pages/Upload.tsx`, new `frontend/src/pages/Upload.test.tsx`.

- `const fileKey = (f: File) => f.name + '|' + f.size + '|' + f.lastModified`.
- In `choose(files)`, after the type filter:
  - drop files whose key is already in the queue (any status: pending, uploading, done or error)
  - drop repeats inside the same selection (keep the first)
  - add the rest.
- Messages (toast, `info` tone):
  - one skipped: "{name} is already in the queue."
  - several skipped: "{n} files are already in the queue."
  - The unsupported-type toast "Only images and PDFs are supported" is unchanged and is shown only when no supported file was chosen at all (current behaviour).
- "Clear all" and "Upload More" empty the queue, so the same file can be queued again afterwards (that is a vault duplicate, out of scope).
- [ ] **Tests first:** choosing the same 4 files twice leaves 4 rows and toasts "4 files are already in the queue."; choosing one file twice toasts "{name} is already in the queue."; a selection containing the same file twice queues it once; a file with the same name but a different size is queued; after "Upload More" the same file can be queued again; the upload of the 4 files sends exactly 4 `POST /documents` requests.
- [ ] Commit: `Queue each chosen file once`

## Task 2: Record, review and PR

- [ ] Gates: frontend `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`; Playwright `app.spec.ts` (upload scenarios) on a disposable stack.
- [ ] Reviewer: `reviewer`.
- [ ] PR `feature/dashboard-redesign-6-upload-dedupe`, `Part of #48`.

## Acceptance checks

| # | Check | Verified by |
| --- | --- | --- |
| 1 | The same files chosen twice are queued once, with the exact message | `Upload.test.tsx` |
| 2 | Different files with the same name are still queued | `Upload.test.tsx` |
| 3 | Upload copy ("Upload Documents", "Upload Complete!", "Upload") unchanged | Reviewer; `app.spec.ts` |
