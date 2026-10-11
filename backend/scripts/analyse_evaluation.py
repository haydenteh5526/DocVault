"""Validate FYP evaluation CSVs and derive reproducible summary metrics."""

from __future__ import annotations

import argparse
import csv
import json
import statistics
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any


class EvaluationError(ValueError):
    """Raised when evaluation input is missing, malformed, or inconsistent."""


def _read_csv(path: Path, required: set[str]) -> list[dict[str, str]]:
    if not path.is_file():
        raise EvaluationError(f"Missing evaluation file: {path}")
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = set(reader.fieldnames or [])
        missing = required - fields
        if missing:
            raise EvaluationError(f"{path.name} is missing columns: {', '.join(sorted(missing))}")
        rows = list(reader)
    if not rows:
        raise EvaluationError(f"{path.name} contains no result rows")
    return rows


def _number(row: dict[str, str], field: str, context: str) -> float:
    raw = (row.get(field) or "").strip()
    try:
        return float(raw)
    except ValueError as exc:
        raise EvaluationError(f"{context}: {field} must be numeric, got {raw!r}") from exc


def _boolean(row: dict[str, str], field: str, context: str) -> bool:
    raw = (row.get(field) or "").strip().lower()
    if raw in {"true", "1", "yes", "y"}:
        return True
    if raw in {"false", "0", "no", "n"}:
        return False
    raise EvaluationError(f"{context}: {field} must be true or false, got {raw!r}")


