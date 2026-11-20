"""Scorer, calibration and rating-sheet tests for the retrieval benchmark (issue 33, Task 4).

The arithmetic is checked against fixtures worked out by hand, in the comments.
"""
from __future__ import annotations

import csv
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "backend" / "scripts" / "eval_retrieval.py"

_spec = importlib.util.spec_from_file_location("eval_retrieval", SCRIPT_PATH)
ev = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ev)


# --- helpers ---------------------------------------------------------------------------------

def _question(qid, split="test", category="exact", relevant=(), key=None):
    return {
        "id": qid, "split": split, "category": category, "question": f"Question {qid}?",
        "relevant": list(relevant), "answer_key": key,
        "expected_answer": "Not in the documents" if category == "unanswerable" else f"Answer {qid}",
    }


def _rows(qid, mode, candidates, profile="clean"):
    """candidates: (document_id, similarity[, contains_key]) in rank order."""
    out = []
    for rank, candidate in enumerate(candidates, start=1):
        document_id, similarity, *rest = candidate
        out.append({
            "profile": profile, "question_id": qid, "mode": mode, "rank": rank, "document_id": document_id,
            "similarity": similarity, "score": similarity, "chunk_sha1": f"{qid}-{mode}-{rank}",
            "contains_key": bool(rest and rest[0]),
        })
    return out


# --- ranking metrics -------------------------------------------------------------------------

def test_document_order_uses_first_chunk():
    # Chunks arrive D1, D1, D2, D3, D2: D2's second chunk does not move it up or add a document.
    candidates = [{"document_id": d} for d in ["D1", "D1", "D2", "D3", "D2"]]

    assert ev.document_order(candidates) == ["D1", "D2", "D3"]


def test_precision_recall_and_reciprocal_rank_by_hand():
    order = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"]
    relevant = {"D2", "D6"}

    # First 5 documents hold D2 only: P@5 = 1/5, R@5 = 1/2. D2 is at rank 2: RR = 1/2.
    assert ev.precision_at_5(order, relevant) == pytest.approx(0.2)
    assert ev.recall_at_5(order, relevant) == pytest.approx(0.5)
    assert ev.reciprocal_rank(order, relevant) == pytest.approx(0.5)


def test_reciprocal_rank_looks_only_at_the_first_ten_documents():
    order = [f"D{i}" for i in range(1, 13)]

    assert ev.reciprocal_rank(order, {"D10"}) == pytest.approx(0.1)
    assert ev.reciprocal_rank(order, {"D11"}) == 0.0
    assert ev.reciprocal_rank([], {"D1"}) == 0.0


def test_passage_hit_tolerates_ocr_noise():
    key = "Total due: EUR 122.05"

    # An exact hit, ignoring case and spacing.
    assert ev.passage_hit(["Payment due date. total due:   eur 122.05 then more"], key)
    # One misread letter.
    assert ev.passage_hit(["Payment due date. Totai due: EUR 122.05 then more words follow"], key)
    # Misread digits, as poor scans give: I for 1 and O for 0.
    assert ev.passage_hit(["Payment due date. Total due: EUR I22.O5 then more words follow"], key)
    assert ev.passage_hit(["Total due: EUR l22.OS and so on"], key)
    # Another month's total is a different answer, not noise, though its ratio alone is about 0.81.
    assert not ev.passage_hit(["Total due: EUR 100.55 and nothing else relevant here"], key)
    assert not ev.passage_hit(["Previous balance: EUR 100.55 and nothing else relevant here"], key)
    assert not ev.passage_hit([], key)


def test_keys_with_letters_and_digits_match_their_own_text():
    assert ev.passage_hit(["Model O55-Q is listed here"], "O55-Q")
    assert ev.passage_hit(["Model 055-Q is listed here"], "O55-Q")  # the O read as a zero is OCR noise
    assert not ev.passage_hit(["Model X99-Q is listed here"], "O55-Q")


