import csv

import pytest

from scripts.analyse_evaluation import (
    EvaluationError,
    analyse_categorisation,
    analyse_directory,
    analyse_ocr,
    analyse_rag,
    analyse_retrieval,
    analyse_usability,
)


def _write_csv(tmp_path, name, rows):
    path = tmp_path / name
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return path


def test_analyse_ocr_uses_micro_averaged_errors(tmp_path):
    path = _write_csv(
        tmp_path,
        "ocr_results.csv",
        [
            {
                "document_id": "d1",
                "condition": "preprocessed",
                "ground_truth_words": "100",
                "substitutions": "5",
                "insertions": "2",
                "deletions": "3",
                "latency_ms": "100",
            },
            {
                "document_id": "d2",
                "condition": "preprocessed",
                "ground_truth_words": "50",
                "substitutions": "2",
                "insertions": "1",
                "deletions": "2",
                "latency_ms": "200",
            },
        ],
    )

    result = analyse_ocr(path)

    assert result["overall"]["rows"] == 2
    assert result["overall"]["ground_truth_words"] == 150
    assert result["overall"]["errors"] == 15
    assert result["overall"]["micro_wer"] == 0.1
    assert result["overall"]["micro_accuracy_percent"] == 90.0
    assert result["overall"]["median_document_wer"] == 0.1
    assert result["overall"]["p95_latency_ms"] == 195.0
    assert result["by_condition"]["preprocessed"] == result["overall"]


def test_analyse_retrieval_computes_rank_metrics_and_false_positives(tmp_path):
    path = _write_csv(
        tmp_path,
        "retrieval_results.csv",
        [
            {
                "query_id": "q1",
                "mode": "keyword",
                "k": "2",
                "relevant_ids": "a|b",
                "returned_ids": "a|x",
                "latency_ms": "10",
            },
            {
                "query_id": "q2",
                "mode": "keyword",
                "k": "2",
                "relevant_ids": "",
                "returned_ids": "x",
                "latency_ms": "20",
            },
            {
                "query_id": "q1",
                "mode": "hybrid",
                "k": "2",
                "relevant_ids": "a|b",
                "returned_ids": "x|b",
                "latency_ms": "12",
            },
        ],
    )

    result = analyse_retrieval(path)

    assert result["by_mode"]["keyword"]["mean_precision_at_k"] == 0.25
    assert result["by_mode"]["keyword"]["mean_recall_at_k"] == 0.5
    assert result["by_mode"]["keyword"]["no_answer_false_positive_rate"] == 1.0
    assert result["by_mode"]["hybrid"]["mean_reciprocal_rank"] == 0.5


def test_analyse_rag_separates_answerable_and_decline_metrics(tmp_path):
    path = _write_csv(
        tmp_path,
        "rag_results.csv",
        [
            {
                "question_id": "q1",
                "answerable": "true",
                "response_status": "answered",
                "reviewer_1": "correct",
                "reviewer_2": "correct",
                "resolved_rating": "correct",
                "citations_supported": "true",
                "unsupported_claims": "0",
                "latency_ms": "100",
            },
            {
                "question_id": "q2",
                "answerable": "true",
                "response_status": "answered",
                "reviewer_1": "partial",
                "reviewer_2": "wrong",
                "resolved_rating": "partial",
                "citations_supported": "false",
                "unsupported_claims": "1",
                "latency_ms": "200",
            },
            {
                "question_id": "q3",
                "answerable": "false",
                "response_status": "declined",
                "reviewer_1": "safely_declined",
                "reviewer_2": "safely_declined",
                "resolved_rating": "safely_declined",
                "citations_supported": "false",
                "unsupported_claims": "0",
                "latency_ms": "150",
            },
        ],
    )

    result = analyse_rag(path)

    assert result["answer_accuracy"] == 0.5
    assert result["partial_answer_rate"] == 0.5
    assert result["safe_decline_rate"] == 1.0
    assert result["answerable_refusal_rate"] == 0.0
    assert result["grounded_citation_rate"] == 0.5
    assert result["unsupported_claims"] == 1
    assert result["inter_rater_exact_agreement"] == 0.6667
    assert result["median_latency_ms"] == 150.0


