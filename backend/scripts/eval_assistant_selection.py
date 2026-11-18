"""Evaluation of the assistant's tool selection (issue #5, Task 8).

Runs the 30 synthetic cases in evaluation/assistant-selection/cases.json through either the keyword router or a
local Ollama model, scores each selection deterministically and applies the decision rule in
evaluation/assistant-selection/README.md. It imports the selector code the application runs, so it measures that
code and not a copy. Selected tools are never executed.

    python scripts/eval_assistant_selection.py --selector rules --output ../evaluation/results/<date>/assistant-selection/rules
    python scripts/eval_assistant_selection.py --selector model --model <tag> --ollama-url http://localhost:11434 \
        --output ../evaluation/results/<date>/assistant-selection/<model-folder>
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import statistics
import sys
import time
from pathlib import Path
from typing import Any

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.assistant import Selection  # noqa: E402
from app.services.assistant.bills import BillRef  # noqa: E402
from app.services.assistant.model import (  # noqa: E402
    SELECTOR_OPTIONS,
    SELECTOR_SYSTEM_PROMPT,
    SELECTOR_TOOLS,
    SelectorInput,
    build_selector_request,
    parse_selection,
)
from app.services.assistant.rules import select_by_rules  # noqa: E402

# Frozen protocol constants. They are deliberately not command-line flags.
RUNS = 3
TIMEOUT_S = 60
TIMEOUT_MS = TIMEOUT_S * 1000
NUM_CTX = SELECTOR_OPTIONS["num_ctx"]
KEEP_ALIVE = "30m"
WARMUP_PROMPT = "Reply with the single word: ready"
MIN_PASS_RATE = 0.90
MAX_MEDIAN_MS = 10_000
MAX_P95_MS = 30_000

DEFAULT_CASES = Path(__file__).resolve().parents[2] / "evaluation" / "assistant-selection" / "cases.json"

CSV_COLUMNS = [
    "run_id",
    "selector",
    "model",
    "case_id",
    "category",
    "passed",
    "unsafe",
    "tool",
    "reason",
    "latency_ms",
    "prompt_tokens",
    "eval_tokens",
]

# ------------------------------------------------------------------- scoring

_SCALARS = ("count", "days_before_due", "decline_reason")


def _text_equal(actual: str | None, wanted: str | None) -> bool:
    if actual is None or wanted is None:
        return actual is None and wanted is None
    return actual.strip().casefold() == wanted.strip().casefold()


def _check(expect: dict, selection: Selection) -> str | None:
    """None when the selection matches the case, otherwise the reason it does not."""
    if selection.tool != expect["tool"]:
        return "wrong tool"
    if "document_ref" in expect:
        wanted = expect["document_ref"]
        accepted = wanted if isinstance(wanted, list) else [wanted]
        if not any(_text_equal(selection.document_ref, option) for option in accepted):
            return _mismatch("document_ref", selection.document_ref, accepted == [None])
    if "people" in expect:
        wanted_people = expect["people"]
        if not wanted_people:
            if selection.people:
                return "unexpected argument: people"
        elif len(selection.people) != len(wanted_people) or not all(
            _text_equal(a, w) for a, w in zip(selection.people, wanted_people, strict=True)
        ):
            return "wrong argument: people"
    for name in _SCALARS:
        if name in expect:
            actual = getattr(selection, name)
            if actual != expect[name]:
                return _mismatch(name, actual, expect[name] is None)
    if "topic" in expect and expect["topic"] is None and selection.topic is not None:
        return "unexpected argument: topic"
    if "topic_contains" in expect and (
        selection.topic is None or expect["topic_contains"].casefold() not in selection.topic.casefold()
    ):
        return "wrong argument: topic"
    return None


def _mismatch(name: str, actual: Any, expected_absent: bool) -> str:
    return f"unexpected argument: {name}" if expected_absent and actual is not None else f"wrong argument: {name}"


def score_selection(case: dict, selection: Selection | None, reason: str | None) -> dict:
    """Classify one selection. Never raises: no selection is a failed row carrying the selector's reason."""
    if selection is None:
        return {"passed": False, "unsafe": False, "reason": reason or "no selection"}
    try:
        failure = _check(case["expect"], selection)
    except Exception as error:  # noqa: BLE001 - an odd selection must not stop the run
        return {"passed": False, "unsafe": False, "reason": f"unscorable selection: {type(error).__name__}"}
    unsafe = selection.tool in case["expect"].get("unsafe_tools", [])
    return {"passed": failure is None, "unsafe": unsafe, "reason": failure or "ok"}


# ------------------------------------------------------------------- summary


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[max(math.ceil(fraction * len(ordered)), 1) - 1]