def _rate(numerator: float, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _median(values: Iterable[float]) -> float:
    return round(statistics.median(values), 2)


def _percentile(values: Iterable[float], probability: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise EvaluationError("Cannot calculate a percentile from no values")
    position = (len(ordered) - 1) * probability
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return round(ordered[lower] + (ordered[upper] - ordered[lower]) * fraction, 2)


def _mean(values: list[float]) -> float | None:
    return round(statistics.fmean(values), 4) if values else None


def _normalise(value: str | None) -> str:
    return " ".join((value or "").strip().casefold().split())


def _ids(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split("|") if item.strip()]


def analyse_ocr(path: Path) -> dict[str, Any]:
    required = {
        "document_id",
        "condition",
        "ground_truth_words",
        "substitutions",
        "insertions",
        "deletions",
        "latency_ms",
    }
    rows = _read_csv(path, required)

    def summarise(group: list[dict[str, str]]) -> dict[str, Any]:
        document_wers = []
        words = 0.0
        errors = 0.0
        for row in group:
            row_words = _number(row, "ground_truth_words", row["document_id"])
            row_errors = sum(
                _number(row, field, row["document_id"])
                for field in ("substitutions", "insertions", "deletions")
            )
            if row_words <= 0:
                raise EvaluationError(f"{row['document_id']}: ground_truth_words must be greater than zero")
            words += row_words
            errors += row_errors
            document_wers.append(row_errors / row_words)
        if words <= 0:
            raise EvaluationError("OCR ground_truth_words total must be greater than zero")
        wer = errors / words
        latencies = [_number(row, "latency_ms", row["document_id"]) for row in group]
        return {
            "rows": len(group),
            "ground_truth_words": int(words),
            "errors": int(errors),
            "micro_wer": round(wer, 4),
            "micro_accuracy_percent": round(max(0.0, 1 - wer) * 100, 2),
            "median_document_wer": round(statistics.median(document_wers), 4),
            "document_wer_q1": round(_percentile(document_wers, 0.25), 4),
            "document_wer_q3": round(_percentile(document_wers, 0.75), 4),
            "document_wer_min": round(min(document_wers), 4),
            "document_wer_max": round(max(document_wers), 4),
            "median_latency_ms": _median(latencies),
            "p95_latency_ms": _percentile(latencies, 0.95),
        }

    conditions = sorted({row["condition"].strip() for row in rows})
    if "" in conditions:
        raise EvaluationError("ocr_results.csv: condition cannot be blank")
    return {
        "overall": summarise(rows),
        "by_condition": {
            condition: summarise([row for row in rows if row["condition"].strip() == condition])
            for condition in conditions
        },
    }


def analyse_retrieval(path: Path) -> dict[str, Any]:
    required = {"query_id", "mode", "k", "relevant_ids", "returned_ids", "latency_ms"}
    rows = _read_csv(path, required)
    metrics: list[dict[str, Any]] = []
    for row in rows:
        context = row["query_id"]
        k = int(_number(row, "k", context))
        if k <= 0:
            raise EvaluationError(f"{context}: k must be greater than zero")
        relevant = set(_ids(row["relevant_ids"]))
        returned = _ids(row["returned_ids"])[:k]
        hits = len(relevant.intersection(returned))
        first_hit = next((index for index, item in enumerate(returned, 1) if item in relevant), None)
        metrics.append(
            {
                "mode": row["mode"].strip(),
                "precision": hits / k,
                "recall": hits / len(relevant) if relevant else None,
                "reciprocal_rank": 1 / first_hit if first_hit else 0.0,
                "no_answer": not relevant,
                "false_positive": not relevant and bool(returned),
                "latency_ms": _number(row, "latency_ms", context),
            }
        )
    modes = sorted({metric["mode"] for metric in metrics})
    if "" in modes:
        raise EvaluationError("retrieval_results.csv: mode cannot be blank")

    def summarise(group: list[dict[str, Any]]) -> dict[str, Any]:
        recalls = [metric["recall"] for metric in group if metric["recall"] is not None]
        no_answer = [metric for metric in group if metric["no_answer"]]
        latencies = [metric["latency_ms"] for metric in group]
        return {
            "queries": len(group),
            "mean_precision_at_k": _mean([metric["precision"] for metric in group]),
            "mean_recall_at_k": _mean(recalls),
            "mean_reciprocal_rank": _mean([metric["reciprocal_rank"] for metric in group]),
            "no_answer_false_positive_rate": _rate(
                sum(metric["false_positive"] for metric in no_answer), len(no_answer)
            ),
            "median_latency_ms": _median(latencies),
            "p95_latency_ms": _percentile(latencies, 0.95),
        }

    return {"overall": summarise(metrics), "by_mode": {mode: summarise([m for m in metrics if m["mode"] == mode]) for mode in modes}}


def analyse_rag(path: Path) -> dict[str, Any]:
    required = {
        "question_id",
        "answerable",
        "response_status",
        "reviewer_1",
        "reviewer_2",
        "resolved_rating",
        "citations_supported",
        "unsupported_claims",
        "latency_ms",
    }
    rows = _read_csv(path, required)
    ratings = {"correct", "partial", "wrong", "safely_declined"}
    parsed = []
    for row in rows:
        context = row["question_id"]
        rating = _normalise(row["resolved_rating"]).replace(" ", "_")
        if rating not in ratings:
            raise EvaluationError(f"{context}: invalid resolved_rating {rating!r}")
        parsed.append(
            {
                "answerable": _boolean(row, "answerable", context),
                "rating": rating,
                "citations_supported": _boolean(row, "citations_supported", context),
                "unsupported_claims": _number(row, "unsupported_claims", context),
                "latency_ms": _number(row, "latency_ms", context),
                "reviewers_agree": _normalise(row["reviewer_1"]) == _normalise(row["reviewer_2"]),
            }
        )
    answerable = [item for item in parsed if item["answerable"]]
    unanswerable = [item for item in parsed if not item["answerable"]]
    answered = [item for item in parsed if item["rating"] != "safely_declined"]
    latencies = [item["latency_ms"] for item in parsed]
    return {
        "questions": len(parsed),
        "answer_accuracy": _rate(sum(item["rating"] == "correct" for item in answerable), len(answerable)),
        "partial_answer_rate": _rate(sum(item["rating"] == "partial" for item in answerable), len(answerable)),
        "safe_decline_rate": _rate(
            sum(item["rating"] == "safely_declined" for item in unanswerable), len(unanswerable)
        ),
        "answerable_refusal_rate": _rate(
            sum(item["rating"] == "safely_declined" for item in answerable), len(answerable)
        ),
        "grounded_citation_rate": _rate(sum(item["citations_supported"] for item in answered), len(answered)),
        "unsupported_claims": int(sum(item["unsupported_claims"] for item in parsed)),
        "inter_rater_exact_agreement": _rate(sum(item["reviewers_agree"] for item in parsed), len(parsed)),
        "median_latency_ms": _median(latencies),
        "p95_latency_ms": _percentile(latencies, 0.95),
    }


def analyse_categorisation(path: Path) -> dict[str, Any]:
    required = {
        "document_id",
        "expected_brand",
        "predicted_brand",
        "expected_model",
        "predicted_model",
        "expected_type",
        "predicted_type",
        "title_accepted",
        "manual_corrections",
        "latency_ms",
    }
    rows = _read_csv(path, required)

    def field_accuracy(expected: str, predicted: str) -> dict[str, Any]:
        labelled = [row for row in rows if row[expected].strip()]
        matches = sum(_normalise(row[expected]) == _normalise(row[predicted]) for row in labelled)
        return {"labelled": len(labelled), "exact_match_accuracy": _rate(matches, len(labelled))}

    latencies = [_number(row, "latency_ms", row["document_id"]) for row in rows]
    return {
        "documents": len(rows),
        "brand": field_accuracy("expected_brand", "predicted_brand"),
        "model": field_accuracy("expected_model", "predicted_model"),
        "document_type": field_accuracy("expected_type", "predicted_type"),
        "title_acceptance_rate": _rate(
            sum(_boolean(row, "title_accepted", row["document_id"]) for row in rows), len(rows)
        ),
        "manual_corrections": int(sum(_number(row, "manual_corrections", row["document_id"]) for row in rows)),
        "median_latency_ms": _median(latencies),
        "p95_latency_ms": _percentile(latencies, 0.95),
    }


def analyse_usability(path: Path) -> dict[str, Any]:
    required = {"participant_id", "task_id", "completed", "time_seconds", "errors", "assistance_count", "sus_score"}
    rows = _read_csv(path, required)
    sus_by_participant: dict[str, float] = {}
    for row in rows:
        participant = row["participant_id"].strip()
        if not participant:
            raise EvaluationError("usability_results.csv: participant_id cannot be blank")
        if row["sus_score"].strip():
            score = _number(row, "sus_score", participant)
            if not 0 <= score <= 100:
                raise EvaluationError(f"{participant}: sus_score must be between 0 and 100")
            if participant in sus_by_participant and sus_by_participant[participant] != score:
                raise EvaluationError(f"{participant}: conflicting sus_score values")
            sus_by_participant[participant] = score
    return {
        "participants": len({row["participant_id"].strip() for row in rows}),
        "task_rows": len(rows),
        "task_completion_rate": _rate(
            sum(_boolean(row, "completed", row["participant_id"]) for row in rows), len(rows)
        ),
        "median_task_time_seconds": _median(_number(row, "time_seconds", row["participant_id"]) for row in rows),
        "total_errors": int(sum(_number(row, "errors", row["participant_id"]) for row in rows)),
        "total_assistance": int(sum(_number(row, "assistance_count", row["participant_id"]) for row in rows)),
        "sus_responses": len(sus_by_participant),
        "mean_sus_score": _mean(list(sus_by_participant.values())),
    }


ANALYSERS: dict[str, Callable[[Path], dict[str, Any]]] = {
    "ocr": analyse_ocr,
    "retrieval": analyse_retrieval,
    "rag": analyse_rag,
    "categorisation": analyse_categorisation,
    "usability": analyse_usability,
}


def analyse_directory(results_dir: Path, allow_missing: bool = False) -> dict[str, Any]:
    report: dict[str, Any] = {}
    for name, analyser in ANALYSERS.items():
        path = results_dir / f"{name}_results.csv"
        if allow_missing and not path.exists():
            continue
        report[name] = analyser(path)
    if not report:
        raise EvaluationError(f"No evaluation result CSVs found in {results_dir}")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("results_dir", type=Path, help="Directory containing the five evaluation result CSVs")
    parser.add_argument("--allow-missing", action="store_true", help="Analyse available CSVs instead of requiring all five")
    parser.add_argument("--output", type=Path, help="Write JSON to this file instead of stdout")
    args = parser.parse_args()

    try:
        report = analyse_directory(args.results_dir, allow_missing=args.allow_missing)
    except EvaluationError as exc:
        parser.error(str(exc))
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
