# Project Documentation

This directory separates the original proposal baselines from the documents
that describe the current system. Start with the current-state group when
developing, testing, or writing the final report.

## Current system and evidence

| Document | Purpose |
| --- | --- |
| [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) | Verified implementation state, test baseline, known gaps, and completion criteria |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | As-built components, data flow, security boundaries, and deployment state |
| [`TRACEABILITY.md`](TRACEABILITY.md) | Requirements mapped to implementation and verification evidence |
| [`SECURITY.md`](SECURITY.md) | Implemented application controls and unverified infrastructure controls |
| [`EVALUATION_PLAN.md`](EVALUATION_PLAN.md) | Reproducible experiments for OCR, retrieval, RAG, performance, accessibility, and usability |
| [`USABILITY_TEST_PLAN.md`](USABILITY_TEST_PLAN.md) | Participant protocol, tasks, consent, data handling, and SUS collection |

Evaluation result templates live in [`../evaluation/`](../evaluation/README.md).
Testing commands and environment requirements live in
[`../TESTING.md`](../TESTING.md), while the active priorities live in
[`../TODO.md`](../TODO.md).

## Original planning baselines

| Document | Purpose |
| --- | --- |
| [`REQUIREMENTS.md`](REQUIREMENTS.md) | Approved functional and non-functional requirements baseline |
| [`DESIGN.md`](DESIGN.md) | Original proposed architecture and design decisions |
| [`TASKS.md`](TASKS.md) | Original estimated implementation plan |

These baseline files intentionally preserve proposal-era decisions, including
ideas that changed during implementation. Their banners point to the matching
current-state document; do not use them alone as proof of what is deployed.

## Maintenance rule

When a pull request changes behaviour, update the smallest authoritative current
document in the same pull request. Record measured results with a date, commit
SHA, environment, and raw output location. Do not mark cloud, device, AI-quality,
or user-study claims as verified until the corresponding experiment has run.
