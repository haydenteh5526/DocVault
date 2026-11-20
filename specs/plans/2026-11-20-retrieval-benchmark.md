# Retrieval Benchmark and Answer Reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** proposed and approved by the owner on 20 November 2026, with decisions B1 to B5 and D6 to D10 as written. Nothing in it is implemented.

**Issue:** [#33](https://github.com/haydenteh5526/DocVault/issues/33), opened on 20 November 2026 with the acceptance checks at the end of this plan.

**Goal:** measure, on a frozen synthetic set:
- how well DocVault's retrieval finds the right document with keyword, semantic and hybrid search, on clean and poorly scanned pages
- how often Ask correctly declines a question the documents can't answer, and where its 0.55 "not found" floor should sit
- how reliable the written answers are, from a local model and from a free hosted model

This is the lecturer's priority (memory `lecturer-feedback-2026-11`) and research questions RQ2 and RQ3 of `evaluation/EVALUATION_PLAN.md`.

**Architecture in one paragraph.**
- Today, `generate_rag_answer` in `backend/app/services/rag_service.py` combines everything in one function: vector candidates, keyword candidates, RRF fusion, the 0.55 floor and a keyword fallback that answers below the floor. A new module `backend/app/services/retrieval.py` takes that logic out, unchanged, behind one function with a `mode` argument. Ask keeps calling it in `hybrid` mode, so the product behaves exactly as before.
- A local answer writer (Ollama, `ANSWER_MODEL`) joins Groq and Gemini, so the benchmark can compare writers through the product's own code.
- Two scripts do the measuring:
  - `build_retrieval_corpus.py` renders synthetic text documents into page images and seeded poor scans
  - `eval_retrieval.py` ingests them through the real OCR, chunking and embedding code into a disposable database, runs the frozen questions, calibrates the floor on one third, and reports on the other two thirds
- **PR 1** holds the code, the corpus and the frozen protocol. **PR 2** holds the measured results, the calibrated floor and the documents.

## Decisions for the owner

Approved on 20 November 2026 (next-phase memo):

1. **B1. Answer writers: both.**
   - Local: `qwen3:8b` through Ollama. It's already downloaded, so there's no new download.
   - Hosted reference: Groq `llama-3.3-70b-versatile` on its free tier. Only the synthetic corpus is sent to it.
   - The owner creates the free key himself and puts it only in the benchmark stack's environment. It is never committed. If he prefers Gemini, `gemini-2.0-flash` takes Groq's place, and `RUN.md` records which one ran.
2. **B2. Size.** 30 synthetic documents, 10 of which also get a poor-scan version, and 60 questions.
   - **Deviation from the memo, for B3:** 20 of the 60 questions are unanswerable, not about 15. The calibration third needs 10 unanswerable questions for a 1-in-10 limit to mean anything.
3. **B3. Floor rule.** On the calibration split, pick the floor that answers the most answerable questions with a relevant document in its passages, while at most 1 in 10 unanswerable questions gets an answer. Defined exactly in Task 4.
4. **B4. Second rater.** A classmate independently rates a 30% sample under an anonymous code, without seeing which writer wrote each answer. Agreement is reported as Cohen's kappa.
5. **B5. Paperless-ngx** is out of scope. A later small plan reuses this frozen question set.

**Design decisions, each with a recommendation (approve with the plan):**

6. **D6. Answer temperature becomes 0 in the product**, for Groq, Gemini and the new local writer. It's a constant, `ANSWER_TEMPERATURE = 0.0`. *Why:* a document assistant should give the same answer to the same question, and the benchmark should measure what the product does. *Alternative:* keep 0.3 in the product and use 0 only in the benchmark, which then measures a setting nobody uses.
7. **D7. Writer precedence.** `ANSWER_MODEL` (local) if set, then Groq, then Gemini, then the existing "no language model is set up" reply. *Why:* a local writer is only configured on purpose, and it keeps data on the machine. Empty by default, so nothing changes for CI or the demo stacks.
8. **D8. The keyword fallback is measured, not changed.** The benchmark reports hybrid search with and without it (`hybrid` and `hybrid_strict`). If no floor meets B3 because the fallback answers unanswerable questions whatever the floor, the plan stops after Task 6 and that result comes back to the owner and the Architect. Removing the fallback is a product decision made on the data.
9. **D9. Local writer bar** (frozen, reported, and only used to decide the documented default). The local writer becomes the documented default answer path only if, on the held-out answerable questions, at least 80% are rated `correct` and no more than 10% have an unsupported claim, and on the held-out unanswerable questions at least 90% are `safely_declined`. Otherwise Groq or Gemini stays the documented path for generated answers, and the result is recorded as it is.
10. **D10. One measured run.** Retrieval is deterministic: a second pass must reproduce the first pass's rankings exactly, which is checked, not scored. Answers are one pass per writer at temperature 0 and seed 0. *Why:* 80 answers are rated by hand, and three runs would triple that.

## Global constraints

- Test first. No AI or tool attribution. **No new Python or npm dependencies** (Pillow, NumPy, OpenCV, httpx and pytesseract are already in `requirements.txt`). €0.
- **Synthetic data only.** The corpus is invented: fictional companies, people and account numbers (`IE00 SYNT …`, `ACC-SYN-…`). Nothing real, no real addresses or Eircodes. Only the corpus text reaches the hosted model.
- **Disposable stack only**, Compose project `dvbench`. Never `dvdemo` (3100), `dvfriday` (3700) or the owner's student account. The benchmark user `retrieval-eval@example.invalid` exists only in `dvbench`'s database and is created by the script, which refuses to run unless `ALLOW_EVAL_SEED=true`, as `seed_e2e_user.py` does.
- **No model downloads.** `dvbench`'s Ollama uses an existing volume that already holds `qwen3:8b` and `nomic-embed-text`. If none does, stop and ask the owner, stating the tag and size.
- `EMBEDDING_PROVIDER=ollama` is pinned for every run. Vectors from different embedding models are never mixed.
- **Freeze before measuring.** The questions, judgements, split, floor grid, metrics and decision rules are committed in PR 1 and merged before the first measured run. `RUN.md` records that commit. A wrong question found later is a recorded protocol deviation followed by a full rerun, never a quiet edit. Failed runs stay in the record.
- Ask's behaviour doesn't change in PR 1. Every existing test in `backend/tests/test_rag_service.py` and `test_assistant_*.py`, and every test that calls `/api/v1/ai/ask` or the conversations routes, passes **unchanged**, except one line: D6 changes the Gemini temperature assertion in `test_rag_service.py` (line 416 on `2048c3f`) from 0.3 to `rag_service.ANSWER_TEMPERATURE`. The only product changes are D6, D7 and, in PR 2, the calibrated floor.
- Update the relevant spec or evidence when behaviour changes, and keep proposed, on a branch and verified apart.

## Review focus

The inputs most likely to break this, each with a test:

1. **The extraction changes Ask's behaviour.** Run the existing RAG tests unchanged. Add `test_hybrid_mode_matches_previous_ranking`, which compares `retrieve(..., mode="hybrid")` with a frozen copy of the old fusion on a fixture with overlapping vector and keyword hits, ties and an empty keyword list.
2. **The keyword fallback.** A question with no chunk at or above the floor but a keyword match is answered in `hybrid` mode and declined in `hybrid_strict` mode: `test_keyword_fallback_only_in_hybrid`.
3. **A question scoped to one document has no floor** in any mode: `test_scoped_question_ignores_floor`.
4. **Ownership.** Retrieval never returns another user's chunk in any mode: `test_retrieve_is_owner_scoped` (two users, same text).
5. **A truncated local-writer prompt.** If `prompt_eval_count` is 8192 or more, the reply is recorded as `context truncated` and the row is invalid: `test_ollama_writer_flags_truncation`.
6. **Writer selection.** `test_writer_precedence` covers all four configurations of D7. `test_ollama_writer_failure_falls_back_to_no_key_answer` covers the case where an Ollama error never crashes Ask: it returns the existing no-key passages, and the reason is logged.
7. **Building the corpus twice gives different images** (font, randomness), which would break the hashes: `test_corpus_build_is_deterministic` builds twice with seed 20261120 and compares SHA-256.
8. **Scorer arithmetic:** P@5, R@5, RR, the floor sweep's tie rule, the sign test and kappa against hand-worked fixtures (`test_eval_retrieval.py`).
9. **Tuning on the test split.** The floor sweep reads only rows whose `split == "calibration"`. `test_floor_sweep_ignores_test_rows` puts a test-split row that would change the choice and checks that it doesn't.

## File structure

| File | Change |
| --- | --- |
| `backend/app/services/retrieval.py` | **New.** `retrieve`, `Passage`, `Retrieval`, `SIMILARITY_FLOOR`, `RRF_K` |
| `backend/app/services/rag_service.py` | Calls `retrieve`; one `ANSWER_SYSTEM_PROMPT`; `ANSWER_TEMPERATURE`; `_generate_answer_ollama`; `generate_answer(..., writer=None)` |
| `backend/app/config.py` | `ANSWER_MODEL: str = ""` |
| `backend/tests/test_retrieval.py` | **New** |
| `backend/tests/test_rag_answer_writer.py` | **New** |
| `backend/scripts/build_retrieval_corpus.py` | **New.** Renders and degrades page images, writes `manifest.json` |
| `backend/scripts/eval_retrieval.py` | **New.** `ingest`, `retrieve`, `calibrate`, `answers`, `summarise` subcommands |
| `backend/tests/test_build_retrieval_corpus.py`, `backend/tests/test_eval_retrieval.py` | **New** |
| `evaluation/retrieval/README.md` | **New.** The frozen protocol |
| `evaluation/retrieval/corpus/*.txt` | **New.** 30 synthetic documents, one file each |
| `evaluation/retrieval/questions.json` | **New.** 60 questions with judgements and split |
| `evaluation/retrieval/manifest.json` | **New.** Generated. Image names, profiles and SHA-256 |
| `evaluation/retrieval/compose.bench.yml` | **New.** `dvbench` override: ports, the reused Ollama volume, `/evaluation` mount |
| `evaluation/results/<date>/retrieval/…` | PR 2. Results, `RUN.md`, rating sheets |
| `evaluation/EVALUATION_PLAN.md` | Protocol 2.1: sections 3 and 4 point to `evaluation/retrieval/README.md` |
| `specs/Repo_Current_State.md`, `README.md` | PR 2. Verified results, the local writer setting |

## PR 1 — code, corpus and frozen protocol

### Task 1: Retrieval as one function with modes (no behaviour change)

- **Interface:**

  ```python
  Mode = Literal["keyword", "semantic", "hybrid", "hybrid_strict"]

  @dataclass(frozen=True)
  class Passage:
      chunk_id: uuid.UUID
      document_id: uuid.UUID
      document_title: str
      chunk_text: str
      similarity: float        # best cosine similarity, 0.0 for keyword-only hits
      score: float             # RRF score (hybrid), ts_rank (keyword) or similarity (semantic)
      line_start: int | None
      line_end: int | None

  @dataclass(frozen=True)
  class Retrieval:
      outcome: Literal["passages", "not_found", "no_documents"]
      via: Literal["floor", "keyword_fallback", "scoped", "none"]
      passages: list[Passage]      # at most `limit`, after the floor
      candidates: list[Passage]    # the full ranked list before the floor (at most 20), for the benchmark

  async def retrieve(
      db: AsyncSession, user_id: uuid.UUID, question: str, *,
      mode: Mode = "hybrid", document_id: str | None = None,
      floor: float = SIMILARITY_FLOOR, limit: int = 5,
  ) -> Retrieval
  ```

- **Rules for each mode** (each one is today's code with parts switched off):
  - **Candidates:** the vector query and the keyword query stay exactly as today (each `LIMIT 10`, owner filter, optional document filter).
    - `keyword` ranks keyword rows by `ts_rank`.
    - `semantic` ranks vector rows by similarity.
    - `hybrid` and `hybrid_strict` fuse both with RRF (`RRF_K = 60`), exactly as today.
  - **No candidates** in the mode's lists gives `no_documents`. This keeps today's reply ("I don't have any documents to answer from.") when both lists are empty in `hybrid`.
  - **Scoped** (`document_id` set): every candidate counts, `via="scoped"`.
  - **Floor, unscoped:**
    - `semantic`, `hybrid` and `hybrid_strict` keep candidates with `similarity >= floor`, giving `via="floor"`.
    - In `hybrid` only, if none clears the floor and keyword rows exist, the top 5 fused candidates are kept, `via="keyword_fallback"`, as today.
    - Otherwise `not_found`.
    - `keyword` has no similarity, so it answers whenever it has a keyword match, `via="none"`.
  - Line ranges are worked out only for `passages`, with `_LineIndex` (which moves to `retrieval.py`, with `ocr_lines_of` re-exported from `rag_service` so existing imports keep working).
- `generate_rag_answer` calls `retrieve(mode="hybrid")` and maps `no_documents` and `not_found` to today's replies. The warranty context, answer generation and `Source` building are unchanged.
- [ ] **Tests first** (`test_retrieval.py`): Review-focus tests 1 to 4 above, plus `test_keyword_mode_declines_without_match`, `test_semantic_mode_has_no_fallback`, `test_candidates_keep_pre_floor_order`.
- [ ] Gates: `python -m ruff check app/ tests/ scripts/` and `python -m pytest tests/ --cov=app --cov-fail-under=65`. Commit: `Retrieve passages through one function with a search mode`

### Task 2: A local answer writer and one answer prompt

- `config.py`: `ANSWER_MODEL: str = ""  # Ollama tag; empty: answers come from Groq, Gemini or the no-key reply`.
- `rag_service.py`:
  - `ANSWER_SYSTEM_PROMPT`: today's Groq and Gemini text, word for word, as one constant used by all three writers.
  - `ANSWER_TEMPERATURE = 0.0` (D6) and `ANSWER_MAX_TOKENS = 500`.
  - `def generate_answer(question, context, history=None, passages=None, writer: Literal["ollama", "groq", "gemini"] | None = None) -> AnswerResult`
    - `AnswerResult(text: str, writer: str | None, model: str | None, latency_ms: int, prompt_tokens: int | None, invalid_reason: str | None)`
    - `writer=None` applies D7. `_generate_answer` stays as a thin wrapper that returns `.text`, so existing callers and tests are unchanged.
  - `_generate_answer_ollama(question, context, history) -> tuple[str, int | None]`
    - `POST {OLLAMA_URL}/api/chat` with `model=ANSWER_MODEL`, the system prompt, the last 6 turns and the same user message format.
    - Options: `stream=false`, `think=false`, `options={"temperature": 0, "seed": 0, "num_ctx": 8192, "num_predict": 500}`, `keep_alive="30m"`, httpx timeout 60 s.
    - Returns the content and `prompt_eval_count`. If Ollama rejects `think` (HTTP 400 mentioning `think`), retry once without it.
  - When `writer=None` picks Ollama and it fails, Ask returns `_no_key_answer(...)` and logs `answer_writer_failed` with the error type. A forced writer (the benchmark) records the error as `invalid_reason`.
- [ ] **Tests first** (`test_rag_answer_writer.py`, using `httpx.MockTransport` as `test_assistant_model.py` does): Review-focus tests 5 and 6, `test_all_writers_share_the_system_prompt`, `test_answer_temperature_is_zero_for_every_writer` (patch the Groq and Gemini clients and assert the arguments).
- [ ] Gates. Commit: `Write answers with a local model when one is configured`

### Task 3: The synthetic corpus and the frozen questions (stop for the owner)

- **Corpus:** 30 UTF-8 text files in `evaluation/retrieval/corpus/`, named `D01-electricity-sep.txt` to `D30-…`. Each file has a first line `Title: …`, then the document text, at most 60 lines of at most 80 characters (one page). They are invented Irish household documents:

  | Kind | Count | Must include |
  | --- | --- | --- |
  | Utility bills | 6 | Electricity for Sep, Oct and Nov (same supplier, different amounts and due dates), gas, broadband, bin collection |
  | Tenancy and insurance | 4 | Tenancy agreement (deposit, notice period, rent day), home insurance, contents insurance, car insurance |
  | Manuals | 5 | Washer-dryer WD8, dishwasher, boiler, broadband router, cooker hood. Each has a fault-code table |
  | Warranty cards | 6 | Washer-dryer WD8, desk lamp, kettle, laptop, television, vacuum. Different lengths and start dates. **The washer-dryer and desk lamp cards share wording**, reproducing Demo 1's known miss |
  | Receipts | 5 | Two from the same shop, one listing the washer-dryer purchase, one for a desk lamp |
  | Other | 4 | NCT certificate, bin collection calendar, a landlord letter about a rent change, a TV licence renewal notice |

- **Poor scans:** these 10 documents also get a poor-scan version: D02, D07, D09, D12, D16, D17, D20, D22, D25, D28 (bills, a manual, warranty cards, receipts).
- **`build_retrieval_corpus.py`**
  - `python scripts/build_retrieval_corpus.py --corpus ../evaluation/retrieval/corpus --out ../evaluation/retrieval/build --seed 20261120`
  - **Rendering:** each file becomes a 1654 × 2339 px white PNG (A4 at 200 dpi), black text from `ImageFont.load_default(size=30)` (Pillow's built-in scalable font, so no system font is needed), left margin 120 px, line height 38 px.
  - **Profile `clean`:** the rendered page.
  - **Profile `poor`**, in this order, using `numpy.random.default_rng(seed + document number)`:
    1. rotate by a seeded angle in ±3.5° (white fill)
    2. Gaussian blur, σ 1.4
    3. contrast ×0.55 around mid-grey, then brightness +25
    4. Gaussian noise, σ 14, clipped
    5. downscale to 60% and back up (bilinear)
    6. JPEG quality 25
  - **Output:** `build/clean/Dnn.png` and `build/poor/Dnn.jpg`. `build/` is already ignored by Git. `manifest.json` (committed) lists each file's document id, profile, title, path and SHA-256.
- **Questions**, in `questions.json`: `{"version": 1, "questions": [...]}`, 60 entries. Each entry:
  - `id`: `Q01` to `Q60`
  - `split`: `calibration` or `test`
  - `category`: `exact`, `paraphrase`, `confuser`, `cross_document` or `unanswerable`
  - `question`
  - `relevant`: a list of document ids, empty for unanswerable
  - `answer_key`: the shortest exact text from the source that answers it, null for unanswerable
  - `expected_answer`: a short reference answer for raters, or "Not in the documents"
  - optional `note`

  | Category | Calibration | Test | Examples of the kind |
  | --- | --- | --- | --- |
  | exact (model numbers, account and policy numbers, fault codes) | 3 | 9 | "What does fault code E21 mean on the dishwasher?" |
  | paraphrase | 3 | 9 | "How much notice do I have to give before moving out?" |
  | confuser (near-duplicate documents) | 2 | 6 | "How long is the washer-dryer guaranteed for?" |
  | cross_document | 2 | 6 | "Which was higher, the September or the October electricity bill?" |
  | unanswerable (plausible but absent, or near misses) | 10 | 10 | "When does my car tax expire?" (no car tax document); "What is the fridge's warranty?" (no fridge) |
  | **Total** | **20** | **40** | 40 answerable, 20 unanswerable |

  Every question about a poor-scan document sits in the test split, at least 12 of them, so the degraded condition is measured only on held-out questions.
- **`compose.bench.yml`:**
  - Publishes `db` on 5440, `api` on 8140, `ollama` on 11440, and nothing else.
  - Points the `ollama` service at the existing volume that holds the models, as `external: true`. The Issue session finds it with `docker run --rm -v <volume>:/m alpine ls /m/models/manifests/registry.ollama.ai/library` and records its name in the README.
  - Mounts `./evaluation` read-write at `/evaluation` in `api`.
  - Sets `EMBEDDING_PROVIDER=ollama`, `ALLOW_EVAL_SEED=true` and `ANSWER_MODEL=` (empty) in `api`.
- [ ] **Test first:** Review-focus test 7, plus `test_manifest_matches_corpus` (every corpus file has one `clean` entry, and exactly the ten listed have `poor`), plus `test_questions_file_is_well_formed`:
  - 60 ids, the counts in the table, every `relevant` id exists
  - unanswerable questions have empty `relevant` and a null `answer_key`
  - every `answer_key` occurs in its document's text
- [ ] **Stop and show the owner** the corpus list, all 60 questions with their judgements, and the split (as a table in chat). The owner may change questions **now**. After his yes nothing changes without a recorded deviation.
- [ ] Commit: `Add the synthetic retrieval corpus and the frozen questions`

### Task 4: The runner, the scorer and the protocol

- **`eval_retrieval.py` subcommands.** Each one is run inside `dvbench`'s `api` container with `--output /evaluation/results/<date>/retrieval`.
  - **`ingest --profile clean|poor`**
    - Creates or reuses `retrieval-eval-<profile>@example.invalid` (verified, a random password that is never printed).
    - Deletes that user's documents.
    - For each document: reads the image from `build/` (`clean`; for `poor`, the poor version of the ten listed and the clean version of the other twenty), runs `image_processing.preprocess_image`, then `ocr_service.extract_text(..., "image/png")`, exactly as `document_processor._run_ocr_and_metadata` does. Then `chunking_service.chunk_text` and `embedding_service.get_embeddings`.
    - Writes `Document(title=<Title line>, raw_text=..., s3_key_original="eval/<profile>/<id>", processing_status="complete")` and its `DocChunk` rows.
    - Writes `ingest.csv`: document id, profile, OCR characters, chunks, and the word error rate against the source text, using the WER definition in `EVALUATION_PLAN.md` section 2.
  - **`retrieve --profile clean|poor`**
    - For every question and each of `keyword`, `semantic`, `hybrid` and `hybrid_strict`, calls `retrieve(..., floor=0.0, limit=20)` and records the candidate list: rank, document id, similarity, score, and SHA-1 of the chunk text.
    - Then runs the pass a second time and fails loudly if any ranking differs (D10).
    - Writes `retrieval_rows.csv`, one row per question, mode and candidate.
  - **`calibrate`**
    - Reads only `split == "calibration"` rows of the `clean` profile, mode `hybrid`.
    - Sweeps the floor over 0.30, 0.32 … 0.80 (26 values).
    - For each floor it simulates `retrieve`'s decision from the recorded candidates: answered if any candidate's similarity ≥ floor, or, in `hybrid`, if a keyword hit exists.
    - **Rule (B3):**
      - `A(f)` = answerable calibration questions answered with a relevant document among the first 5 passages.
      - `U(f)` = unanswerable calibration questions answered.
      - Eligible floors have `U(f) ≤ 1` (1 in 10).
      - Choose the eligible floor with the largest `A(f)`. On ties, the **highest** floor.
    - If no floor is eligible in `hybrid`, it repeats the sweep for `hybrid_strict`, writes both, and exits with status 3 and the message `No floor meets the rule with the keyword fallback; see D8.`
    - Writes `calibration.csv` and `calibration.json` (`chosen_floor`, `mode`, `A`, `U`).
  - **`answers --writer ollama|groq|gemini --floor <chosen>`**
    - For every `split == "test"` question on the `clean` profile, runs Ask's own path: `retrieve(mode="hybrid", floor=chosen)`, today's context building, then `generate_answer(..., writer=<writer>)`.
    - Records the answer, the sources, latency, prompt tokens and `invalid_reason`.
    - Then writes:
      - `answers_<writer>.jsonl`
      - a rating sheet `rating_sheet.csv` (both writers merged, rows shuffled with seed 20261120, writer hidden, item ids `R001…`)
      - `rating_key.csv` (item id to writer)
      - `second_rater_sample.csv`: a 30% sample stratified by category, drawn with the same seed before anyone rates
  - **`summarise`**
    - Reads everything above, plus the filled `ratings_rater1.csv` and `ratings_rater2.csv` (columns `item_id, rating, citations_supported, unsupported_claims, notes`, ratings `correct | partial | wrong | safely_declined`).
    - Writes `summary.json` and `SUMMARY.md`.
- **Metrics:** answerable questions only for ranking. Documents are counted in the order their first chunk appears in the candidates.
  - **P@5:** relevant documents among the first 5 documents ÷ 5.
  - **R@5:** relevant documents among the first 5 ÷ relevant documents.
  - **RR:** 1 ÷ rank of the first relevant document within the first 10, else 0. **MRR** is the mean.
  - **Passage hit@5** (clarified 20 November 2026, approved by the owner): a first-5 chunk counts only if both hold:
    1. its document is one of the question's relevant documents, the gold list used for P@5 and R@5
    2. it contains the normalised `answer_key` (lower case, whitespace collapsed), or some window of the chunk the length of the key has a `difflib.SequenceMatcher` ratio ≥ 0.8 against the key, and every digit run in the key appears as a substring of that window
    - Before the digit check, OCR confusables in the window are mapped: O and o → 0; I, l and | → 1; S → 5; B → 8; Z → 2. The key is not mapped.
    - Why: a ratio alone let the September chunk "Total due: EUR 100.55" match the October key "Total due: EUR 122.05" (ratio about 0.81), and exact digits alone would miss poor-scan misreads such as "I22.O5".
    - Scorer unit tests cover:
      - an exact hit
      - one misread letter (hit)
      - "EUR I22.O5" against "Total due: EUR 122.05" (hit)
      - the September chunk from the September document (miss: wrong document)
      - "Previous balance: EUR 100.55" in the right document (miss: digits)
      - a relevant-document chunk without the key (miss)
  - **At the chosen floor**, per mode: no-answer false-positive rate (unanswerable questions answered ÷ unanswerable) and answerable refusal rate (answerable questions declined ÷ answerable).
  - **Paired comparison** on the test split: for hybrid vs keyword and hybrid vs semantic, per-question RR wins, ties and losses, and an exact two-sided sign test p-value (`math.comb`, ties dropped).
  - **Answers**, per writer: rater 1's share of `correct`, `partial`, `wrong` and `safely_declined`, for answerable and unanswerable questions separately; the grounded-citation rate; the unsupported-claim rate; median and p95 latency (nearest rank).
  - **Agreement:** Cohen's kappa on the four-way rating over the sample, with disagreements listed.
  - **The D9 verdict** for the local writer.
- **Every number in `SUMMARY.md` is split by profile** (`clean`, `poor`) where the profile applies, and the summary lists every question whose outcome differs between the two.
- **`evaluation/retrieval/README.md`:** the frozen protocol in the style of `evaluation/assistant-selection/README.md`: files, hardware baseline, corpus and question rules, stack and commands, every metric above as defined here, the floor rule, D8, D9, D10, and the rating guide.
  - **Rating guide:**
    - `correct`: states the expected answer, nothing contradicting it
    - `partial`: right but incomplete, or right with a wrong detail
    - `wrong`
    - `safely_declined`: says it can't find it, for any question
    - `citations_supported`: every document the answer names is among its sources and says what the answer claims
    - `unsupported_claims`: any substantive claim not in the sources
  - **Limits:** synthetic, one machine, 60 questions, one rater plus a sample.
- `EVALUATION_PLAN.md` becomes protocol 2.1, dated 20 Nov 2026. Sections 3 and 4 say they are carried out by `evaluation/retrieval/README.md`. Nothing else changes.
- [ ] **Tests first** (`test_eval_retrieval.py`): Review-focus tests 8 and 9, plus:
  - `test_document_order_uses_first_chunk`
  - `test_passage_hit_tolerates_ocr_noise`
  - `test_calibrate_exits_3_when_fallback_blocks_rule`
  - `test_rating_sheet_hides_writer`
  - `test_second_rater_sample_is_stratified_and_fixed`
  - `test_summary_counts_invalid_rows_as_failures`
- [ ] Gates, including the migration round trip in CI (no migration is added). Commit: `Measure retrieval and answers against the frozen questions`

### Task 5: Review and PR 1

- [ ] Rename the branch to `feature/retrieval-benchmark` if it was tool-generated.
- [ ] The Reviewer checks the diff against this plan and these points:
  - the RAG tests are unchanged
  - Review focus 1 to 9
  - no new dependency
  - nothing real in the corpus
  - `compose.bench.yml` publishes no port used by `dvdemo` or `dvfriday`
- [ ] Open PR 1, `Part of #<issue>`, with the full report. It merges under `AGENTS.md`. **Measuring starts only after PR 1 is merged**, and `RUN.md` records the merge commit.

## PR 2 — measured results

### Task 6: Run

- [ ] From the PR 1 merge commit:
  1. `docker compose -p dvbench -f docker-compose.yml -f docker-compose.gpu.yml -f evaluation/retrieval/compose.bench.yml up -d db redis ollama api`, then `alembic upgrade head` and `/health/ready`.
  2. `build_retrieval_corpus.py`, checking every SHA-256 against `manifest.json` (a mismatch stops the run).
  3. `ingest --profile clean`, `ingest --profile poor`.
  4. `retrieve --profile clean`, `retrieve --profile poor`.
  5. `calibrate`. If it exits 3, **stop**: commit the rows, record the result in `RUN.md`, and bring it to the owner and the Architect (D8).
  6. `answers --writer ollama --floor <chosen>`, with `ANSWER_MODEL=qwen3:8b` set for this command only.
  7. `answers --writer groq --floor <chosen>`, with the owner's key in the shell environment only.
- [ ] `RUN.md` records:
  - the commit, UTC times, hardware, Ollama's processor split
  - the model tags and digests from `/api/show`
  - the embedding model
  - the Ollama volume name
  - each command and its exit status
  - every deviation and failed run
- [ ] Commit the rows and sheets (no key, no password): `Record the retrieval and answer runs`

### Task 7: Ratings (the owner and a classmate)

- [ ] The owner fills `ratings_rater1.csv` for all 80 items.
- [ ] The classmate fills `ratings_rater2.csv` for the sample only, recorded as `rater-B`, with no name anywhere in the repository.
- [ ] Neither sees `rating_key.csv` or the other's ratings until both are done.
- [ ] Commit: `Record the answer ratings`

### Task 8: The floor, the summary and the records

- [ ] `summarise`. Commit `summary.json` and `SUMMARY.md`.
- [ ] **Tests first:** change `test_rag_service.py`'s floor expectations to the chosen value, through the `SIMILARITY_FLOOR` constant rather than a literal where the test allows. Then set `SIMILARITY_FLOOR` in `retrieval.py` to the chosen floor, with the comment `Calibrated on <date> by evaluation/results/<date>/retrieval (calibration split, rule B3).` If the chosen floor equals 0.55, change only the comment.
- [ ] If D9 passes, `README.md` documents `ANSWER_MODEL=qwen3:8b` as the recommended local answer path; otherwise it records that local answers did not meet the bar, with the numbers.
- [ ] `specs/Repo_Current_State.md`: a verified-results row with the commit, the stack, the headline numbers and a link to `SUMMARY.md`.
- [ ] The Reviewer re-runs `summarise` from the committed rows and checks that the numbers match, that the floor was chosen from calibration rows only, and that every deviation is in `RUN.md`.
- [ ] Commits: `Set Ask's floor from the calibration run` and `Record the verified retrieval and answer results`. Open PR 2. A closing keyword only if every check below is met.

## Acceptance checks

| # | Check | Verified by |
| --- | --- | --- |
| 1 | Ask's behaviour is unchanged by the extraction: same passages, same replies | Existing RAG tests unchanged; `test_hybrid_mode_matches_previous_ranking` (Task 1) |
| 2 | Keyword, semantic, hybrid and hybrid-strict retrieval are compared on the same 40 answerable questions with P@5, R@5, MRR and passage hit@5, on clean and poor scans | `retrieval_rows.csv`, `SUMMARY.md` (Tasks 4, 6, 8) |
| 3 | Hybrid's difference from each single mode is reported per question, with a sign test | `SUMMARY.md` paired table |
| 4 | Twenty unanswerable questions measure how often Ask answers what it can't know, per mode, at the chosen floor | `SUMMARY.md` no-answer false-positive rate |
| 5 | The floor is chosen by a rule frozen in advance, from calibration questions only, and reported on held-out questions | `calibration.json`; `test_floor_sweep_ignores_test_rows`; Reviewer re-run |
| 6 | Answers from a local model and a free hosted model are rated on the same held-out questions, blind to the writer, with a second rater on a 30% sample and kappa reported | `rating_sheet.csv`, `rating_key.csv`, `ratings_rater*.csv`, `SUMMARY.md` |
| 7 | The protocol, corpus and questions were frozen in a merged commit before the first measured run, and every deviation and failed run is recorded | PR 1 merge commit in `RUN.md` |
| 8 | Synthetic data only, €0, no new dependency, no model download, nothing run against `dvdemo`, `dvfriday` or the owner's account | Reviewer (Tasks 5, 8); `compose.bench.yml` |
