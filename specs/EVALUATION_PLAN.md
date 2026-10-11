# Reproducible evaluation plan

**Protocol version:** 2.0
**Updated:** 2026-09-15
**Results status:** Not yet collected

This protocol must be frozen before viewing final results. Commit anonymised
measurements and analysis only; keep source documents, participant data,
provider keys and identifiable ground truth outside version control.

## Research questions

- **RQ1:** How accurately does the pipeline extract text from representative
  household documents, and how much does image preprocessing help?
- **RQ2:** Does hybrid retrieval outperform keyword-only and semantic-only
  retrieval for this document collection?
- **RQ3:** How often does RAG return a correct, citation-supported answer or
  safely decline when the answer is absent?
- **RQ4:** Does automatic metadata extraction reduce organisation effort while
  remaining accurate enough to correct manually?
- **RQ5:** Does the system meet its latency, load, accessibility and usability targets?

## Reproducibility record

For every run, record:

- UTC timestamp and Git commit SHA;
- anonymised dataset version and inclusion/exclusion rules;
- operating system, CPU/RAM and Docker resource limits;
- OCR backend and preprocessing state;
- embedding provider/model and vector dimensions;
- Q&A provider/model, temperature, prompt revision and maximum output tokens;
- database state and whether caches were cold or warm;
- script/worksheet version and evaluator identities using anonymous codes.

Never mix stored vectors from different embedding models. Reprocess the dataset
after changing the embedding provider.

## 1. Preflight gate

1. Use a strong unique `JWT_SECRET` and a disposable evaluation account.
2. Start the stack and confirm `/health/ready` is healthy.
3. Pin `OCR_BACKEND` and `EMBEDDING_PROVIDER`.
4. Configure Groq or Gemini before evaluating generated answers. If neither is
   configured, label the run retrieval-only.
5. Run every command in [../TESTING.md](../TESTING.md), including the 12-check
   full-stack smoke test.
6. Copy the templates from `evaluation/templates/` into a dated results folder.
7. Freeze all questions, relevance judgements and ground truth before tuning.
8. Validate and summarise the completed CSVs with
   `backend/scripts/analyse_evaluation.py`; retain the generated JSON beside the
   anonymised raw rows.

## 2. OCR experiment

### Dataset

Use 20 or more documents covering receipts, warranty cards, manuals, clean
prints, low-light/skewed phone photos, multi-column pages and at least two
multi-page PDFs. Assign anonymous IDs and record input characteristics.

### Conditions

At minimum compare:

1. Tesseract without preprocessing;
2. Tesseract with the implemented deskew/contrast/denoise pipeline.

If credentials/budget permit, add Mistral OCR and/or Textract as separate
conditions using the same pages. Do not tune on final evaluation pages.

### Metrics

Normalise whitespace and Unicode consistently, but retain punctuation/case
rules in the protocol. Record ground-truth words, substitutions, insertions and
deletions.

```text
WER = (substitutions + insertions + deletions) / ground-truth words
OCR accuracy = max(0, 1 - WER) × 100
```

Report per-document values, median, interquartile range, full range, total
micro-averaged WER, processing latency and manual-correction requirement.
Analyse the worst cases instead of reporting only an average.

## 3. Retrieval ablation

Prepare at least 30 information needs with independently judged relevant
documents/chunks. Include exact terms, paraphrases, ambiguous terms and queries
with no relevant document.

Run the same query set in `keyword`, `semantic` and `hybrid` modes with identical
limits. Report Precision@k, Recall@k, Mean Reciprocal Rank and no-answer false
positive rate. Compare per-query outcomes and describe cases where hybrid
retrieval helps or harms. This ablation is the clearest evidence for the chosen
search architecture.

## 4. RAG evaluation

Write 50 questions before viewing answers:

- 20 direct factual lookups;
- 10 paraphrased lookups;
- 10 questions requiring evidence from more than one excerpt;
- 10 deliberately unanswerable questions.

Two reviewers independently score each response as `correct`, `partial`,
`wrong` or `safely_declined`, and separately mark whether every substantive
claim is supported by the cited excerpt. Resolve disagreements after recording
the initial ratings.

Report answer accuracy, grounded-citation rate, unsupported-claim rate,
safe-decline rate, answerable-question refusal rate, median/p95 latency and
inter-rater agreement. Include representative successes and failures.

## 5. Categorisation experiment

Use at least 30 documents with frozen labels for title acceptability, brand,
model and document type. Exclude any prompt-tuning examples. Report exact-match
accuracy for structured fields, accepted-title rate, correction rate and
latency. Record `unknown` separately rather than treating missing labels as a
match.

## 6. Performance and reliability

Run Locust progressively at 1, 10, 25 and 50 concurrent users. Hold each level
long enough to stabilise and stop if errors become sustained. Record request
count, error rate, throughput, p50/p95/p99, CPU/RAM and database/Redis settings.

Measure cold and warm search/Q&A latency separately. Exercise Redis and worker
failure to verify documented fallbacks. Do not infer uptime or durability from
a short load test; those require a deployed observation period.

## 7. Accessibility and usability

CI runs axe checks against selected public, authentication, onboarding, Ask AI
and document-library states. Also run Lighthouse in desktop and mobile
emulation, and manually verify keyboard order, visible focus, dialogs, Escape
behaviour, labels, contrast, reduced motion and live feedback for
processing/errors.

Conduct the participant study in [USABILITY_TEST_PLAN.md](USABILITY_TEST_PLAN.md).

## 8. Analysis and reporting

- Keep raw anonymised rows; derive charts/tables from them reproducibly.
- Report missing data and failed runs, not just successes.
- Separate statistical observations from interpretation.
- State threats to validity: small/private dataset, synthetic smoke document,
  provider drift, evaluator subjectivity, caching and hardware dependence.
- Do not claim that the smoke test proves accuracy, that Terraform proves a
  deployment, or that the development excerpt fallback proves RAG quality.

The evaluation is complete only when each research question is answered with
recorded evidence or explicitly marked unresolved.
