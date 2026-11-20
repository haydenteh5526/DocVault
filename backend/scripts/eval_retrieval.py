"""Measure retrieval and answer reliability against the frozen synthetic questions (issue 33, Task 4).

Each subcommand runs inside the disposable `dvbench` api container and writes to --output
(evaluation/results/<date>/retrieval). The protocol, metrics and decision rules are frozen in
evaluation/retrieval/README.md; nothing here is tuned after results are seen.

    python scripts/eval_retrieval.py ingest   --profile clean|poor --output DIR
    python scripts/eval_retrieval.py retrieve --profile clean|poor --output DIR
    python scripts/eval_retrieval.py calibrate --output DIR
    python scripts/eval_retrieval.py answers  --writer ollama|groq|gemini --floor F --output DIR
    python scripts/eval_retrieval.py summarise --output DIR

Every command that touches the database refuses to run unless ALLOW_EVAL_SEED=true, which only the
benchmark stack sets.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import difflib
import importlib.util
import json
import math
import os
import random
import re
import secrets
import statistics
import sys
import unicodedata
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Frozen protocol constants. They are deliberately not command-line flags.
SEED = 20261120
MODES = ("keyword", "semantic", "hybrid", "hybrid_strict")
RATINGS = ("correct", "partial", "wrong", "safely_declined")
CANDIDATE_DEPTH = 20
PASSAGE_LIMIT = 5
OCR_HIT_RATIO = 0.8
FALSE_POSITIVE_LIMIT = 10  # at most 1 unanswerable question in 10 may be answered (B3)
SAMPLE_SHARE = 0.30
D9_CORRECT = 0.80
D9_UNSUPPORTED = 0.10
D9_DECLINED = 0.90
FALLBACK_MESSAGE = "No floor meets the rule with the keyword fallback; see D8."
ROW_COLUMNS = ["profile", "question_id", "mode", "rank", "document_id", "similarity", "score", "chunk_sha1", "contains_key"]
ROOT = Path(__file__).resolve().parents[2]
RETRIEVAL_DIR = ROOT / "evaluation" / "retrieval"


# --- text and ranking metrics ----------------------------------------------------------------------

def normalise(text: str) -> str:
    """Lower case, Unicode NFC, whitespace collapsed."""
    return " ".join(unicodedata.normalize("NFC", text).lower().split())


def word_error_rate(reference: str, hypothesis: str) -> float:
    """(substitutions + insertions + deletions) / reference words, as in EVALUATION_PLAN.md section 2.

    Whitespace is normalised and Unicode is NFC; case and punctuation are kept.
    """
    ref = unicodedata.normalize("NFC", reference).split()
    hyp = unicodedata.normalize("NFC", hypothesis).split()
    if not ref:
        return 0.0 if not hyp else 1.0
    previous = list(range(len(hyp) + 1))
    for i, ref_word in enumerate(ref, start=1):
        current = [i]
        for j, hyp_word in enumerate(hyp, start=1):
            cost = 0 if ref_word == hyp_word else 1
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost))
        previous = current
    return previous[-1] / len(ref)


def document_order(candidates: list[dict]) -> list[str]:
    """Documents in the order their first chunk appears; later chunks do not add or move a document."""
    seen: list[str] = []
    for candidate in candidates:
        if candidate["document_id"] not in seen:
            seen.append(candidate["document_id"])
    return seen


def precision_at_5(order: list[str], relevant: set[str]) -> float:
    return len(set(order[:5]) & relevant) / 5


def recall_at_5(order: list[str], relevant: set[str]) -> float:
    return len(set(order[:5]) & relevant) / len(relevant) if relevant else 0.0


def reciprocal_rank(order: list[str], relevant: set[str]) -> float:
    for rank, document_id in enumerate(order[:10], start=1):
        if document_id in relevant:
            return 1 / rank
    return 0.0


# OCR confusables mapped in a chunk's window before the digit check. The key is never mapped.
_CONFUSABLES = str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "|": "1", "S": "5", "B": "8", "Z": "2"})


def passage_hit(chunks: list[str], answer_key: str) -> bool:
    """A chunk holds the normalised answer key, or a window of it that matches at a ratio of 0.8 or more.

    The fuzzy match tolerates OCR noise, but every run of digits in the key must appear in the window once
    OCR confusables (O and o to 0, I, l and | to 1, S to 5, B to 8, Z to 2) are mapped in the window: a
    different month's total ("100.55" for "122.05") is a different answer, not noise.
    """
    key = normalise(answer_key)
    if not key:
        return False
    digit_runs = re.findall(r"\d+", key)
    width = len(key)
    for chunk in chunks:
        cased = " ".join(unicodedata.normalize("NFC", chunk).split())
        text = cased.lower()
        if key in text:
            return True
        if len(text) != len(cased):  # lower-casing changed the length: no confusable mapping is possible
            cased = text
        for start in range(max(1, len(text) - width + 1)):
            if not all(run in cased[start:start + width].translate(_CONFUSABLES) for run in digit_runs):
                continue
            matcher = difflib.SequenceMatcher(None, text[start:start + width], key, autojunk=False)
            if matcher.real_quick_ratio() >= OCR_HIT_RATIO and matcher.quick_ratio() >= OCR_HIT_RATIO                     and matcher.ratio() >= OCR_HIT_RATIO:
                return True
    return False


def chunk_hit(document_id: str, chunk_text: str, question: dict) -> bool:
    """A chunk counts only if its document is one of the question's relevant documents and it holds the key."""
    return bool(question["answer_key"]) and document_id in question["relevant"]         and passage_hit([chunk_text], question["answer_key"])


