# MVP technical design

**Design draft, 10 November 2026.** The revised 6 November proposal and feasibility study define the project scope. The first epic is for one household document owner to take an electricity bill from upload to reviewed facts, an exact split among four housemates and one approved internal reminder. Demo 1 demonstrates the review step. The end-to-end proof of concept is targeted for 18 December 2026.

Use the [ticket index](Tickets.md) for delivery order and the [repository snapshot](Repo_Current_State.md) for verified behaviour and limits.

## What the owner can ask

| Example request | Intended behaviour | Current evidence |
| --- | --- | --- |
| “How much is this bill, and when is it due?” | Identify the owner's bill and return the facts with source passages. Ask which bill if several match. | The detail screen shows read-only candidates and OCR lines. The conversational answer needs validation. |
| “Split it equally between the four of us.” | Resolve the confirmed bill and ordered housemate labels, then call the calculator. | The split API and panel are implemented on a branch. The assistant tool is planned. |
| “Remind me two days before it's due.” | Calculate the proposed reminder date, show the exact change and request approval before saving. | Planned. |
| “Draft a question about this charge.” | Compose editable enquiry text using the charge and its evidence. The owner decides what to do with the draft. | Planned. |

Personalisation comes from the authenticated owner's documents, reviewed facts and choices in the conversation. If a request is unsupported, explain the boundary and offer a supported next step. Payments, external sending and autonomous browsing are outside the agreed workflow.

## Architecture and evidence flow

React uploads the PDF or image to FastAPI. The API stores the original in private S3-compatible storage and queues processing in Redis. The ARQ worker runs local Tesseract OCR and stores the transcript in PostgreSQL. Opening the owner-scoped document detail derives candidates for the amount, billing period and due date. Each candidate retains its labelled source line, including conflicting lines when found. A signed preview lets the owner compare the original file. This read-only review is implemented on the Demo 1 branch. [Rehearsal and evidence](../evaluation/demo-1/README.md)

Owner confirmation is implemented in [PR #13](https://github.com/haydenteh5526/DocVault/pull/13). Confirming appends a `bill_revisions` row with the amount in integer cents, the due date, the billing-period endpoints and a snapshot of the reviewed evidence; earlier revisions are never changed. Each save is bound to the evidence and revision number the owner had when editing started. The server checks both under a row lock on the document and otherwise answers 409 with a reason code and saves nothing. The client then reloads the document before the owner tries again, and an unsaved correction survives switching tabs. Its API, component and browser tests pass in CI, and an API test shows a save waiting for an uncommitted transcript edit.

The equal split is implemented on the `feature/bill-split` branch. The owner's housemate labels live in a `housemates` table, and a split names them by id, so the server only splits among labels it finds in the caller's account. A preview writes nothing. A save appends a `bill_splits` row holding the confirmed revision it used, the rule, the total and a snapshot of the labels and cents. It is bound to the revision number, the latest split number and the shares the owner reviewed, checked under the same document row lock, and otherwise answers 409 with a reason code and saves nothing. A split from an older revision is returned as stale, with its own amount and revision, and is never recalculated. In the browser, cached data is dropped when the account changes and the service worker stores no API responses. Four housemates is the acceptance case, and the calculator and API accept 2 to 12.

## Design for the next increments

| Story | Data and responsibilities | Acceptance evidence |
| --- | --- | --- |
| [#1 · Confirm bill facts](https://github.com/haydenteh5526/DocVault/issues/1) | Keep OCR evidence separate from owner corrections. On explicit confirmation, FastAPI validates ownership and saves a revision with EUR cents, billing-period endpoints, due date, document reference and a snapshot of the reviewed evidence. Later edits produce a new revision. | Reopen a correction with its source. Reject another owner's access. An unclear date requires a decision. |
| [#2 · Allocate shares](https://github.com/haydenteh5526/DocVault/issues/2) | A pure server calculator accepts a confirmed revision and an ordered list of labels. For the first equal split, divide integer cents by the number of labels and give one extra cent to each of the first remainder labels. The UI shows the rule and total. | €123.47 splits into €30.87, €30.87, €30.87 and €30.86. Test exact division, empty labels and a changed bill revision. |
| [#3 · Approve a reminder](https://github.com/haydenteh5526/DocVault/issues/3) | Store an owner-scoped pending proposal containing the bill revision and exact reminder details. Approval identifies that proposal. In one transaction, verify it is pending, still current and owned by the caller, save the reminder and record the outcome. Enforce uniqueness on the proposal-to-reminder link. | Cancellation or stale inputs produce no reminder. Concurrent or repeated approval returns the same saved outcome. Verify history and failed ownership checks. |
| [#5 · Ask in natural language](https://github.com/haydenteh5526/DocVault/issues/5) | The model may select a retrieval, calculation, enquiry-draft or reminder-proposal tool. FastAPI supplies the authenticated identity and validates typed arguments. Approval is a separate owner interaction. OCR text and retrieved passages are evidence only. | Exercise paraphrases, ambiguous requests, unsupported tools, a malicious instruction in a bill and an unanswerable question. Record model, configuration, citations and outcomes. |

The proposed reminder states are **pending**, **cancelled**, **stale** and **saved**. A change to the confirmed bill revision or reminder details requires a new proposal and fresh approval. A retry of an already saved proposal returns its recorded reminder. Housemate labels exist within the owner's account.

## Constraints on planned writes

- The server derives identity from the session and checks ownership of the source document, confirmed revision, proposal and saved record. The model may suggest tool arguments. The server validates them against the owner's records and available operations.
- Preserve the original OCR evidence and record corrections as a new confirmed revision. Missing or conflicting candidates require inspection and explicit confirmation before downstream work can use them.
- Store amounts and calculate contributions in integer cents. The four contributions must sum to the confirmed total. The order of the labels used for remainder cents must be visible in the split.
- Approval binds the owner to one proposal and one confirmed bill revision. Cancellation, an ownership failure or a changed revision leaves the reminder unsaved. Record the outcome alongside the proposed and approved details.

## Delivery and evaluation

- **Week of 9 November.** Demonstrate the synthetic bill and explain the architecture, source evidence and read-only review limit.
- **By 18 December.** Exercise the four stories together. Verify local answer generation and tool selection on existing hardware with €0 planned additional spend. Record OCR/field errors and cases requiring clarification. Decide separately whether permitted, comparable historical bills support the optional forecasting experiment.
- **Ahead of Demo 2.** Test worker failure after queue acceptance, permission boundaries, retry safety and stale approvals. Prepare the comparison with document Q&A plus manual follow-up. Cloud validation depends on suitable access and agreed funding. Keep the measured protocol and anonymised results in the [evaluation workspace](../evaluation/README.md).