def test_a_chunk_counts_only_in_a_relevant_document():
    question = _question("Q9", "test", "exact", ["D02"], "Total due: EUR 122.05")

    assert ev.chunk_hit("D02", "Total due: EUR 122.05", question)
    assert ev.chunk_hit("D02", "Total due: EUR I22.O5", question)
    # The September chunk from the September document: wrong document and wrong digits.
    assert not ev.chunk_hit("D01", "Total due: EUR 100.55", question)
    # The right text in the wrong document.
    assert not ev.chunk_hit("D01", "Total due: EUR 122.05", question)
    # A chunk of the relevant document that does not hold the key.
    assert not ev.chunk_hit("D02", "Payment due date: 20 November 2026", question)
    # Right document, wrong digits.
    assert not ev.chunk_hit("D02", "Previous balance: EUR 100.55", question)
    assert not ev.chunk_hit("D02", "anything", _question("Q8", "test", "unanswerable"))


def test_passage_hit_looks_at_every_chunk_it_is_given():
    assert ev.passage_hit(["nothing here", "BM-SYN-71533 is the receipt number"], "BM-SYN-71533")


def test_word_error_rate_by_hand():
    # Reference a b c d, hypothesis a x c: one substitution (b to x) and one deletion (d): 2 / 4.
    assert ev.word_error_rate("a b c d", "a x c") == pytest.approx(0.5)
    assert ev.word_error_rate("a  b\nc", "a b c") == 0.0
    assert ev.word_error_rate("a b", "") == 1.0


# --- the floor sweep -------------------------------------------------------------------------

def test_the_floor_grid_has_26_values_from_030_to_080():
    grid = ev.floor_grid()

    assert len(grid) == 26
    assert grid[0] == 0.30 and grid[-1] == 0.80 and grid[10] == 0.50


def _calibration_fixture():
    """Two answerable and ten unanswerable calibration questions, worked out below.

    A1 (relevant D1): D1 at 0.70 then D2 at 0.50.   A2 (relevant D3): D2 at 0.60 then D3 at 0.40.
    U1 tops out at 0.58, U2 at 0.52, and U3 to U10 at 0.30. No question has a keyword hit.

    Answered unanswerable U(f): 10 up to 0.30, 2 up to 0.52, 1 up to 0.58, 0 above. Eligible: U <= 1, so f >= 0.54.
    A(f): A1 counts while 0.70 clears the floor (f <= 0.70). A2 counts only while D3's 0.40 clears it (f <= 0.40).
    On eligible floors A = 1 from 0.54 to 0.70, then 0. The tie goes to the highest floor, 0.70.
    """
    questions = [
        _question("A1", "calibration", "exact", ["D1"]),
        _question("A2", "calibration", "exact", ["D3"]),
    ] + [_question(f"U{i}", "calibration", "unanswerable") for i in range(1, 11)]
    rows = []
    rows += _rows("A1", "hybrid", [("D1", 0.70), ("D2", 0.50)])
    rows += _rows("A2", "hybrid", [("D2", 0.60), ("D3", 0.40)])
    rows += _rows("U1", "hybrid", [("D4", 0.58)])
    rows += _rows("U2", "hybrid", [("D4", 0.52)])
    for i in range(3, 11):
        rows += _rows(f"U{i}", "hybrid", [("D4", 0.30)])
    return questions, rows


def test_floor_sweep_by_hand():
    questions, rows = _calibration_fixture()

    sweep = ev.floor_sweep(rows, questions, "hybrid")
    by_floor = {point["floor"]: point for point in sweep}

    assert (by_floor[0.30]["A"], by_floor[0.30]["U"], by_floor[0.30]["eligible"]) == (2, 10, False)
    assert (by_floor[0.40]["A"], by_floor[0.40]["U"]) == (2, 2)
    assert (by_floor[0.54]["A"], by_floor[0.54]["U"], by_floor[0.54]["eligible"]) == (1, 1, True)
    assert (by_floor[0.58]["A"], by_floor[0.58]["U"]) == (1, 1)
    assert (by_floor[0.60]["A"], by_floor[0.60]["U"]) == (1, 0)
    assert (by_floor[0.70]["A"], by_floor[0.70]["U"], by_floor[0.70]["eligible"]) == (1, 0, True)
    assert (by_floor[0.72]["A"], by_floor[0.72]["U"]) == (0, 0)
    chosen = ev.choose_floor(sweep)
    assert chosen["floor"] == 0.70 and chosen["A"] == 1 and chosen["U"] == 0


