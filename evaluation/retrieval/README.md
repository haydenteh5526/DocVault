# Retrieval and answer reliability benchmark (issue #33)

This benchmark measures three things on a frozen synthetic set: how well DocVault's retrieval finds the right document with keyword, semantic and hybrid search (on clean and poorly scanned pages), how often Ask correctly declines a question the documents cannot answer and where its "not found" floor should sit, and how reliable the written answers are from a local model and from a free hosted model. It carries out sections 3 and 4 of [`EVALUATION_PLAN.md`](../EVALUATION_PLAN.md) (research questions RQ2 and RQ3). The approved [plan](../../specs/plans/2026-11-20-retrieval-benchmark.md) holds the rationale and the decisions (B1 to B5, D6 to D10).

Everything below is the **frozen protocol**. It is committed and merged before any measured run, and `RUN.md` records the merge commit. It is not changed after results are seen. The questions, relevance judgements, split, floor grid, metrics and decision rules are part of it, and so are `retrieve` and `generate_answer` in `backend/app/services/` (the code Ask runs). A wrong question or rule found later is recorded as a protocol deviation and followed by a full rerun, never edited quietly. Failed runs stay in the record.

## Files

- [`corpus/`](corpus): 30 synthetic text documents, one file each (`D01-…` to `D30-…`).
- [`questions.json`](questions.json): the 60 questions with judgements, answer keys, reference answers and split.
- [`manifest.json`](manifest.json): every rendered image's document, profile, title, path and SHA-256, and the seed.
- [`compose.bench.yml`](compose.bench.yml): the `dvbench` stack override (ports, the reused Ollama volume, the `/evaluation` mount).
- [`backend/scripts/build_retrieval_corpus.py`](../../backend/scripts/build_retrieval_corpus.py): renders and degrades the page images.
- [`backend/scripts/eval_retrieval.py`](../../backend/scripts/eval_retrieval.py): `ingest`, `retrieve`, `calibrate`, `answers` and `summarise`.
- [`backend/tests/test_build_retrieval_corpus.py`](../../backend/tests/test_build_retrieval_corpus.py), [`backend/tests/test_eval_retrieval.py`](../../backend/tests/test_eval_retrieval.py): the corpus, scorer and command tests.
- Results (a later pull request): `evaluation/results/<date>/retrieval/`, with one `RUN.md`.

## Hardware baseline

Intel i7-14700HX, 32 GB RAM, NVIDIA RTX 5060 Laptop GPU with 8 GB VRAM, one machine. The GPU is given to the Ollama container with [`docker-compose.gpu.yml`](../../docker-compose.gpu.yml). `RUN.md` records Ollama's processor split (`size_vram` over `size` from `/api/ps`).

## Corpus

Thirty invented Irish household documents (fictional companies, people and account numbers such as `ACC-SYN-…` and `IE00 SYNT …`; no real address, number or person). Each is plain ASCII, at most 60 lines of at most 80 characters (one page), and starts with `Title: …`.

| Kind | Documents |
| --- | --- |
| Utility bills (6) | D01 to D06: electricity for September, October and November (same supplier, different amounts and due dates, a rate change in November), gas, broadband, bin collection |
| Manuals (5) | D07 to D11: washer-dryer WD8, dishwasher, boiler, broadband router, cooker hood, each with a fault-code table. The washer-dryer and dishwasher both have an E21 with different meanings |
| Warranty cards (6) | D12 to D17: washer-dryer WD8 (3 years), desk lamp (1 year), kettle, laptop, television, vacuum. The washer-dryer and desk lamp cards share their wording, which reproduces Demo 1's known miss |
| Receipts (5) | D18 to D22: two from the same shop (the washer-dryer and a desk lamp), a kettle, a laptop, a supermarket receipt |
| Tenancy and insurance (4) | D23 to D26: tenancy agreement, home, contents and car insurance |
| Other (4) | D27 to D30: NCT certificate, a landlord letter about a rent change, a bin collection calendar, a TV licence renewal notice |

Ten documents also get a poor-scan version: D02, D07, D09, D12, D16, D17, D20, D22, D25 and D28.

### Rendering

