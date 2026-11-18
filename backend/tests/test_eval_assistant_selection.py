"""Unit tests for the assistant tool-selection evaluation scorer and runner (issue #5, Task 8)."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from app.schemas.assistant import TOOLS, Selection

ROOT = Path(__file__).resolve().parents[2]
CASES_PATH = ROOT / "evaluation" / "assistant-selection" / "cases.json"
SCRIPT_PATH = ROOT / "backend" / "scripts" / "eval_assistant_selection.py"

_spec = importlib.util.spec_from_file_location("eval_assistant_selection", SCRIPT_PATH)
ev = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ev)

DATA = json.loads(CASES_PATH.read_text(encoding="utf-8"))
CASES = {case["id"]: case for case in DATA["cases"]}


def sel(tool: str, **arguments) -> Selection:
    return Selection(tool=tool, **arguments)


def test_a_matching_selection_passes():
    result = ev.score_selection(CASES["R1"], sel("propose_reminder", days_before_due=2), None)
    assert result["passed"] is True
    assert result["unsafe"] is False


def test_wrong_tool_and_wrong_arguments_fail_with_a_reason():
    assert ev.score_selection(CASES["R1"], sel("get_bill_facts"), None)["reason"] == "wrong tool"
    assert (
        ev.score_selection(CASES["R1"], sel("propose_reminder", days_before_due=3), None)["reason"]
        == "wrong argument: days_before_due"
    )
    assert (
        ev.score_selection(CASES["S1"], sel("split_bill", people=["Person 1"]), None)["reason"]
        == "unexpected argument: people"
    )
    assert (
        ev.score_selection(CASES["R3"], sel("propose_reminder", days_before_due=2), None)["reason"]
        == "unexpected argument: days_before_due"
    )


def test_arguments_are_compared_as_the_case_defines_them():
    two = ev.score_selection(CASES["S2"], sel("split_bill", people=["ben", "AOIFE"]), None)
    assert two["passed"] is False and two["reason"] == "wrong argument: people"  # order matters
    assert ev.score_selection(CASES["S2"], sel("split_bill", people=["aoife", "BEN"]), None)["passed"] is True
    assert ev.score_selection(CASES["E1"], sel("draft_enquiry", topic="The Standing Charge"), None)["passed"] is True
    assert ev.score_selection(CASES["E1"], sel("draft_enquiry"), None)["reason"] == "wrong argument: topic"
    # "bill-1 or absent" accepts both and rejects another bill.
    for ref in ("bill-1", None):
        assert ev.score_selection(CASES["C1"], sel("propose_reminder", days_before_due=2, document_ref=ref), None)["passed"]
    other = ev.score_selection(CASES["C1"], sel("propose_reminder", days_before_due=2, document_ref="bill-2"), None)
    assert other["reason"] == "wrong argument: document_ref"


def test_an_action_on_an_unsupported_request_is_unsafe():
    acted = ev.score_selection(CASES["D1"], sel("propose_reminder"), None)
    assert acted["passed"] is False and acted["unsafe"] is True
    answered = ev.score_selection(CASES["D1"], sel("answer_from_documents"), None)
    assert answered["passed"] is False and answered["unsafe"] is False


def test_no_selection_is_a_failed_row():
    result = ev.score_selection(CASES["F1"], None, "timeout")
    assert result == {"passed": False, "unsafe": False, "reason": "timeout"}


def _rows(passed: int, total: int, latency: int, unsafe: int = 0) -> list[dict]:
    return [
        {"passed": i < passed, "unsafe": i < unsafe, "reason": "ok" if i < passed else "wrong tool", "latency_ms": latency}
        for i in range(total)
    ]


def test_summary_applies_the_decision_rule():
    assert ev.summarise(_rows(100, 100, 9000, unsafe=1))["feasible"] is False
    good = _rows(100, 100, 9000)
    for row in good[:6]:
        row["latency_ms"] = 29000  # nearest-rank p95 of 100 rows is the 95th value: 29000
    summary = ev.summarise(good)
    assert summary["latency_ms_p95"] == 29000
    assert summary["feasible"] is True
    assert summary["pass_rate"] == 1.0 and summary["latency_ms_median"] == 9000
    slow = _rows(100, 100, 9000)
    for row in slow[:10]:
        row["latency_ms"] = 31000
    assert ev.summarise(slow)["feasible"] is False
    assert ev.summarise(_rows(89, 100, 1000))["feasible"] is False
    assert ev.summarise(_rows(90, 100, 1000))["feasible"] is True
    timeouts = _rows(100, 100, 1000)
    timeouts[0].update(passed=False, reason="timeout", latency_ms=60000)
    assert ev.summarise(timeouts)["timeout_count"] == 1


def test_cases_file_is_well_formed():
    ids = [case["id"] for case in DATA["cases"]]
    assert len(ids) == 30 and len(set(ids)) == 30
    for case in DATA["cases"]:
        assert case["expect"]["tool"] in TOOLS
        assert case["bills"] in DATA["bills"]
        for tool in case["expect"].get("unsafe_tools", []):
            assert tool in TOOLS


def test_the_keyword_router_result_is_recorded_not_assumed():
    rows = ev.run_rules(DATA)
    assert len(rows) == 30
    for row in rows:
        assert set(row) >= {"case_id", "passed", "unsafe", "reason", "latency_ms"}
        assert isinstance(row["passed"], bool)


def test_the_model_request_is_the_one_the_application_sends():
    case = CASES["C1"]
    payload = ev.build_case_request("m", case, DATA)
    assert payload["model"] == "m" and payload["stream"] is False and payload["think"] is False
    assert payload["options"] == ev.SELECTOR_OPTIONS
    texts = [m["content"] for m in payload["messages"]]
    assert texts[0].startswith(ev.SELECTOR_SYSTEM_PROMPT)
    assert '"current_bill": "bill-1"' in texts[0]
    assert texts[1:] == ["How much is the October bill?", "[bill_facts for bill-1]", case["question"]]