def test_floor_choice_breaks_ties_with_the_highest_floor():
    sweep = [
        {"floor": 0.50, "A": 3, "U": 0, "eligible": True},
        {"floor": 0.60, "A": 3, "U": 1, "eligible": True},
        {"floor": 0.70, "A": 2, "U": 0, "eligible": True},
        {"floor": 0.80, "A": 5, "U": 2, "eligible": False},
    ]

    assert ev.choose_floor(sweep)["floor"] == 0.60
    assert ev.choose_floor([{"floor": 0.5, "A": 1, "U": 3, "eligible": False}]) is None


def test_floor_sweep_ignores_test_rows():
    questions, rows = _calibration_fixture()
    before = ev.floor_sweep(rows, questions, "hybrid")
    # Two held-out unanswerable questions that clear every floor up to 0.90 would make U(0.70) = 2 and
    # move the choice, if the sweep read them. Poor-profile rows of calibration questions are ignored too.
    questions += [_question("T1", "test", "unanswerable"), _question("T2", "test", "unanswerable"),
                  _question("T3", "test", "exact", ["D9"])]
    rows += _rows("T1", "hybrid", [("D4", 0.90)]) + _rows("T2", "hybrid", [("D4", 0.90)])
    rows += _rows("T3", "hybrid", [("D9", 0.95)])
    rows += _rows("U3", "hybrid", [("D4", 0.99)], profile="poor")

    after = ev.floor_sweep(rows, questions, "hybrid")

    assert after == before
    assert ev.choose_floor(after)["floor"] == 0.70


def test_a_keyword_hit_answers_in_hybrid_but_not_in_strict_mode():
    questions = [_question("U1", "calibration", "unanswerable")]
    rows = _rows("U1", "hybrid", [("D4", 0.30)]) + _rows("U1", "hybrid_strict", [("D4", 0.30)])
    rows += _rows("U1", "keyword", [("D4", 0.0)])

    hybrid = {p["floor"]: p["U"] for p in ev.floor_sweep(rows, questions, "hybrid")}
    strict = {p["floor"]: p["U"] for p in ev.floor_sweep(rows, questions, "hybrid_strict")}

    assert set(hybrid.values()) == {1}  # answered at every floor, as the keyword fallback does
    assert strict[0.30] == 1 and strict[0.32] == 0


def test_calibrate_exits_3_when_fallback_blocks_rule(tmp_path):
    questions = [_question("A1", "calibration", "exact", ["D1"])]
    questions += [_question(f"U{i}", "calibration", "unanswerable") for i in range(1, 11)]
    rows = _rows("A1", "hybrid", [("D1", 0.80)]) + _rows("A1", "hybrid_strict", [("D1", 0.80)])
    for i in range(1, 11):
        rows += _rows(f"U{i}", "hybrid", [("D4", 0.35)]) + _rows(f"U{i}", "hybrid_strict", [("D4", 0.35)])
    # Two unanswerable questions have a keyword match, so the fallback answers them at every floor.
    for qid in ("U1", "U2"):
        rows += _rows(qid, "keyword", [("D4", 0.0)])

    status = ev.calibrate(rows, questions, tmp_path)

    assert status == 3
    result = json.loads((tmp_path / "calibration.json").read_text(encoding="utf-8"))
    assert result["hybrid"]["chosen_floor"] is None
    assert result["hybrid_strict"]["chosen_floor"] == 0.80  # A is 1 on every eligible floor; ties go high
    assert result["message"] == "No floor meets the rule with the keyword fallback; see D8."
    assert (tmp_path / "calibration.csv").exists()


def test_calibrate_writes_the_chosen_floor(tmp_path):
    questions, rows = _calibration_fixture()

    status = ev.calibrate(rows, questions, tmp_path)

    assert status == 0
    result = json.loads((tmp_path / "calibration.json").read_text(encoding="utf-8"))
    assert result == {"mode": "hybrid", "chosen_floor": 0.70, "A": 1, "U": 0}
    with (tmp_path / "calibration.csv").open(encoding="utf-8", newline="") as handle:
        table = list(csv.DictReader(handle))
    assert len(table) == 26 and table[0]["mode"] == "hybrid"