def summarise(rows: list[dict]) -> dict:
    latencies = [r["latency_ms"] for r in rows]
    summary = {
        "rows": len(rows),
        "pass_rate": sum(1 for r in rows if r["passed"]) / len(rows) if rows else 0.0,
        "unsafe_count": sum(1 for r in rows if r.get("unsafe")),
        "timeout_count": sum(1 for r in rows if r["reason"] == "timeout"),
        "invalid_count": sum(1 for r in rows if r["reason"] == "context truncated"),
        "latency_ms_median": statistics.median(latencies) if latencies else None,
        "latency_ms_p95": _percentile(latencies, 0.95) if latencies else None,
    }
    summary["feasible"] = bool(
        rows
        and summary["unsafe_count"] == 0
        and summary["pass_rate"] >= MIN_PASS_RATE
        and summary["latency_ms_median"] <= MAX_MEDIAN_MS
        and summary["latency_ms_p95"] <= MAX_P95_MS
        and summary["invalid_count"] == 0
    )
    return summary


# -------------------------------------------------------------------- inputs


def _selector_input(case: dict, data: dict) -> SelectorInput:
    return SelectorInput(
        question=case["question"],
        history=[(role, text) for role, text in case.get("history", [])],
        bills=[(ref, title) for ref, title in data["bills"][case["bills"]]],
        focus_ref=case.get("focus_ref"),
        housemates=data["housemates"],
    )


def build_case_request(model: str, case: dict, data: dict) -> dict:
    """The exact request the application sends for this input."""
    return build_selector_request(model, _selector_input(case, data))


def _row(run_id: int, selector: str, model: str | None, case: dict, result: dict, tool: str | None, latency_ms: int) -> dict:
    return {
        "run_id": run_id,
        "selector": selector,
        "model": model,
        "case_id": case["id"],
        "category": case["category"],
        **result,
        "tool": tool,
        "latency_ms": latency_ms,
        "prompt_tokens": None,
        "eval_tokens": None,
    }


# ------------------------------------------------------------------- selectors


def run_rules(data: dict, run_id: int = 1) -> list[dict]:
    """One pass of the keyword router over every case."""
    rows = []
    for case in data["cases"]:
        bills = [BillRef(ref=ref, document=None, title=title) for ref, title in data["bills"][case["bills"]]]
        started = time.perf_counter()
        selection = select_by_rules(case["question"], bills, data["housemates"])
        latency_ms = round((time.perf_counter() - started) * 1000)
        rows.append(_row(run_id, "rules", None, case, score_selection(case, selection, None), selection.tool, latency_ms))
    return rows


def measure_model_row(
    client: httpx.Client, url: str, model: str, case: dict, data: dict, run_id: int, think: bool | None
) -> tuple[dict, dict]:
    """Send one case and return (csv row, raw reply record). Timeouts and errors become failed rows."""
    payload = build_case_request(model, case, data)
    if think is None:
        payload.pop("think", None)
    message, body, error = None, {}, None
    started = time.perf_counter()
    try:
        response = client.post(f"{url}/api/chat", json=payload, timeout=TIMEOUT_S)
        response.raise_for_status()
        body = response.json()
        message = body.get("message") if isinstance(body, dict) else None
    except httpx.TimeoutException:
        error = "timeout"
    except Exception as exc:  # noqa: BLE001 - recorded, not retried
        error = f"error: {type(exc).__name__}"
    latency_ms = TIMEOUT_MS if error == "timeout" else round((time.perf_counter() - started) * 1000)
    selection, reason = (None, error) if error else parse_selection(message)
    result = score_selection(case, selection, reason)
    prompt_tokens = body.get("prompt_eval_count") if isinstance(body, dict) else None
    if not error and isinstance(prompt_tokens, int) and prompt_tokens >= NUM_CTX:
        result.update(passed=False, unsafe=False, reason="context truncated")
    row = _row(run_id, "model", model, case, result, selection.tool if selection else None, latency_ms)
    row["prompt_tokens"] = prompt_tokens
    row["eval_tokens"] = body.get("eval_count") if isinstance(body, dict) else None
    raw = {
        "run_id": run_id,
        "case_id": case["id"],
        "content": message.get("content") if isinstance(message, dict) else None,
        "thinking": message.get("thinking") if isinstance(message, dict) else None,
        "tool_calls": message.get("tool_calls") if isinstance(message, dict) else None,
        "error": error,
    }
    return row, raw


def _unload_others(client: httpx.Client, url: str, model: str) -> list[str]:
    stopped = []
    for loaded in client.get(f"{url}/api/ps", timeout=TIMEOUT_S).json().get("models", []):
        if loaded.get("name") != model and loaded.get("model") != model:
            client.post(f"{url}/api/chat", json={"model": loaded["name"], "keep_alive": 0}, timeout=TIMEOUT_S)
            stopped.append(loaded["name"])
    return stopped


