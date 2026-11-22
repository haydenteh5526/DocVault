# Dashboard Redesign, PR 2 of 6: One Server Answer for Attention, Coming Up and Document Status

**Status:** approved by the owner on 22 November 2026. Nothing in it is implemented. Shared diagnosis, decisions D1–D7 and global constraints: see `2026-11-22-dashboard-redesign-1-extraction.md`, section "Programme".

**Issue:** `Part of #<n>` (the series issue).

**Start condition:** PR 1 has merged (this PR relies on the seven kinds in `document_type`).

**Goal:** `GET /api/v1/overview` is the single source of truth for what needs the owner, what is coming up in the next 60 days, recent documents, counts and each document's status. Bill review covers any utility bill (D2). Insurance renewals and contract ends are read with their source line (D4). Text is scanned only for kinds that can carry dates (adjustment 2). No migration.

Backend only.

## Task 1: Bill review for every utility bill (D2)

**Files:** `backend/app/services/bill_review.py`, `backend/tests/test_bill_review.py`, `specs/MVP_Technical_Design.md` (one sentence on the widened scope).

- Replace the `electricity` requirement: return a review when the text matches `\b(?:bill|invoice|statement)\b` **and** at least one line matches `_AMOUNT_LABEL` or `_DATE_LABEL`. Labels, parsing and the review shape are unchanged.
- [ ] **Tests first:** broadband (`Total amount due: EUR 45.00`, `Payment due date: 20 November 2026`) and water bills return reviews with those values and source lines; the October electricity bill is unchanged; the kettle receipt, car insurance renewal and tenancy agreement return `None`. Every existing `test_bill_review.py` and `test_bill_revisions.py` test passes unedited.
- [ ] Commit: `Review any utility bill, not only electricity`

## Task 2: Renewal and term-end dates with their source line (D4)

**Files:** new `backend/app/services/key_dates.py`, new `backend/tests/test_key_dates.py`.

```python
@dataclass(frozen=True)
class DatedLine:
    kind: Literal["renewal", "contract_end"]
    date: date
    line: int          # 1-based line number in raw_text
    text: str          # the source line, stripped

def extract_key_dates(text: str | None, kind: str | None) -> list[DatedLine]: ...
```

- `Insurance` (or unclassified): lines starting `Renewal date|Renews on|Policy renewal|Renewal due|Expiry date|Policy end date|Cover ends|Valid until`, then optional `:`, then a date in the formats `bill_review._date` reads → `renewal`.
- `Contract` (or unclassified): `Term: <date> to <date>` → the end date; `End date|Tenancy ends|Agreement ends: <date>` → `contract_end`.
- Conflicting dates for the same kind → none (the owner reads the document), mirroring `bill_review._field`.
- Only the first 20 000 characters are scanned.
- [ ] **Tests first:** car insurance renewal → `renewal` 2027-01-15 with line text `Renewal date: 15 January 2027`; tenancy `Term: 1 September 2026 to 31 August 2027` → `contract_end` 2027-08-31; a manual mentioning "valid until stock lasts" → none; two different renewal dates → none.
- [ ] Commit: `Read renewal and term-end dates with the line they came from`

## Task 3: The scanning scope, shared by Overview and the bill page (adjustment 2)

**Files:** `backend/app/services/key_dates.py`, `backend/app/routers/documents.py`, tests.

- `SCANNED_KINDS = frozenset({"Bill", "Insurance", "Contract"})` and `def scans_text(document_type: str | None) -> bool`: `True` when the type is in `SCANNED_KINDS`, empty, or not one of `categorisation_service.KINDS` (unclassified or legacy free text). `Manual`, `Receipt`, `Warranty` and `Other` are never scanned.
- `get_document` computes `bill_review` only when `scans_text(doc.document_type)`, so the bill page and the Overview cannot disagree about whether a document is a bill to confirm.
- [ ] **Tests first:** a `Manual` whose text happens to contain "statement" and "Total amount due" has no `bill_review` on `GET /documents/{id}` and no Overview item; the same text typed `Bill` has both.
- [ ] Commit: `Scan text for dates only on bills, policies, contracts and unclassified documents`

## Task 4: `GET /api/v1/overview`

**Files:** new `backend/app/schemas/overview.py`, new `backend/app/services/overview.py`, new `backend/app/routers/overview.py`, `backend/app/main.py` (`include_router(overview.router, prefix="/api/v1/overview", tags=["overview"])`), new `backend/tests/test_overview.py`, `backend/tests/test_data_isolation.py`.

### Schema

```python
AttentionKind = Literal["reminder_pending", "bill_unconfirmed", "split_stale", "processing_failed", "warranty_ending"]
UpcomingKind  = Literal["bill_due", "renewal", "contract_end", "warranty_end"]
StatusTone    = Literal["neutral", "attention", "danger"]

class SourceLine(BaseModel):  line: int; text: str

class AttentionItem(BaseModel):
    kind: AttentionKind
    document_id: uuid.UUID
    title: str
    date: date | None = None          # due date, remind-on date or warranty end
    amount_due: str | None = None     # "45.00"
    proposal_id: uuid.UUID | None = None

class UpcomingItem(BaseModel):
    kind: UpcomingKind
    document_id: uuid.UUID
    title: str
    date: date
    amount_due: str | None = None
    confirmed: bool                   # True for confirmed bills and saved warranties
    source: SourceLine | None = None  # for dates read from the text

class BillFacts(BaseModel):  amount_due: str | None; due_date: date | None; confirmed: bool

class DocumentStatus(BaseModel):
    label: str        # exactly the strings DocumentStatus.tsx uses today
    tone: StatusTone
    bill: BillFacts | None = None

class RecentDocument(BaseModel):
    id: uuid.UUID; title: str; kind: str | None; processing_status: str; created_at: datetime

class OverviewOut(BaseModel):
    attention: list[AttentionItem]
    attention_count: int
    upcoming: list[UpcomingItem]                  # today .. today+60, soonest first
    next_after_window: UpcomingItem | None        # the first date after the window, for the calm state
    recent: list[RecentDocument]                  # newest 5
    counts: dict[str, int]                        # {"total": n, "Bill": n, ...} — kinds with n > 0
    statuses: dict[uuid.UUID, DocumentStatus]     # every document of the owner
    processing: int                               # documents pending or processing
```