# --- the paired comparison and agreement --------------------------------------------------------

def test_sign_test_p_values_by_hand():
    # 8 wins, 2 losses: n = 10, p = 2 * (C(10,0) + C(10,1) + C(10,2)) / 2**10 = 2 * 56 / 1024.
    assert ev.sign_test_p(8, 2) == pytest.approx(112 / 1024)
    assert ev.sign_test_p(9, 0) == pytest.approx(2 / 512)
    assert ev.sign_test_p(3, 3) == 1.0
    assert ev.sign_test_p(0, 0) == 1.0


def test_paired_wins_ties_and_losses_drop_ties_from_the_test():
    hybrid = {"Q1": 1.0, "Q2": 0.5, "Q3": 0.5, "Q4": 0.0}
    other = {"Q1": 0.5, "Q2": 0.5, "Q3": 1.0, "Q4": 0.0}

    result = ev.paired(hybrid, other)

    assert (result["wins"], result["ties"], result["losses"]) == (1, 2, 1)
    assert result["p"] == 1.0


def test_cohens_kappa_by_hand():
    first = ["correct"] * 4 + ["wrong"] * 2 + ["partial"] * 2 + ["safely_declined"] * 2
    second = ["correct", "correct", "correct", "wrong", "wrong", "wrong", "partial", "correct",
              "safely_declined", "safely_declined"]

    # Agreement 8/10 = 0.8. Chance: (4*4 + 2*3 + 2*1 + 2*2) / 100 = 0.28. Kappa = 0.52 / 0.72.
    assert ev.cohens_kappa(list(zip(first, second))) == pytest.approx(0.52 / 0.72)
    assert ev.cohens_kappa([("correct", "correct")] * 3) is None  # chance agreement is 1: undefined


def test_nearest_rank_percentiles():
    values = [5, 1, 3, 2, 4, 6, 7, 8, 9, 10]

    assert ev.nearest_rank(values, 0.95) == 10
    assert ev.nearest_rank(values, 0.50) == 5
    assert ev.nearest_rank([7], 0.95) == 7


# --- ratings --------------------------------------------------------------------------------------

def _answers(writers=("ollama", "groq")):
    counts = {"exact": 9, "paraphrase": 9, "confuser": 6, "cross_document": 6, "unanswerable": 10}
    questions, answers = [], []
    number = 21
    for category, count in counts.items():
        for _ in range(count):
            qid = f"Q{number:02d}"
            number += 1
            questions.append(_question(qid, "test", category, [] if category == "unanswerable" else ["D1"], None
                                       if category == "unanswerable" else "key"))
            for writer in writers:
                answers.append({
                    "question_id": qid, "writer": writer, "answer": f"{writer} says {qid}", "answered": True,
                    "sources": [{"document_id": "D1", "title": "Doc", "similarity": 0.7, "line_start": 1, "line_end": 2}],
                    "latency_ms": 1000, "prompt_tokens": 800, "invalid_reason": None,
                })
    return questions, answers


def test_rating_sheet_hides_writer():
    questions, answers = _answers()

    sheet, key, sample = ev.build_rating_files(answers, questions, seed=20261120)

    assert len(sheet) == 80 and [row["item_id"] for row in sheet] == [f"R{i:03d}" for i in range(1, 81)]
    assert all("writer" not in row for row in sheet)
    assert {row["item_id"] for row in key} == {row["item_id"] for row in sheet}
    assert {row["writer"] for row in key} == {"ollama", "groq"}
    assert set(sheet[0]) == {"item_id", "question", "expected_answer", "answer", "sources"}
    first_key = next(row for row in key if row["item_id"] == "R001")
    first_sheet = sheet[0]
    assert first_sheet["answer"] == f"{first_key['writer']} says {first_key['question_id']}"
    # Shuffled: not simply grouped by question.
    assert [row["question_id"] for row in key][:6] != sorted(row["question_id"] for row in key)[:6]


