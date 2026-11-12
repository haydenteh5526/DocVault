# Repository current state

**Snapshot, 10 November 2026.** The assessed checkout is DocVault. [PR #7](https://github.com/haydenteh5526/DocVault/pull/7) records the Demo 1 increment. The earlier prototype's development history is in [DocVault-old](https://github.com/haydenteh5526/DocVault-old).

## Demo 1 capability

Register or reset a disposable account with the local Mailpit inbox. Upload the [synthetic electricity bill](../evaluation/demo-1/synthetic-electricity-bill.pdf), wait for local OCR, and open **Summary → Bill review**. Compare the **€123.47** amount due, **23 November 2026** due date and **1–31 October 2026** billing period with their exact transcript lines and the original PDF. The rehearsal recorded an identical byte-for-byte preview. [Demo script and raw checks](../evaluation/demo-1/README.md)

The bill review screen displays read-only candidates. Corrections with explicit confirmation, persistent reviewed revisions, household contributions, internal reminder approval and natural-language tool selection are the next increments. [Design](MVP_Technical_Design.md) · [Tickets](Tickets.md)

## Runtime

The web client uses React and Vite. FastAPI manages account and document access. The Docker stack uses PostgreSQL with pgvector, Redis and ARQ, RustFS as the S3-compatible store for private files, Tesseract for local OCR, Ollama for local embeddings and Mailpit for local account email. Expo is a companion client. See the [README](../README.md#quick-start) for setup, the [technical design](MVP_Technical_Design.md#architecture-and-evidence-flow) for the evidence flow and [verification guide](../AGENTS.md#verification) for test commands.

The assessed demo uses the existing hardware and local stack with **€0 planned additional spend**. Local Compose and browser CI both use `rustfs/rustfs:1.0.4` as the S3-compatible store. It replaced MinIO after the CI runner could not pull `minio/minio:latest` on 9 November. The 7 November rehearsal used the earlier MinIO image. Files in an existing local `miniodata` volume are not carried over.

## Verified results

| Evidence | Result |
| --- | --- |
| [Local rehearsal, 7 November](../evaluation/demo-1/README.md) | 177 backend tests at 73.68% coverage, 25 frontend tests and 11 browser scenarios, including local email recovery. PDF and image OCR checks used synthetic bills. |
| [Hosted CI, 9 November](https://github.com/haydenteh5526/DocVault/actions/runs/42648930881) on `6455381` | Backend, frontend, mobile and e2e passed. Backend ran 177 tests and the migration round trip. Expo Doctor passed 21 checks. Playwright ran 10 scenarios and skipped the local inbox scenario. |
| [Local model feasibility, 12 November](../evaluation/results/2026-11-12/RUN.md) | `qwen3:8b` on the project laptop (100% GPU, Q4_K_M, 3 runs of 18 synthetic cases): tool selection 87.5%, answers 85.7%, no unsafe outcomes or invented facts, median latency 682 ms. Verdict not feasible at the 90% threshold. It called `split_bill` with invented names instead of asking. Stub tools only, no app integration, no other model run. |

## Remaining evidence and limits

- The synthetic examples establish the demo behaviour. Field accuracy on varied bills, cross-owner access for new records and safe approval retries still need evaluation. Local model task selection was measured for `qwen3:8b` only and did not meet the threshold. Other local models are untested, and no local model is integrated. [Evaluation workspace](../evaluation/README.md)
- The mobile check covers types and Expo configuration. The lockfile update to `shell-quote` 1.12.0 cleared the critical advisory. The 10 November production dependency audit reported four moderate findings. Physical-device and push delivery verification remain open.
- Terraform defines an AWS environment. Live infrastructure and deployment remain unverified. The local proof of concept takes priority. [Infrastructure notes](../terraform/COST_REVIEW.md)

The original requirements, design, work breakdown and September evidence are available in the [prototype snapshot](https://github.com/haydenteh5526/DocVault/tree/6031e7242fcfcaa1b67b48ba2742c152113c9138/docs/archive/prototype).