### Rules (`build_overview(db, user_id, today) -> OverviewOut`, `today` in `Europe/Dublin`)

- Query 1 loads every owner document **without** `raw_text` (`load_only(id, title, document_type, processing_status, created_at)`). Query 2 loads `raw_text` only for complete documents where `scans_text(document_type)`. Confirmed revisions, splits and proposals are read only for documents that have a review or a revision.
- **Attention**, in this order (then by date, then title):
  1. `reminder_pending`: a proposal `status == "pending"` and `not inputs_changed` (reuse `list_proposals`). `date` = remind-on, `amount_due` from the proposal.
  2. `bill_unconfirmed`: a bill review exists and no confirmed revision. `date` = the review's due date if read.
  3. `split_stale`: the latest split is `stale`.
  4. `processing_failed`.
  5. `warranty_ending`: a saved warranty ending today to today+30.
- **Upcoming** (today to today+60): `bill_due` from the latest confirmed revision (`confirmed=True`), otherwise from an unconfirmed review's due date (`confirmed=False`, `source` = its first due-date line); `renewal` and `contract_end` from `extract_key_dates` (`confirmed=False`, with `source`); `warranty_end` from saved warranties (`confirmed=True`). Past dates are excluded.
- **Statuses**: the same precedence as `frontend/src/components/DocumentStatus.tsx` today — "Could not read this file" (danger), "Reading the text", "Reminder awaiting approval", "Split out of date", "Needs confirming" (attention), "Confirmed · revision {n}", "Ready" (neutral). `bill` is set for documents with a review or revision.
- `attention_count == len(attention)`.
- Route: `GET ""` → `OverviewOut`, `Depends(get_current_user_id)`, no rate limit (read-only).

### Tests (write first)

- [ ] **The live-run scenario:** electricity bill (review, unconfirmed), laptop receipt (warranty ending in 700 days), insurance renewal (renewal in 40 days), broadband bill (review, unconfirmed, due in 5 days). Expect `attention` = two `bill_unconfirmed`; `upcoming` = broadband `bill_due` (unconfirmed, with source line) and the renewal (with source line); the electricity bill's due date if inside the window; `statuses` of both bills = "Needs confirming".
- [ ] A confirmed bill with a pending proposal → one `reminder_pending`, not also `bill_unconfirmed`; its upcoming `bill_due` is `confirmed=True` with the revision's amount.
- [ ] A stale split → `split_stale`; a failed upload → `processing_failed` and status "Could not read this file".
- [ ] **Scope (adjustment 2):** with 150 `Manual` documents of 200 KB text and 3 bills, `extract_bill_review` and `extract_key_dates` are called exactly 3 times (patched spies), and query 2 selects no `Manual` rows.
- [ ] **Calm:** documents exist, nothing to do, the only date is 90 days away → `attention == []`, `upcoming == []`, `next_after_window` is that date.
- [ ] **Ownership:** account B's overview contains none of account A's documents, statuses or counts (`test_data_isolation.py`).
- [ ] Commits: `Describe the overview in one schema`, `Build the overview from one pass over the owner's documents`, `Serve the overview to the signed-in owner`

## Task 5: Record, review and PR

- [ ] Gates: backend Ruff + pytest with coverage and the migration round trip (unchanged, as a regression check). Frontend gates as a regression check (no frontend change).
- [ ] Manual check on a disposable stack: the four live-run documents, `curl` the overview with a disposable account token (never printed into the record), and record the attention and upcoming items in `Repo_Current_State.md`.
- [ ] Reviewer: **`reviewer-deep`** (new owner-scoped aggregate over bills, proposals and splits).
- [ ] PR `feature/dashboard-redesign-2-attention-api`, `Part of #<n>`.

## Acceptance checks

| # | Check | Verified by |
| --- | --- | --- |
| 1 | The broadband bill gets a bill review and appears as "Needs confirming" | `test_bill_review.py`; `test_overview.py` |
| 2 | Insurance renewals and contract ends appear in `upcoming` with their source line | `test_key_dates.py`; `test_overview.py` |
| 3 | One endpoint returns attention, upcoming, recent, counts and every status; `attention_count` equals the list length | `test_overview.py` |
| 4 | `Manual`, `Receipt`, `Warranty` and `Other` documents are never text-scanned, and their `raw_text` is never loaded by the overview | scope test |
| 5 | The bill page and the overview agree on which documents are bills to confirm | Task 3 test |
| 6 | Another account sees nothing | `test_data_isolation.py` |
| 7 | No approval path, migration or dependency change | Reviewer; gates |