`build_retrieval_corpus.py` turns each file into a 1654 × 2339 px (A4 at 200 dpi) white greyscale PNG, black text from Pillow's built-in scalable font at size 30, left margin 120 px, line height 38 px. The `poor` profile applies these steps in order, with `numpy.random.default_rng(seed + document number)` and seed 20261120:

1. rotate by a seeded angle in ±3.5° (white fill)
2. Gaussian blur, σ 1.4
3. contrast × 0.55 around mid-grey, then brightness +25
4. Gaussian noise, σ 14, clipped
5. downscale to 60% and back up (bilinear)
6. JPEG quality 25

Output is `clean/Dnn.png` and `poor/Dnn.jpg` under the build folder (not committed). In the `poor` ingest profile the ten listed documents use their poor version and the other twenty use the clean one.

**Checksums.** The SHA-256 values in `manifest.json` were produced in a Linux container with Pillow 13.0.0 (the version `requirements.txt` pins). The poor-scan JPEGs hash the same on Windows and Linux, but the PNG bytes do not (compression differs), so the run checks the checksums inside the `api` container: `build_retrieval_corpus.py --check` rebuilds the images and exits with status 1 on any mismatch. A mismatch stops the run.

## Questions

Sixty questions, each with `id`, `split` (`calibration` or `test`), `category`, `question`, `relevant` (document ids, empty when unanswerable), `answer_key` (the shortest exact text from the source that answers it, `null` when unanswerable), `expected_answer` (a short reference answer for raters, or "Not in the documents") and an optional `note`.

| Category | Calibration | Test |
| --- | --- | --- |
| exact (model, account and policy numbers, fault codes) | 3 | 9 |
| paraphrase | 3 | 9 |
| confuser (near-duplicate documents) | 2 | 6 |
| cross_document | 2 | 6 |
| unanswerable (plausible but absent, or near misses) | 10 | 10 |
| **Total** | **20** | **40** |

Forty are answerable and twenty are not. Twenty questions are unanswerable, not about fifteen, so that the calibration third has the 10 unanswerable questions a one-in-ten limit needs. Every question about a poor-scan document is in the test split (19 of them), so the degraded condition is measured only on held-out questions. For a cross-document question, `answer_key` is text from one of the relevant documents (its `note` says which); passage hit@5 therefore checks that one document.

## Stack and commands

The stack is the Compose project `dvbench`. It must never be `dvdemo` (3100), `dvfriday` (3700) or any other stack, and the benchmark never uses the owner's account. [`compose.bench.yml`](compose.bench.yml) publishes `db` on 5440, `api` on 8140 and `ollama` on 11440, all on the loopback address, and nothing else. `EMBEDDING_PROVIDER=ollama` is pinned for every run, so vectors from different embedding models are never mixed. `ALLOW_EVAL_SEED=true` is set in `api` only; every command that touches the database refuses to run without it. The benchmark users `retrieval-eval-clean@example.invalid` and `retrieval-eval-poor@example.invalid` exist only in `dvbench`'s database, are created by `ingest` with a random password that is never printed, and have their documents deleted and rebuilt on every ingest.

**Models.** The stack reuses an existing Docker volume that already holds `qwen3:8b` and `nomic-embed-text`, named in `BENCH_OLLAMA_VOLUME`; nothing is downloaded. The volume's name is recorded in `RUN.md`. Keep `GROQ_API_KEY`, `GEMINI_API_KEY` and `MISTRAL_API_KEY` empty in the stack's `.env`; the hosted writer's key goes only in the shell environment of the `answers` command and is never committed.

```powershell
$env:BENCH_OLLAMA_VOLUME = "<volume that holds qwen3:8b and nomic-embed-text>"
docker compose -p dvbench -f docker-compose.yml -f docker-compose.gpu.yml -f evaluation/retrieval/compose.bench.yml up -d db redis ollama api
docker compose -p dvbench exec -T api alembic upgrade head
# /health/ready on http://127.0.0.1:8140 must report ready
$out = "/evaluation/results/<date>/retrieval"
docker compose -p dvbench exec -T api python scripts/build_retrieval_corpus.py --out /evaluation/retrieval/build --check
docker compose -p dvbench exec -T api python scripts/eval_retrieval.py ingest --profile clean --output $out
docker compose -p dvbench exec -T api python scripts/eval_retrieval.py ingest --profile poor --output $out
docker compose -p dvbench exec -T api python scripts/eval_retrieval.py retrieve --profile clean --output $out
docker compose -p dvbench exec -T api python scripts/eval_retrieval.py retrieve --profile poor --output $out
docker compose -p dvbench exec -T api python scripts/eval_retrieval.py calibrate --output $out
docker compose -p dvbench exec -T -e ANSWER_MODEL=qwen3:8b api python scripts/eval_retrieval.py answers --writer ollama --floor <chosen> --output $out
docker compose -p dvbench exec -T -e GROQ_API_KEY api python scripts/eval_retrieval.py answers --writer groq --floor <chosen> --output $out
docker compose -p dvbench exec -T api python scripts/eval_retrieval.py summarise --output $out
```