def sign_test_p(wins: int, losses: int) -> float:
    """Exact two-sided sign test, ties already dropped."""
    n = wins + losses
    if n == 0:
        return 1.0
    k = min(wins, losses)
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)


def paired(hybrid: dict[str, float], other: dict[str, float]) -> dict:
    """Per-question reciprocal-rank wins, ties and losses of hybrid against another mode."""
    wins = ties = losses = 0
    for qid in hybrid.keys() & other.keys():
        if abs(hybrid[qid] - other[qid]) < 1e-12:
            ties += 1
        elif hybrid[qid] > other[qid]:
            wins += 1
        else:
            losses += 1
    return {"wins": wins, "ties": ties, "losses": losses, "p": sign_test_p(wins, losses)}


def cohens_kappa(pairs: list[tuple[str, str]]) -> float | None:
    n = len(pairs)
    if n == 0:
        return None
    observed = sum(1 for a, b in pairs if a == b) / n
    labels = {label for pair in pairs for label in pair}
    expected = sum(
        (sum(1 for a, _ in pairs if a == label) / n) * (sum(1 for _, b in pairs if b == label) / n)
        for label in labels
    )
    if expected == 1:
        return None
    return (observed - expected) / (1 - expected)


def nearest_rank(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(fraction * len(ordered)) - 1)]


# --- the floor sweep and calibration -----------------------------------------------------------------

def floor_grid() -> list[float]:
    return [round(0.30 + 0.02 * i, 2) for i in range(26)]


def index_rows(rows: list[dict]) -> dict[tuple[str, str, str], list[dict]]:
    grouped: dict[tuple[str, str, str], list[dict]] = {}
    for row in rows:
        grouped.setdefault((row["profile"], row["mode"], row["question_id"]), []).append(row)
    for group in grouped.values():
        group.sort(key=lambda row: row["rank"])
    return grouped


def passages_at(candidates: list[dict], keyword_hit: bool, mode: str, floor: float) -> list[dict]:
    """The passages retrieve() would keep, worked out from the recorded candidates."""
    if mode == "keyword":
        return candidates[:PASSAGE_LIMIT]
    kept = [c for c in candidates if c["similarity"] >= floor]
    if kept:
        return kept[:PASSAGE_LIMIT]
    if mode == "hybrid" and keyword_hit:
        return candidates[:PASSAGE_LIMIT]
    return []


def _is_answered(index: dict, profile: str, mode: str, qid: str, floor: float) -> list[dict]:
    keyword_hit = bool(index.get((profile, "keyword", qid)))
    if mode == "keyword":
        return passages_at(index.get((profile, "keyword", qid), []), keyword_hit, mode, floor)
    return passages_at(index.get((profile, mode, qid), []), keyword_hit, mode, floor)


def floor_sweep(rows: list[dict], questions: list[dict], mode: str) -> list[dict]:
    """A(f) and U(f) for each floor, from calibration questions on the clean profile only (rule B3)."""
    index = index_rows(rows)
    calibration = [q for q in questions if q["split"] == "calibration"]
    answerable = [q for q in calibration if q["category"] != "unanswerable"]
    unanswerable = [q for q in calibration if q["category"] == "unanswerable"]
    sweep = []
    for floor in floor_grid():
        a = sum(
            1 for q in answerable
            if {p["document_id"] for p in _is_answered(index, "clean", mode, q["id"], floor)} & set(q["relevant"])
        )
        u = sum(1 for q in unanswerable if _is_answered(index, "clean", mode, q["id"], floor))
        sweep.append({"floor": floor, "A": a, "U": u, "eligible": u * FALSE_POSITIVE_LIMIT <= len(unanswerable)})
    return sweep


def choose_floor(sweep: list[dict]) -> dict | None:
    """The eligible floor with the largest A; on ties the highest floor."""
    eligible = [point for point in sweep if point["eligible"]]
    if not eligible:
        return None
    best = max(point["A"] for point in eligible)
    return max((point for point in eligible if point["A"] == best), key=lambda point: point["floor"])