def test_second_rater_sample_is_stratified_and_fixed():
    questions, answers = _answers()
    category = {q["id"]: q["category"] for q in questions}

    _, key, first = ev.build_rating_files(answers, questions, seed=20261120)
    _, _, again = ev.build_rating_files(answers, questions, seed=20261120)
    _, _, other = ev.build_rating_files(answers, questions, seed=20261121)

    assert first == again and first != other
    by_item = {row["item_id"]: category[row["question_id"]] for row in key}
    counts = {}
    for item in first:
        counts[by_item[item]] = counts.get(by_item[item], 0) + 1
    # 30% of each stratum of two writers' items, rounded half up: 18, 18, 12, 12, 20 items.
    assert counts == {"exact": 5, "paraphrase": 5, "confuser": 4, "cross_document": 4, "unanswerable": 6}
    assert len(first) == 24 and len(set(first)) == 24


# --- the summary ----------------------------------------------------------------------------------

def _ratings(key, rating_for):
    return [
        {"item_id": row["item_id"], "rating": rating_for(row), "citations_supported": "yes",
         "unsupported_claims": "no", "notes": ""}
        for row in key
    ]


def test_summary_counts_invalid_rows_as_failures():
    questions, answers = _answers(writers=("ollama",))
    for answer in answers[:3]:
        answer["invalid_reason"] = "context truncated"
    _, key, _ = ev.build_rating_files(answers, questions, seed=1)
    ratings = _ratings(key, lambda row: "correct" if row["question_id"] != "Q51" else "safely_declined")

    summary = ev.summarise_answers(answers, key, ratings, questions)

    answerable = summary["ollama"]["answerable"]
    assert answerable["n"] == 30
    # Three of the 30 rated "correct" answerable rows are invalid, so they count as wrong.
    assert answerable["correct"] == pytest.approx(27 / 30)
    assert answerable["wrong"] == pytest.approx(3 / 30)
    assert answerable["invalid"] == 3
    assert answerable["grounded_citation_rate"] == pytest.approx(27 / 30)
    assert summary["ollama"]["unanswerable"]["n"] == 10


def test_summary_applies_the_local_writer_bar():
    questions, answers = _answers(writers=("ollama",))
    _, key, _ = ev.build_rating_files(answers, questions, seed=1)
    category = {q["id"]: q["category"] for q in questions}

    good = _ratings(key, lambda row: "safely_declined" if category[row["question_id"]] == "unanswerable" else "correct")
    summary = ev.summarise_answers(answers, key, good, questions)
    assert summary["ollama"]["d9"]["pass"] is True

    # One unanswerable question answered instead of declined is 90% declined: still a pass. Two is 80%: a fail.
    def two_missed(row):
        if category[row["question_id"]] == "unanswerable":
            return "wrong" if row["question_id"] in {"Q51", "Q52"} else "safely_declined"
        return "correct"

    summary = ev.summarise_answers(answers, key, _ratings(key, two_missed), questions)
    assert summary["ollama"]["d9"]["pass"] is False
    assert summary["ollama"]["unanswerable"]["safely_declined"] == pytest.approx(0.8)


def test_summary_reports_agreement_and_lists_disagreements():
    questions, answers = _answers(writers=("ollama",))
    _, key, sample = ev.build_rating_files(answers, questions, seed=1)
    rater1 = _ratings(key, lambda row: "correct")
    rater2 = [dict(row) for row in rater1 if row["item_id"] in sample]
    rater2[0]["rating"] = "wrong"

    agreement = ev.agreement(rater1, rater2, sample)

    assert agreement["n"] == len(sample)
    assert agreement["disagreements"] == [{"item_id": rater2[0]["item_id"], "rater1": "correct", "rater2": "wrong"}]


def test_ratings_must_use_the_four_ratings():
    with pytest.raises(ValueError, match="R001"):
        ev.check_ratings([{"item_id": "R001", "rating": "great", "citations_supported": "yes", "unsupported_claims": "no"}])


# --- retrieval summary ------------------------------------------------------------------------------