If the owner prefers Gemini, `--writer gemini` with `GEMINI_API_KEY` (`gemini-2.0-flash`) takes Groq's place, and `RUN.md` records which one ran. Only the synthetic corpus reaches the hosted model.

## What each command writes

- `ingest`: `ingest.csv` (document, profile, OCR characters, chunks, word error rate against the source text). For each document it preprocesses the image with `image_processing.preprocess_image`, runs `ocr_service.extract_text`, then `chunking_service.chunk_text` and `embedding_service.get_embeddings`, exactly as `document_processor` does.
- `retrieve`: `retrieval_rows.csv`, one row per question, mode and candidate (rank, document, similarity, score, SHA-1 of the chunk text, and whether the chunk holds the answer key). Every question is run in `keyword`, `semantic`, `hybrid` and `hybrid_strict` mode with `floor=0.0` and a depth of 20. The whole pass is then run a second time and must reproduce the first exactly (D10); if it does not, the command fails and keeps the first pass as `retrieval_rows_failed_<profile>.csv`.
- `calibrate`: `calibration.csv` and `calibration.json`.
- `answers`: `answers_<writer>.jsonl`, then `rating_sheet.csv`, `rating_key.csv` and `second_rater_sample.csv`. `--floor` must equal the floor in `calibration.json`; any other value is refused.
- `summarise`: `summary.json` and `SUMMARY.md`.

## Metrics

Answerable questions only for ranking. Documents are counted in the order their first chunk appears in the candidates.

- **P@5:** relevant documents among the first 5 documents ÷ 5.
- **R@5:** relevant documents among the first 5 ÷ relevant documents.
- **RR:** 1 ÷ the rank of the first relevant document within the first 10, else 0. **MRR** is the mean.
- **Passage hit@5:** a chunk among the first 5 contains the normalised `answer_key` (lower case, NFC, whitespace collapsed), or a window of the chunk, as long as the key, matches it with `difflib.SequenceMatcher` ratio 0.8 or more **and** contains every run of digits in the key unchanged. The digit rule keeps a different month's total ("100.55" for "122.05") from counting as OCR noise; letters may be noisy. For a cross-document question only the document holding the key is checked.
- **Word error rate:** `(substitutions + insertions + deletions) / reference words` over whitespace-separated words, Unicode NFC, case and punctuation kept, as in `EVALUATION_PLAN.md` section 2.
- **At the chosen floor, per mode,** on the held-out questions: the *no-answer false-positive rate* (unanswerable questions answered ÷ unanswerable) and the *answerable refusal rate* (answerable questions declined ÷ answerable). A question is answered in `keyword` mode whenever it has a keyword match; in `semantic` and `hybrid_strict` mode when a candidate's similarity reaches the floor; in `hybrid` mode in that case or when a keyword match exists (the fallback).
- **Paired comparison** on the held-out answerable questions: for hybrid against keyword and hybrid against semantic, per-question RR wins, ties and losses, and an exact two-sided sign test p-value (`math.comb`, ties dropped).
- **Scopes.** Ranking metrics are reported for the 30 held-out answerable questions and, separately, for all 40 answerable questions. Everything that depends on the chosen floor is reported on held-out questions only.
- **Profiles.** Every number is split by profile (`clean`, `poor`) where the profile applies, and the summary lists every question whose outcome differs between the two (a different RR for an answerable question, answered against declined for an unanswerable one).
- **Answers,** per writer and for answerable and unanswerable questions separately, from rater 1: the shares of `correct`, `partial`, `wrong` and `safely_declined`; the grounded-citation rate (`citations_supported`); the unsupported-claim rate; and median and p95 latency by nearest rank (the smallest value at or above the percentile) over the questions where a writer was called. **A row that is invalid (`context truncated` or a writer failure) counts as `wrong` and as not grounded.**
- **Agreement:** Cohen's kappa on the four-way rating over the second-rater sample, with the disagreements listed. Kappa is undefined, and reported as such, when both raters used one category throughout.

