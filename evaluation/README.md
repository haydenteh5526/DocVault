# Evaluation workspace

This folder holds anonymised, reproducible FYP measurements. The protocol is in
[`../specs/EVALUATION_PLAN.md`](../specs/EVALUATION_PLAN.md).

Recommended layout for each frozen run:

```text
evaluation/
  templates/              blank schemas committed to Git
  results/YYYY-MM-DD/     anonymised raw CSVs and generated summaries
  figures/                charts generated from committed results
```

Do not commit source documents, ground-truth text containing personal data,
participant consent, participant notes, credentials or provider responses that
contain sensitive document content.

Every result folder should include a short `RUN.md` recording commit SHA,
dataset version, hardware, provider/model versions, configuration, cache state,
protocol deviations and commands used. Failed runs remain part of the record.

Use `|` between multiple IDs in the retrieval template, preserving returned IDs
in rank order. Boolean fields accept `true` or `false`. Leave `sus_score` blank
on all but one task row per participant, or repeat the same score consistently.

From the repository root, validate a complete result set and write its derived
metrics as JSON:

```powershell
C:\venv\fyp\Scripts\python.exe backend\scripts\analyse_evaluation.py `
  evaluation\results\2026-09-14 `
  --output evaluation\results\2026-09-14\summary.json
```

The analyser calculates OCR micro-WER/accuracy, retrieval precision/recall/MRR,
RAG correctness/grounding/declines/agreement, categorisation exact match, task
completion and SUS. It rejects missing columns, invalid values and conflicting
participant scores. Use `--allow-missing` only for an explicitly partial run.