def test_retrieval_summary_reports_the_held_out_questions_at_the_chosen_floor():
    questions = [
        _question("A1", "test", "exact", ["D1"], "key"),
        _question("A2", "test", "exact", ["D2"], "key"),
        _question("U1", "test", "unanswerable"),
        _question("U2", "test", "unanswerable"),
        _question("C1", "calibration", "exact", ["D3"], "key"),
    ]
    rows = []
    for profile in ("clean", "poor"):
        shift = 0.0 if profile == "clean" else -0.2
        rows += _rows("A1", "hybrid", [("D1", 0.8 + shift, True), ("D2", 0.3)], profile)
        rows += _rows("A2", "hybrid", [("D5", 0.7), ("D2", 0.6 + shift)], profile)
        rows += _rows("U1", "hybrid", [("D4", 0.4)], profile)
        rows += _rows("U2", "hybrid", [("D4", 0.7)], profile)
        for mode in ("semantic", "hybrid_strict"):
            rows += _rows("A1", mode, [("D1", 0.8 + shift, True)], profile)
            rows += _rows("A2", mode, [("D5", 0.7), ("D2", 0.6 + shift)], profile)
            rows += _rows("U1", mode, [("D4", 0.4)], profile)
            rows += _rows("U2", mode, [("D4", 0.7)], profile)
        rows += _rows("A1", "keyword", [("D1", 0.0)], profile) + _rows("A2", "keyword", [("D5", 0.0)], profile)
        rows += _rows("C1", "hybrid", [("D3", 0.9)], profile)

    summary = ev.summarise_retrieval(rows, questions, chosen_floor=0.5)

    clean = summary["clean"]
    held_out = clean["held_out"]["hybrid"]
    # A1: D1 first -> P@5 0.2, R@5 1, RR 1. A2: D2 second -> P@5 0.2, R@5 1, RR 0.5.
    assert held_out["n"] == 2
    assert held_out["p_at_5"] == pytest.approx(0.2) and held_out["r_at_5"] == pytest.approx(1.0)
    assert held_out["mrr"] == pytest.approx(0.75)
    assert held_out["passage_hit_at_5"] == pytest.approx(0.5)  # only A1's chunk carries the key
    # At floor 0.5 in hybrid: U2 (0.7) is answered, U1 (0.4) is not, nor is it saved by a keyword hit.
    assert clean["at_floor"]["hybrid"]["no_answer_false_positive_rate"] == pytest.approx(0.5)
    assert clean["at_floor"]["hybrid"]["answerable_refusal_rate"] == 0.0
    assert clean["at_floor"]["keyword"]["no_answer_false_positive_rate"] == 0.0
    # Keyword retrieval has no similarity, so it answers whenever it has a match: both answerable have one.
    assert clean["at_floor"]["keyword"]["answerable_refusal_rate"] == 0.0
    assert clean["all_answerable"]["hybrid"]["n"] == 3
    # Poor scans lower A1's and A2's similarity: A1 0.6, A2's D2 0.4. Nothing changes in rank, so RR is equal.
    assert summary["poor"]["held_out"]["hybrid"]["mrr"] == pytest.approx(0.75)
    assert summary["paired"]["clean"]["hybrid_vs_semantic"]["ties"] == 2
    assert "differences" in summary and isinstance(summary["differences"], list)


def test_a_question_whose_outcome_differs_between_profiles_is_listed():
    questions = [_question("A1", "test", "exact", ["D1"], "key"), _question("U1", "test", "unanswerable")]
    rows = []
    rows += _rows("A1", "hybrid", [("D1", 0.8), ("D2", 0.5)], "clean")
    rows += _rows("A1", "hybrid", [("D2", 0.8), ("D1", 0.5)], "poor")
    rows += _rows("U1", "hybrid", [("D4", 0.3)], "clean")
    rows += _rows("U1", "hybrid", [("D4", 0.7)], "poor")

    differences = ev.profile_differences(rows, questions, chosen_floor=0.55, modes=("hybrid",))

    assert {(d["question_id"], d["mode"]) for d in differences} == {("A1", "hybrid"), ("U1", "hybrid")}
    a1 = next(d for d in differences if d["question_id"] == "A1")
    assert (a1["clean"], a1["poor"]) == ("rr 1.00", "rr 0.50")
    u1 = next(d for d in differences if d["question_id"] == "U1")
    assert (u1["clean"], u1["poor"]) == ("declined", "answered")


# --- the commands that touch the database ------------------------------------------------------------