## The floor rule (B3)

`calibrate` reads only calibration-split rows of the `clean` profile, in `hybrid` mode. It sweeps the floor over 0.30, 0.32 … 0.80 (26 values) and, for each floor, works out from the recorded candidates what `retrieve` would do: a question is answered if any candidate's similarity reaches the floor or, in `hybrid`, a keyword match exists. The passages are the first 5 candidates that reach the floor, or the first 5 candidates when the fallback answers.

- `A(f)`: answerable calibration questions answered with a relevant document among the first 5 passages.
- `U(f)`: unanswerable calibration questions answered.
- Eligible floors have `U(f) ≤ 1` (1 in 10).
- The chosen floor is the eligible floor with the largest `A(f)`; on ties, the **highest** floor.

## Decisions carried into the run

- **D8, the keyword fallback is measured, not changed.** Hybrid is reported with and without it (`hybrid` and `hybrid_strict`). If no floor meets the rule because the fallback answers unanswerable questions whatever the floor, `calibrate` repeats the sweep for `hybrid_strict`, writes both, and exits with status 3 and the message `No floor meets the rule with the keyword fallback; see D8.` The plan then stops and the result goes back to the owner and the Architect. Removing the fallback is a product decision made on the data.
- **D9, the local writer bar.** `qwen3:8b` becomes the documented default answer path only if, on the held-out answerable questions, at least 80% are rated `correct` and at most 10% have an unsupported claim, and on the held-out unanswerable questions at least 90% are `safely_declined`. Otherwise Groq or Gemini stays the documented path and the result is recorded as it is.
- **D10, one measured run.** Retrieval is deterministic, so the second pass must reproduce the first (checked, not scored). Answers are one pass per writer at temperature 0 and seed 0 (80 answers are rated by hand).
- **D6 and D7.** The product answers at temperature 0. The writer is `ANSWER_MODEL` (local) if set, then Groq, then Gemini, then the "no language model is set up" reply. The benchmark forces a writer through `generate_answer(..., writer=...)`; a forced writer's failure is recorded as `invalid_reason`, never replaced by another writer. If Ollama's `prompt_eval_count` is 8192 or more, the reply is recorded as `context truncated` and the row is invalid.

## Rating

Rating happens after both writers have answered and `answers` has written the sheet. Neither the owner nor the classmate sees `rating_key.csv` or the other's ratings until both are done.

- `rating_sheet.csv` merges both writers, rows shuffled with seed 20261120, writer hidden, item ids `R001…`. `rating_key.csv` maps item ids to writers. `second_rater_sample.csv` is a 30% sample stratified by question category, drawn with the same seed before anyone rates. Running `answers` again regenerates these files, so it is refused once `ratings_rater1.csv` exists.
- The owner fills `ratings_rater1.csv` for all 80 items. A classmate fills `ratings_rater2.csv` for the sample only, recorded as `rater-B`, with no name anywhere in the repository. Columns: `item_id, rating, citations_supported, unsupported_claims, notes`.
- **Rating guide.**
  - `correct`: states the expected answer, nothing contradicting it.
  - `partial`: right but incomplete, or right with a wrong detail.
  - `wrong`.
  - `safely_declined`: says it can't find it, for any question.
  - `citations_supported` (`yes` or `no`): every document the answer names is among its sources and says what the answer claims.
  - `unsupported_claims` (`yes` or `no`): any substantive claim not in the sources.

## Limits

Synthetic documents, one machine, 60 questions (30 held out and answerable), one rater plus a 30% sample, one run per writer. Poor scans are simulated and cover ten documents. Results say nothing about real households' documents, other models, other prompts or other hardware. The corpus images are rendered in a single font, so OCR results are better than handwriting or phone photos would give.
