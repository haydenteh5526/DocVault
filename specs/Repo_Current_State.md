# Repository current state

**Snapshot, 10 November 2026.** The assessed checkout is DocVault. [PR #7](https://github.com/haydenteh5526/DocVault/pull/7) records the Demo 1 increment. The earlier prototype's development history is in [DocVault-old](https://github.com/haydenteh5526/DocVault-old).

## Demo 1 capability

Register or reset a disposable account with the local Mailpit inbox. Upload the [synthetic electricity bill](../evaluation/demo-1/synthetic-electricity-bill.pdf), wait for local OCR, and open **Summary → Bill review**. Compare the **€123.47** amount due, **23 November 2026** due date and **1–31 October 2026** billing period with their exact transcript lines and the original PDF. The rehearsal recorded an identical byte-for-byte preview. [Demo script and raw checks](../evaluation/demo-1/README.md)

The bill review screen displays read-only candidates. With [PR #13](https://github.com/haydenteh5526/DocVault/pull/13), the owner can correct the amount, due date and billing period, compare them with the OCR candidates and explicitly confirm them. Each confirmation appends a revision with integer cents and a snapshot of the reviewed evidence, and the confirmed values and evidence reopen even when the transcript no longer produces candidates. A save is rejected with nothing written if the evidence or revision changed while the owner was reviewing. Household contributions, internal reminder approval and natural-language tool selection are the next increments. [Design](MVP_Technical_Design.md) · [Tickets](Tickets.md)

## Runtime

The web client uses React and Vite. FastAPI manages account and document access. The Docker stack uses PostgreSQL with pgvector, Redis and ARQ, RustFS as the S3-compatible store for private files, Tesseract for local OCR, Ollama for local embeddings and Mailpit for local account email. Expo is a companion client. See the [README](../README.md#quick-start) for setup, the [technical design](MVP_Technical_Design.md#architecture-and-evidence-flow) for the evidence flow and [verification guide](../AGENTS.md#verification) for test commands.

The assessed demo uses the existing hardware and local stack with **€0 planned additional spend**. Local Compose and browser CI both use `rustfs/rustfs:1.0.4` as the S3-compatible store. It replaced MinIO after the CI runner could not pull `minio/minio:latest` on 9 November. The 7 November rehearsal used the earlier MinIO image. Files in an existing local `miniodata` volume are not carried over.

## Verified results

| Evidence | Result |
| --- | --- |
| [Local rehearsal, 7 November](../evaluation/demo-1/README.md) | 177 backend tests at 73.68% coverage, 25 frontend tests and 11 browser scenarios, including local email recovery. PDF and image OCR checks used synthetic bills. |
| [Hosted CI, 9 November](https://github.com/haydenteh5526/DocVault/actions/runs/42648930881) on `6455381` | Backend, frontend, mobile and e2e passed. Backend ran 177 tests and the migration round trip. Expo Doctor passed 21 checks. Playwright ran 10 scenarios and skipped the local inbox scenario. |
| Local gates, 11 November, on `f3c5d70` ([PR #13](https://github.com/haydenteh5526/DocVault/pull/13)) | Backend: Ruff clean and 199 tests passed (21 new for confirmed bill revisions) at 74.16% coverage against a disposable `pgvector/pgvector:pg16` database. The migration round trip (head, 013, head, base, head) passed on a fresh database. Frontend: type check, lint, 39 Vitest tests (12 for the bill panel, 2 for refetch after save) and build passed. The Playwright scenario and the manual two-tab check were not run locally because no local stack or verified synthetic account was available. |
| [Hosted CI, 12 November](https://github.com/haydenteh5526/DocVault/actions/runs/43123629020) on `52530d9` ([PR #13](https://github.com/haydenteh5526/DocVault/pull/13)) | Backend, frontend, mobile and e2e passed. Playwright ran 10 scenarios, including the extended bill scenario (confirm a corrected amount, reload, and see revision 1, €125.00, the correction and three evidence lines), and skipped the local inbox scenario. |
| Local gates after review fixes, 12 November, on `4184ec8` ([PR #13](https://github.com/haydenteh5526/DocVault/pull/13)) | Backend: Ruff clean and 201 tests passed at 74.16% coverage against a disposable `pgvector/pgvector:pg16` database, including a test that a save waits for an uncommitted transcript edit and then returns `transcript_changed` (it fails when the row lock is removed). Frontend: type check, lint, 45 Vitest tests and build passed. The Playwright scenario, now also switching tabs mid-edit, was not run locally. |
| [Local model feasibility, 12 November](../evaluation/results/2026-11-12/RUN.md) | `qwen3:8b` on the project laptop (100% GPU, Q4_K_M, 3 runs of 18 synthetic cases): tool selection 87.5%, answers 85.7%, no unsafe outcomes or invented facts, median latency 682 ms. Verdict not feasible at the 90% threshold. It called `split_bill` with invented names instead of asking. Stub tools only, no app integration, no other model run. |

## Remaining evidence and limits

- The synthetic examples establish the demo behaviour. Field accuracy on varied bills, cross-owner access for new records and safe approval retries still need evaluation. Local model task selection was measured for `qwen3:8b` only and did not meet the threshold. Other local models are untested, and no local model is integrated. Confirmed bill revisions still need the manual check with the synthetic PDF, including the two-tab conflict. [Evaluation workspace](../evaluation/README.md)
- The mobile check covers types and Expo configuration. The lockfile update to `shell-quote` 1.12.0 cleared the critical advisory. The 10 November production dependency audit reported four moderate findings. Physical-device and push delivery verification remain open.
- Terraform defines an AWS environment. Live infrastructure and deployment remain unverified. The local proof of concept takes priority. [Infrastructure notes](../terraform/COST_REVIEW.md)

The original requirements, design, work breakdown and September evidence are available in the [prototype snapshot](https://github.com/haydenteh5526/DocVault/tree/6031e7242fcfcaa1b67b48ba2742c152113c9138/docs/archive/prototype).