def _warm_up(client: httpx.Client, url: str, model: str) -> tuple[bool, int, bool | None]:
    """Return (think_accepted, warm-up latency in ms, think value to send)."""
    think: bool | None = False
    accepted = True
    for _ in range(2):
        payload: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "user", "content": WARMUP_PROMPT}],
            "stream": False,
            "options": dict(SELECTOR_OPTIONS),
            "keep_alive": KEEP_ALIVE,
        }
        if think is not None:
            payload["think"] = think
        started = time.perf_counter()
        response = client.post(f"{url}/api/chat", json=payload, timeout=TIMEOUT_S)
        latency = round((time.perf_counter() - started) * 1000)
        if response.status_code == 400 and think is not None and "think" in response.text.lower():
            think, accepted = None, False
            continue
        response.raise_for_status()
        return accepted, latency, think
    raise RuntimeError("warm-up failed")


def _model_facts(client: httpx.Client, url: str, model: str) -> dict:
    facts: dict[str, Any] = {"ollama_version": client.get(f"{url}/api/version", timeout=TIMEOUT_S).json().get("version")}
    for entry in client.get(f"{url}/api/tags", timeout=TIMEOUT_S).json().get("models", []):
        if model in (entry.get("name"), entry.get("model")):
            facts["digest"] = entry.get("digest")
            facts["quantization"] = (entry.get("details") or {}).get("quantization_level")
            facts["parameter_size"] = (entry.get("details") or {}).get("parameter_size")
    for loaded in client.get(f"{url}/api/ps", timeout=TIMEOUT_S).json().get("models", []):
        if model in (loaded.get("name"), loaded.get("model")):
            size, vram = loaded.get("size") or 0, loaded.get("size_vram") or 0
            facts["size_bytes"] = size
            facts["size_vram_bytes"] = vram
            facts["gpu_percent"] = round(100 * vram / size) if size else None
            facts["context_length"] = loaded.get("context_length")
    return facts


# ------------------------------------------------------------------- the run


def _write(output: Path, rows: list[dict], raws: list[dict], summary: dict) -> None:
    output.mkdir(parents=True, exist_ok=True)
    with (output / "results.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    with (output / "replies.jsonl").open("w", encoding="utf-8") as handle:
        for raw in raws:
            handle.write(json.dumps(raw, ensure_ascii=False) + "\n")
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _failed(rows: list[dict]) -> list[str]:
    return [f"run {r['run_id']} {r['case_id']}: {r['reason']}" for r in rows if not r["passed"]]


def run(selector: str, output: Path, model: str | None = None, url: str | None = None, cases_path: Path = DEFAULT_CASES) -> dict:
    data = json.loads(cases_path.read_text(encoding="utf-8"))
    rows: list[dict] = []
    raws: list[dict] = []
    extra: dict[str, Any] = {}
    if selector == "rules":
        for run_id in range(1, RUNS + 1):
            rows += run_rules(data, run_id)
        raws = [{"run_id": r["run_id"], "case_id": r["case_id"], "tool": r["tool"]} for r in rows]
    else:
        assert model and url, "a model tag and an Ollama URL are required"
        url = url.rstrip("/")
        with httpx.Client() as client:
            stopped = _unload_others(client, url, model)
            think_accepted, warmup_ms, think = _warm_up(client, url, model)
            extra = {
                "warmup_latency_ms": warmup_ms,
                "other_models_stopped": stopped,
                "think_accepted": think_accepted,
                "think_sent": think,
                **_model_facts(client, url, model),
            }
            for run_id in range(1, RUNS + 1):
                for case in data["cases"]:
                    row, raw = measure_model_row(client, url, model, case, data, run_id, think)
                    rows.append(row)
                    raws.append(raw)
                    print(f"run {run_id} {case['id']:>3} {'PASS' if row['passed'] else 'FAIL'} {row['latency_ms']:>6} ms {row['reason']}")
    summary = {
        "selector": selector,
        "model": model,
        **summarise(rows),
        "failed_rows": _failed(rows),
        **extra,
        "settings": {
            "runs": RUNS,
            "cases": len(data["cases"]),
            "timeout_s": TIMEOUT_S,
            "keep_alive": KEEP_ALIVE,
            **({**SELECTOR_OPTIONS, "stream": False} if selector == "model" else {}),
        },
        "system_prompt_sha256": _sha256(SELECTOR_SYSTEM_PROMPT),
        "tools_sha256": _sha256(json.dumps(SELECTOR_TOOLS, sort_keys=True)),
    }
    _write(output, rows, raws, summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--selector", required=True, choices=["rules", "model"])
    parser.add_argument("--model")
    parser.add_argument("--ollama-url", default="http://localhost:11434")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.selector == "model" and not args.model:
        parser.error("--model is required with --selector model")
    summary = run(args.selector, args.output, model=args.model, url=args.ollama_url)
    print(json.dumps({k: v for k, v in summary.items() if k != "failed_rows"}, indent=2))


if __name__ == "__main__":
    main()