def test_analyse_categorisation_normalises_labels(tmp_path):
    path = _write_csv(
        tmp_path,
        "categorisation_results.csv",
        [
            {
                "document_id": "d1",
                "expected_brand": "ACME",
                "predicted_brand": "acme",
                "expected_model": "ZX 1",
                "predicted_model": "ZX 1",
                "expected_type": "User Manual",
                "predicted_type": "user  manual",
                "title_accepted": "yes",
                "manual_corrections": "0",
                "latency_ms": "20",
            },
            {
                "document_id": "d2",
                "expected_brand": "Other",
                "predicted_brand": "Wrong",
                "expected_model": "",
                "predicted_model": "unknown",
                "expected_type": "Warranty Card",
                "predicted_type": "Manual",
                "title_accepted": "no",
                "manual_corrections": "2",
                "latency_ms": "40",
            },
        ],
    )

    result = analyse_categorisation(path)

    assert result["brand"] == {"labelled": 2, "exact_match_accuracy": 0.5}
    assert result["model"] == {"labelled": 1, "exact_match_accuracy": 1.0}
    assert result["document_type"]["exact_match_accuracy"] == 0.5
    assert result["title_acceptance_rate"] == 0.5
    assert result["manual_corrections"] == 2


def test_analyse_usability_counts_unique_sus_participants(tmp_path):
    path = _write_csv(
        tmp_path,
        "usability_results.csv",
        [
            {
                "participant_id": "p1",
                "task_id": "t1",
                "completed": "true",
                "time_seconds": "30",
                "errors": "0",
                "assistance_count": "0",
                "sus_score": "80",
            },
            {
                "participant_id": "p1",
                "task_id": "t2",
                "completed": "false",
                "time_seconds": "90",
                "errors": "2",
                "assistance_count": "1",
                "sus_score": "80",
            },
            {
                "participant_id": "p2",
                "task_id": "t1",
                "completed": "true",
                "time_seconds": "45",
                "errors": "1",
                "assistance_count": "0",
                "sus_score": "70",
            },
        ],
    )

    result = analyse_usability(path)

    assert result["participants"] == 2
    assert result["task_completion_rate"] == 0.6667
    assert result["median_task_time_seconds"] == 45.0
    assert result["total_errors"] == 3
    assert result["mean_sus_score"] == 75.0


def test_analysis_rejects_bad_schema_and_conflicting_sus(tmp_path):
    bad_ocr = _write_csv(tmp_path, "ocr_results.csv", [{"document_id": "d1"}])
    with pytest.raises(EvaluationError, match="missing columns"):
        analyse_ocr(bad_ocr)

    usability = _write_csv(
        tmp_path,
        "usability_results.csv",
        [
            {
                "participant_id": "p1",
                "task_id": "t1",
                "completed": "true",
                "time_seconds": "1",
                "errors": "0",
                "assistance_count": "0",
                "sus_score": "60",
            },
            {
                "participant_id": "p1",
                "task_id": "t2",
                "completed": "true",
                "time_seconds": "1",
                "errors": "0",
                "assistance_count": "0",
                "sus_score": "70",
            },
        ],
    )
    with pytest.raises(EvaluationError, match="conflicting"):
        analyse_usability(usability)


def test_analyse_directory_can_allow_missing_files(tmp_path):
    _write_csv(
        tmp_path,
        "ocr_results.csv",
        [
            {
                "document_id": "d1",
                "condition": "baseline",
                "ground_truth_words": "10",
                "substitutions": "1",
                "insertions": "0",
                "deletions": "0",
                "latency_ms": "5",
            }
        ],
    )
    assert set(analyse_directory(tmp_path, allow_missing=True)) == {"ocr"}
    with pytest.raises(EvaluationError, match="Missing evaluation file"):
        analyse_directory(tmp_path)