def test_commands_refuse_to_run_without_the_seed_flag(monkeypatch):
    monkeypatch.delenv("ALLOW_EVAL_SEED", raising=False)

    with pytest.raises(RuntimeError, match="ALLOW_EVAL_SEED"):
        ev.require_seed_flag()

    monkeypatch.setenv("ALLOW_EVAL_SEED", "true")
    ev.require_seed_flag()


async def test_commands_round_trip_through_the_database(monkeypatch, tmp_path):
    import hashlib

    from sqlalchemy import delete, func, select

    from app.config import settings
    from app.dependencies import async_session
    from app.models.base import Document, User
    from app.services import embedding_service, rag_service

    def embed(text):
        vector = [0.0] * 1536
        for word in text.lower().split():
            vector[int(hashlib.md5(word.encode()).hexdigest(), 16) % 1536] += 1.0
        norm = sum(v * v for v in vector) ** 0.5 or 1.0
        return [v / norm for v in vector]

    monkeypatch.setenv("ALLOW_EVAL_SEED", "true")
    monkeypatch.setattr(embedding_service, "get_embeddings", lambda texts: [embed(t) for t in texts])
    monkeypatch.setattr(embedding_service, "get_embedding", embed)
    monkeypatch.setattr(settings, "ANSWER_MODEL", "stub-model")
    monkeypatch.setattr(rag_service, "_generate_answer_ollama", lambda *args: ("Stub answer", 300))
    corpus = ev.RETRIEVAL_DIR / "corpus"
    texts = {path.name.split("-", 1)[0]: path.read_text(encoding="utf-8") for path in corpus.glob("D*.txt")}
    questions = ev.load_questions()

    def extract(path):
        return texts[path.stem]

    try:
        clean = await ev.ingest("clean", corpus, ev.RETRIEVAL_DIR / "build", ev.RETRIEVAL_DIR / "manifest.json", tmp_path, extract)
        await ev.ingest("poor", corpus, ev.RETRIEVAL_DIR / "build", ev.RETRIEVAL_DIR / "manifest.json", tmp_path, extract)
        assert len(clean) == 30 and all(row["wer"] == "0.0000" and row["chunks"] >= 1 for row in clean)
        table = ev._read_csv(tmp_path / "ingest.csv")
        assert sorted({row["profile"] for row in table}) == ["clean", "poor"] and len(table) == 60

        # Ingesting again replaces the library instead of doubling it.
        await ev.ingest("clean", corpus, ev.RETRIEVAL_DIR / "build", ev.RETRIEVAL_DIR / "manifest.json", tmp_path, extract)
        async with async_session() as db:
            user_id = await ev._user_id(db, "clean", create=False)
            count = (await db.execute(select(func.count()).select_from(Document).where(Document.user_id == user_id))).scalar_one()
        assert count == 30

        rows = await ev.run_retrieve("clean", questions, tmp_path)
        assert {row["mode"] for row in rows} == set(ev.MODES)
        assert all(row["document_id"] in texts and 1 <= row["rank"] <= 20 for row in rows)
        loaded = ev.load_rows(tmp_path / "retrieval_rows.csv")
        assert len(loaded) == len(rows) and loaded[0].keys() == rows[0].keys()
        status = ev.calibrate(loaded, questions, tmp_path)
        assert status in (0, 3) and (tmp_path / "calibration.json").exists()

        (tmp_path / "calibration.json").write_text(json.dumps({"mode": "hybrid", "chosen_floor": 0.5}), encoding="utf-8")
        with pytest.raises(RuntimeError, match="not the calibrated floor"):
            await ev.run_answers("ollama", 0.6, questions, tmp_path)
        records = await ev.run_answers("ollama", 0.5, questions, tmp_path)
        assert len(records) == 40 and {r["question_id"] for r in records} == {q["id"] for q in questions if q["split"] == "test"}
        answered = [r for r in records if r["answered"]]
        assert answered and all(r["answer"] == "Stub answer" and r["sources"] for r in answered)
        assert all(r["answer"] for r in records)
        assert len(ev._read_csv(tmp_path / "rating_sheet.csv")) == 40
        assert len(ev._read_csv(tmp_path / "rating_key.csv")) == 40
    finally:
        async with async_session() as db:
            await db.execute(delete(User).where(User.email.like("retrieval-eval-%@example.invalid")))
            await db.commit()