def calibrate(rows: list[dict], questions: list[dict], output: Path) -> int:
    output.mkdir(parents=True, exist_ok=True)
    hybrid = floor_sweep(rows, questions, "hybrid")
    chosen = choose_floor(hybrid)
    sweeps = {"hybrid": hybrid}
    if chosen is None:
        sweeps["hybrid_strict"] = floor_sweep(rows, questions, "hybrid_strict")
    with (output / "calibration.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["mode", "floor", "A", "U", "eligible"])
        writer.writeheader()
        for mode, sweep in sweeps.items():
            for point in sweep:
                writer.writerow({"mode": mode, **point})

    if chosen is not None:
        result = {"mode": "hybrid", "chosen_floor": chosen["floor"], "A": chosen["A"], "U": chosen["U"]}
        status = 0
    else:
        strict = choose_floor(sweeps["hybrid_strict"])
        result = {
            "hybrid": {"chosen_floor": None, "A": None, "U": None},
            "hybrid_strict": {
                "chosen_floor": strict["floor"] if strict else None,
                "A": strict["A"] if strict else None,
                "U": strict["U"] if strict else None,
            },
            "message": FALLBACK_MESSAGE,
        }
        print(FALLBACK_MESSAGE)
        status = 3
    (output / "calibration.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    return status


def check_floor(output: Path, floor: float) -> None:
    """The floor given to `answers` must be the one calibration chose, never one picked by hand."""
    path = output / "calibration.json"
    if not path.exists():
        raise RuntimeError(f"{path} does not exist; run calibrate before answers")
    chosen = json.loads(path.read_text(encoding="utf-8")).get("chosen_floor")
    if chosen is None or abs(chosen - floor) > 1e-9:
        raise RuntimeError(f"--floor {floor} is not the calibrated floor ({chosen})")


# --- ratings ------------------------------------------------------------------------------------------

def _flag(value: object) -> bool:
    text = str(value).strip().lower()
    if text in {"yes", "y", "true", "1"}:
        return True
    if text in {"no", "n", "false", "0", ""}:
        return False
    raise ValueError(f"not a yes/no value: {value!r}")


def check_ratings(ratings: list[dict]) -> None:
    for row in ratings:
        if row["rating"] not in RATINGS:
            raise ValueError(f"{row['item_id']}: rating {row['rating']!r} is not one of {', '.join(RATINGS)}")
        _flag(row.get("citations_supported", ""))
        _flag(row.get("unsupported_claims", ""))


def _sources_text(sources: list[dict]) -> str:
    if not sources:
        return "none"
    parts = []
    for source in sources:
        lines = ""
        if source.get("line_start") is not None:
            lines = f", line {source['line_start']}" if source["line_start"] == source.get("line_end") \
                else f", lines {source['line_start']}-{source.get('line_end')}"
        parts.append(f"{source['title']}{lines}")
    return "; ".join(parts)


def build_rating_files(answers: list[dict], questions: list[dict], seed: int = SEED) -> tuple[list[dict], list[dict], list[str]]:
    """The blind rating sheet, the key that maps items to writers, and the 30% second-rater sample."""
    by_id = {q["id"]: q for q in questions}
    ordered = sorted(answers, key=lambda a: (a["question_id"], a["writer"]))
    shuffled = list(ordered)
    random.Random(seed).shuffle(shuffled)

    sheet, key, category_of = [], [], {}
    for number, answer in enumerate(shuffled, start=1):
        item_id = f"R{number:03d}"
        question = by_id[answer["question_id"]]
        sheet.append({
            "item_id": item_id,
            "question": question["question"],
            "expected_answer": question["expected_answer"],
            "answer": answer["answer"],
            "sources": _sources_text(answer.get("sources", [])),
        })
        key.append({"item_id": item_id, "writer": answer["writer"], "question_id": answer["question_id"]})
        category_of[item_id] = question["category"]

    rng = random.Random(seed)
    sample: list[str] = []
    for category in sorted(set(category_of.values())):
        items = sorted(item for item, c in category_of.items() if c == category)
        sample += rng.sample(items, int(len(items) * SAMPLE_SHARE + 0.5))
    return sheet, key, sorted(sample)


def _subset_summary(rows: list[dict]) -> dict:
    n = len(rows)
    if n == 0:
        return {"n": 0}
    out: dict = {"n": n, "invalid": sum(1 for r in rows if r["invalid"])}
    for rating in RATINGS:
        out[rating] = sum(1 for r in rows if r["rating"] == rating) / n
    out["grounded_citation_rate"] = sum(1 for r in rows if r["citations_supported"] and not r["invalid"]) / n
    out["unsupported_claim_rate"] = sum(1 for r in rows if r["unsupported_claims"]) / n
    return out


def summarise_answers(answers: list[dict], key: list[dict], ratings: list[dict], questions: list[dict]) -> dict:
    """Rater 1's results per writer. An invalid row (truncated or failed) counts as a failure."""
    check_ratings(ratings)
    category = {q["id"]: q["category"] for q in questions}
    writer_of = {row["item_id"]: row for row in key}
    rated = {row["item_id"]: row for row in ratings}
    answer_of = {(a["question_id"], a["writer"]): a for a in answers}

    per_writer: dict[str, dict[str, list[dict]]] = {}
    latencies: dict[str, list[float]] = {}
    for item_id, mapping in writer_of.items():
        if item_id not in rated:
            raise ValueError(f"{item_id} has no rating")
        answer = answer_of[(mapping["question_id"], mapping["writer"])]
        invalid = bool(answer.get("invalid_reason"))
        rating = rated[item_id]
        row = {
            "invalid": invalid,
            "rating": "wrong" if invalid else rating["rating"],
            "citations_supported": _flag(rating.get("citations_supported", "")),
            "unsupported_claims": _flag(rating.get("unsupported_claims", "")),
        }
        subset = "unanswerable" if category[mapping["question_id"]] == "unanswerable" else "answerable"
        per_writer.setdefault(mapping["writer"], {"answerable": [], "unanswerable": []})[subset].append(row)
        if answer.get("answered", True):
            latencies.setdefault(mapping["writer"], []).append(answer["latency_ms"])

    summary: dict = {}
    for writer, subsets in per_writer.items():
        answerable = _subset_summary(subsets["answerable"])
        unanswerable = _subset_summary(subsets["unanswerable"])
        entry = {"answerable": answerable, "unanswerable": unanswerable}
        values = latencies.get(writer, [])
        entry["latency_ms"] = {"median": nearest_rank(values, 0.50), "p95": nearest_rank(values, 0.95)} if values else {}
        if answerable["n"] and unanswerable["n"]:
            entry["d9"] = {
                "correct_answerable": answerable["correct"],
                "unsupported_answerable": answerable["unsupported_claim_rate"],
                "declined_unanswerable": unanswerable["safely_declined"],
                "pass": answerable["correct"] >= D9_CORRECT
                and answerable["unsupported_claim_rate"] <= D9_UNSUPPORTED
                and unanswerable["safely_declined"] >= D9_DECLINED,
            }
        summary[writer] = entry
    return summary


def agreement(rater1: list[dict], rater2: list[dict], sample: list[str]) -> dict:
    first = {row["item_id"]: row["rating"] for row in rater1}
    second = {row["item_id"]: row["rating"] for row in rater2}
    shared = [item for item in sorted(sample) if item in first and item in second]
    pairs = [(first[item], second[item]) for item in shared]
    return {
        "n": len(shared),
        "kappa": cohens_kappa(pairs),
        "agreement_rate": (sum(1 for a, b in pairs if a == b) / len(pairs)) if pairs else None,
        "disagreements": [
            {"item_id": item, "rater1": first[item], "rater2": second[item]} for item in shared if first[item] != second[item]
        ],
    }


# --- the retrieval summary ------------------------------------------------------------------------------

def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _ranking_metrics(index: dict, profile: str, mode: str, questions: list[dict]) -> dict:
    p5, r5, rr, hit = [], [], [], []
    for q in questions:
        candidates = index.get((profile, mode, q["id"]), [])
        order = document_order(candidates)
        relevant = set(q["relevant"])
        p5.append(precision_at_5(order, relevant))
        r5.append(recall_at_5(order, relevant))
        rr.append(reciprocal_rank(order, relevant))
        hit.append(1.0 if any(c["contains_key"] for c in candidates[:5]) else 0.0)
    return {"n": len(questions), "p_at_5": _mean(p5), "r_at_5": _mean(r5), "mrr": _mean(rr), "passage_hit_at_5": _mean(hit)}


def _rr(index: dict, profile: str, mode: str, question: dict) -> float:
    order = document_order(index.get((profile, mode, question["id"]), []))
    return reciprocal_rank(order, set(question["relevant"]))


def profile_differences(rows: list[dict], questions: list[dict], chosen_floor: float, modes=MODES) -> list[dict]:
    """Every question and mode whose outcome differs between the clean and the poor profile."""
    index = index_rows(rows)
    differences = []
    for q in questions:
        for mode in modes:
            if q["category"] == "unanswerable":
                clean = bool(_is_answered(index, "clean", mode, q["id"], chosen_floor))
                poor = bool(_is_answered(index, "poor", mode, q["id"], chosen_floor))
                if clean != poor:
                    differences.append({
                        "question_id": q["id"], "mode": mode,
                        "clean": "answered" if clean else "declined", "poor": "answered" if poor else "declined",
                    })
            else:
                clean, poor = _rr(index, "clean", mode, q), _rr(index, "poor", mode, q)
                if abs(clean - poor) > 1e-9:
                    differences.append({
                        "question_id": q["id"], "mode": mode, "clean": f"rr {clean:.2f}", "poor": f"rr {poor:.2f}",
                    })
    return differences


def summarise_retrieval(rows: list[dict], questions: list[dict], chosen_floor: float) -> dict:
    index = index_rows(rows)
    profiles = sorted({row["profile"] for row in rows})
    answerable = [q for q in questions if q["category"] != "unanswerable"]
    held_out = [q for q in answerable if q["split"] == "test"]
    unanswerable_held_out = [q for q in questions if q["category"] == "unanswerable" and q["split"] == "test"]

    summary: dict = {"chosen_floor": chosen_floor, "paired": {}}
    for profile in profiles:
        at_floor = {}
        for mode in MODES:
            wrong_answers = sum(1 for q in unanswerable_held_out if _is_answered(index, profile, mode, q["id"], chosen_floor))
            refused = sum(1 for q in held_out if not _is_answered(index, profile, mode, q["id"], chosen_floor))
            at_floor[mode] = {
                "no_answer_false_positive_rate": wrong_answers / len(unanswerable_held_out) if unanswerable_held_out else 0.0,
                "answerable_refusal_rate": refused / len(held_out) if held_out else 0.0,
                "n_unanswerable": len(unanswerable_held_out),
                "n_answerable": len(held_out),
            }
        summary[profile] = {
            "held_out": {mode: _ranking_metrics(index, profile, mode, held_out) for mode in MODES},
            "all_answerable": {mode: _ranking_metrics(index, profile, mode, answerable) for mode in MODES},
            "at_floor": at_floor,
        }
        hybrid_rr = {q["id"]: _rr(index, profile, "hybrid", q) for q in held_out}
        summary["paired"][profile] = {
            f"hybrid_vs_{other}": paired(hybrid_rr, {q["id"]: _rr(index, profile, other, q) for q in held_out})
            for other in ("keyword", "semantic")
        }
    summary["differences"] = profile_differences(rows, questions, chosen_floor) if {"clean", "poor"} <= set(profiles) else []
    return summary


# --- reading and writing the row files -----------------------------------------------------------------------

def load_questions(path: Path = RETRIEVAL_DIR / "questions.json") -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["questions"]


def load_rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as handle:
        return [
            {
                "profile": row["profile"], "question_id": row["question_id"], "mode": row["mode"], "rank": int(row["rank"]),
                "document_id": row["document_id"], "similarity": float(row["similarity"]), "score": float(row["score"]),
                "chunk_sha1": row["chunk_sha1"], "contains_key": row["contains_key"] == "1",
            }
            for row in csv.DictReader(handle)
        ]


def _write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def _replace_profile(path: Path, columns: list[str], profile: str, new_rows: list[dict]) -> None:
    """Rewrite a CSV that holds both profiles, keeping the other profile's rows."""
    kept: list[dict] = []
    if path.exists():
        with path.open(encoding="utf-8", newline="") as handle:
            kept = [row for row in csv.DictReader(handle) if row["profile"] != profile]
    merged = kept + [{k: row[k] for k in columns} for row in new_rows]
    _write_csv(path, columns, sorted(merged, key=lambda r: (r["profile"], str(r.get("question_id", "")), str(r.get("document_id", "")))))


def _csv_rows(rows: list[dict]) -> list[dict]:
    return [{**row, "contains_key": "1" if row["contains_key"] else "0"} for row in rows]


def require_seed_flag() -> None:
    if os.getenv("ALLOW_EVAL_SEED") != "true":
        raise RuntimeError("Refusing to run outside the benchmark stack: set ALLOW_EVAL_SEED=true")


def _sibling(name: str):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parent / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_corpus(corpus: Path) -> dict[str, dict]:
    documents = {}
    for path in sorted(corpus.glob("D*.txt")):
        text = path.read_text(encoding="utf-8")
        documents[path.name.split("-", 1)[0]] = {"title": text.splitlines()[0][len("Title: "):], "text": text}
    return documents


# --- commands that use the database -------------------------------------------------------------------------------

def _ocr_image(path: Path) -> str:
    """The product's own path: preprocess the image, then run OCR, as document_processor does."""
    from app.services import image_processing, ocr_service

    processed = image_processing.preprocess_image(path.read_bytes())
    return ocr_service.extract_text(processed, "image/png")


def _email(profile: str) -> str:
    return f"retrieval-eval-{profile}@example.invalid"


async def _user_id(db, profile: str, create: bool):
    from sqlalchemy import select

    from app.models.base import User
    from app.services.auth_service import hash_password

    user = (await db.execute(select(User).where(User.email == _email(profile)))).scalar_one_or_none()
    if user is None:
        if not create:
            raise RuntimeError(f"{_email(profile)} does not exist; run ingest --profile {profile} first")
        user = User(email=_email(profile), hashed_password=hash_password(secrets.token_urlsafe(24)), is_verified=True)
        db.add(user)
        await db.flush()
    return user.id


async def ingest(profile: str, corpus: Path, build: Path, manifest: Path, output: Path, extract_text=_ocr_image) -> list[dict]:
    """Put the corpus through the real OCR, chunking and embedding code into the benchmark user's library."""
    require_seed_flag()
    from sqlalchemy import delete

    from app.dependencies import async_session
    from app.models.base import DocChunk, Document
    from app.services import chunking_service, embedding_service

    entries = json.loads(manifest.read_text(encoding="utf-8"))["files"]
    path_of = {(e["document_id"], e["profile"]): e["path"] for e in entries}
    documents = load_corpus(corpus)
    rows = []
    async with async_session() as db:
        user_id = await _user_id(db, profile, create=True)
        await db.execute(delete(Document).where(Document.user_id == user_id))
        for document_id, document in documents.items():
            use = "poor" if profile == "poor" and (document_id, "poor") in path_of else "clean"
            raw_text = extract_text(build / path_of[(document_id, use)])
            chunks = chunking_service.chunk_text(raw_text) if raw_text else []
            embeddings = embedding_service.get_embeddings([c["text"] for c in chunks]) if chunks else []
            record = Document(
                user_id=user_id, title=document["title"], raw_text=raw_text or None,
                s3_key_original=f"eval/{profile}/{document_id}", processing_status="complete",
            )
            db.add(record)
            await db.flush()
            for number, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                db.add(DocChunk(
                    document_id=record.id, chunk_index=number, chunk_text=chunk["text"],
                    section_title=chunk["section_title"], embedding=embedding,
                ))
            rows.append({
                "document_id": document_id, "profile": profile, "ocr_chars": len(raw_text or ""),
                "chunks": len(chunks), "wer": f"{word_error_rate(document['text'], raw_text or ''):.4f}",
            })
        await db.commit()
    _replace_profile(output / "ingest.csv", ["document_id", "profile", "ocr_chars", "chunks", "wer"], profile, rows)
    return rows


async def _document_codes(db, user_id) -> dict:
    from sqlalchemy import select

    from app.models.base import Document

    rows = (await db.execute(select(Document.id, Document.s3_key_original).where(Document.user_id == user_id))).all()
    return {document_id: key.rsplit("/", 1)[-1] for document_id, key in rows}


async def run_retrieve(profile: str, questions: list[dict], output: Path) -> list[dict]:
    """Record every mode's ranked candidates for every question, twice, and require the two passes to match."""
    require_seed_flag()
    from app.dependencies import async_session
    from app.services.retrieval import retrieve

    async def one_pass() -> list[dict]:
        rows = []
        async with async_session() as db:
            user_id = await _user_id(db, profile, create=False)
            codes = await _document_codes(db, user_id)
            for q in questions:
                for mode in MODES:
                    result = await retrieve(db, user_id, q["question"], mode=mode, floor=0.0, limit=CANDIDATE_DEPTH)
                    for rank, passage in enumerate(result.candidates, start=1):
                        rows.append({
                            "profile": profile, "question_id": q["id"], "mode": mode, "rank": rank,
                            "document_id": codes[passage.document_id], "similarity": passage.similarity,
                            "score": passage.score, "chunk_sha1": _sha1(passage.chunk_text),
                            "contains_key": chunk_hit(codes[passage.document_id], passage.chunk_text, q),
                        })
        return rows

    first = await one_pass()
    second = await one_pass()
    if first != second:
        differing = next(a for a, b in zip(first, second) if a != b) if len(first) == len(second) else "different lengths"
        _write_csv(output / f"retrieval_rows_failed_{profile}.csv", ROW_COLUMNS, _csv_rows(first))
        raise SystemExit(f"Retrieval is not deterministic: the second pass differs from the first ({differing}).")
    _replace_profile(output / "retrieval_rows.csv", ROW_COLUMNS, profile, _csv_rows(first))
    return first


def _sha1(text: str) -> str:
    import hashlib

    return hashlib.sha1(text.encode("utf-8")).hexdigest()  # noqa: S324 - an identifier, not security


async def run_answers(writer: str, floor: float, questions: list[dict], output: Path) -> list[dict]:
    """Ask's own path for every held-out question on the clean profile, with the chosen writer."""
    require_seed_flag()
    check_floor(output, floor)
    from app.dependencies import async_session
    from app.services import rag_service
    from app.services.retrieval import retrieve

    records = []
    async with async_session() as db:
        user_id = await _user_id(db, "clean", create=False)
        codes = await _document_codes(db, user_id)
        for q in (q for q in questions if q["split"] == "test"):
            result = await retrieve(db, user_id, q["question"], mode="hybrid", floor=floor)
            record = {"question_id": q["id"], "writer": writer, "answered": False, "sources": [],
                      "latency_ms": 0, "prompt_tokens": None, "invalid_reason": None, "model": None}
            if result.outcome == "no_documents":
                record["answer"] = "I don't have any documents to answer from."
            elif result.outcome == "not_found":
                record["answer"] = rag_service.NOT_FOUND_ANSWER
            else:
                top = [rag_service._passage_dict(p) for p in result.passages]
                context = await rag_service.build_context(db, top)
                answer = await asyncio.to_thread(rag_service.generate_answer, q["question"], context, None, top, writer)
                record.update(
                    answer=answer.text, answered=True, latency_ms=answer.latency_ms, prompt_tokens=answer.prompt_tokens,
                    invalid_reason=answer.invalid_reason, model=answer.model,
                    sources=[
                        {"document_id": codes[p.document_id], "title": p.document_title, "similarity": round(p.similarity, 4),
                         "line_start": p.line_start, "line_end": p.line_end}
                        for p in result.passages
                    ],
                )
            records.append(record)
    output.mkdir(parents=True, exist_ok=True)
    with (output / f"answers_{writer}.jsonl").open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    write_rating_files(output, questions)
    return records


def load_answers(output: Path) -> list[dict]:
    answers = []
    for path in sorted(output.glob("answers_*.jsonl")):
        answers += [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return answers


def write_rating_files(output: Path, questions: list[dict]) -> None:
    if (output / "ratings_rater1.csv").exists():
        print("ratings_rater1.csv exists; the rating sheet and key are left as they are.")
        return
    sheet, key, sample = build_rating_files(load_answers(output), questions)
    _write_csv(output / "rating_sheet.csv", ["item_id", "question", "expected_answer", "answer", "sources"], sheet)
    _write_csv(output / "rating_key.csv", ["item_id", "writer", "question_id"], key)
    _write_csv(output / "second_rater_sample.csv", ["item_id"], [{"item_id": item} for item in sample])


# --- summarise ------------------------------------------------------------------------------------------------------

def _read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def summarise(output: Path, questions: list[dict]) -> dict:
    calibration = json.loads((output / "calibration.json").read_text(encoding="utf-8"))
    floor = calibration.get("chosen_floor")
    if floor is None:
        raise RuntimeError("Calibration chose no floor (see D8); there is nothing to summarise yet")
    rows = load_rows(output / "retrieval_rows.csv")
    summary: dict = {"calibration": calibration, "retrieval": summarise_retrieval(rows, questions, floor)}

    ingest_rows = _read_csv(output / "ingest.csv") if (output / "ingest.csv").exists() else []
    summary["ocr"] = {}
    for profile in sorted({row["profile"] for row in ingest_rows}):
        values = sorted(float(r["wer"]) for r in ingest_rows if r["profile"] == profile)
        summary["ocr"][profile] = {
            "documents": len(values), "median_wer": statistics.median(values), "max_wer": values[-1], "min_wer": values[0],
        }

    if (output / "ratings_rater1.csv").exists():
        key = _read_csv(output / "rating_key.csv")
        ratings = _read_csv(output / "ratings_rater1.csv")
        summary["answers"] = summarise_answers(load_answers(output), key, ratings, questions)
        if (output / "ratings_rater2.csv").exists():
            sample = [r["item_id"] for r in _read_csv(output / "second_rater_sample.csv")]
            summary["agreement"] = agreement(ratings, _read_csv(output / "ratings_rater2.csv"), sample)
    return summary


def _pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def render_markdown(summary: dict) -> str:
    retrieval = summary["retrieval"]
    lines = ["# Retrieval and answer results", "", f"Chosen floor: {retrieval['chosen_floor']:.2f} "
             f"(mode {summary['calibration'].get('mode', 'hybrid')}, calibration split, rule B3).", ""]
    profiles = [p for p in ("clean", "poor") if p in retrieval]
    for profile in profiles:
        for scope, title in (("held_out", "held-out answerable questions"), ("all_answerable", "all answerable questions")):
            lines += [f"## Ranking, {profile} scans, {title}", "", "| Mode | n | P@5 | R@5 | MRR | Passage hit@5 |", "| --- | --- | --- | --- | --- | --- |"]
            for mode in MODES:
                m = retrieval[profile][scope][mode]
                lines.append(f"| {mode} | {m['n']} | {m['p_at_5']:.3f} | {m['r_at_5']:.3f} | {m['mrr']:.3f} | {_pct(m['passage_hit_at_5'])} |")
            lines.append("")
        lines += [f"## At the chosen floor, {profile} scans, held-out questions", "",
                  "| Mode | No-answer false positives | Answerable refused |", "| --- | --- | --- |"]
        for mode in MODES:
            f = retrieval[profile]["at_floor"][mode]
            lines.append(f"| {mode} | {_pct(f['no_answer_false_positive_rate'])} ({f['n_unanswerable']} unanswerable) | {_pct(f['answerable_refusal_rate'])} ({f['n_answerable']} answerable) |")
        lines += ["", f"## Hybrid against single modes, {profile} scans (reciprocal rank per question, held-out)", "",
                  "| Comparison | Wins | Ties | Losses | Sign test p |", "| --- | --- | --- | --- | --- |"]
        for name, result in retrieval["paired"][profile].items():
            lines.append(f"| {name.replace('_', ' ')} | {result['wins']} | {result['ties']} | {result['losses']} | {result['p']:.4f} |")
        lines.append("")
    if summary.get("ocr"):
        lines += ["## OCR word error rate", "", "| Profile | Documents | Median | Min | Max |", "| --- | --- | --- | --- | --- |"]
        for profile, o in summary["ocr"].items():
            lines.append(f"| {profile} | {o['documents']} | {o['median_wer']:.3f} | {o['min_wer']:.3f} | {o['max_wer']:.3f} |")
        lines.append("")
    if retrieval["differences"]:
        lines += ["## Questions whose outcome differs between clean and poor scans", "", "| Question | Mode | Clean | Poor |", "| --- | --- | --- | --- |"]
        lines += [f"| {d['question_id']} | {d['mode']} | {d['clean']} | {d['poor']} |" for d in retrieval["differences"]]
        lines.append("")
    for writer, entry in summary.get("answers", {}).items():
        lines += [f"## Answers from {writer} (rater 1)", "", "| Questions | n | Correct | Partial | Wrong | Safely declined | Grounded citations | Unsupported claims | Invalid |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
        for subset in ("answerable", "unanswerable"):
            s = entry[subset]
            if s["n"]:
                lines.append(f"| {subset} | {s['n']} | {_pct(s['correct'])} | {_pct(s['partial'])} | {_pct(s['wrong'])} | {_pct(s['safely_declined'])} | {_pct(s['grounded_citation_rate'])} | {_pct(s['unsupported_claim_rate'])} | {s['invalid']} |")
        if entry["latency_ms"]:
            lines.append(f"\nLatency (nearest rank): median {entry['latency_ms']['median']} ms, p95 {entry['latency_ms']['p95']} ms.")
        if "d9" in entry:
            d = entry["d9"]
            lines.append(f"\nD9 bar: correct {_pct(d['correct_answerable'])} (needs 80%), unsupported {_pct(d['unsupported_answerable'])} (at most 10%), declined {_pct(d['declined_unanswerable'])} (needs 90%): **{'pass' if d['pass'] else 'fail'}**.")
        lines.append("")
    if "agreement" in summary:
        a = summary["agreement"]
        kappa = "undefined" if a["kappa"] is None else f"{a['kappa']:.3f}"
        lines += ["## Agreement between raters", "", f"{a['n']} items rated by both; Cohen's kappa {kappa}.", ""]
        lines += [f"- {d['item_id']}: rater 1 {d['rater1']}, rater 2 {d['rater2']}" for d in a["disagreements"]]
        lines.append("")
    return "\n".join(lines) + "\n"


# --- command line ---------------------------------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--questions", type=Path, default=RETRIEVAL_DIR / "questions.json")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("ingest", "retrieve", "calibrate", "answers", "summarise"):
        command = sub.add_parser(name)
        command.add_argument("--output", type=Path, default=ROOT / "evaluation" / "results" / date.today().isoformat() / "retrieval")
        if name in ("ingest", "retrieve"):
            command.add_argument("--profile", choices=("clean", "poor"), required=True)
        if name == "ingest":
            command.add_argument("--corpus", type=Path, default=RETRIEVAL_DIR / "corpus")
            command.add_argument("--build", type=Path, default=RETRIEVAL_DIR / "build")
            command.add_argument("--manifest", type=Path, default=RETRIEVAL_DIR / "manifest.json")
        if name == "answers":
            command.add_argument("--writer", choices=("ollama", "groq", "gemini"), required=True)
            command.add_argument("--floor", type=float, required=True)
    args = parser.parse_args(argv)
    questions = load_questions(args.questions)

    if args.command == "ingest":
        rows = asyncio.run(ingest(args.profile, args.corpus, args.build, args.manifest, args.output))
        print(f"Ingested {len(rows)} documents for the {args.profile} profile; median WER "
              f"{statistics.median(float(r['wer']) for r in rows):.3f}.")
    elif args.command == "retrieve":
        rows = asyncio.run(run_retrieve(args.profile, questions, args.output))
        print(f"Recorded {len(rows)} candidate rows for the {args.profile} profile; the second pass matched the first.")
    elif args.command == "calibrate":
        return calibrate(load_rows(args.output / "retrieval_rows.csv"), questions, args.output)
    elif args.command == "answers":
        records = asyncio.run(run_answers(args.writer, args.floor, questions, args.output))
        invalid = sum(1 for r in records if r["invalid_reason"])
        print(f"Wrote {len(records)} answers from {args.writer} ({invalid} invalid).")
    else:
        summary = summarise(args.output, questions)
        (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8", newline="\n")
        (args.output / "SUMMARY.md").write_text(render_markdown(summary), encoding="utf-8", newline="\n")
        print(f"Wrote summary.json and SUMMARY.md to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
