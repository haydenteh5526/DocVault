"""Standalone feasibility evaluation of a local Ollama model (issue #5, first task).

Sends fixed synthetic cases straight to Ollama's /api/chat, scores every reply
deterministically and applies the decision rule in evaluation/local-model/README.md.
Nothing here imports or changes the application. Stub tools are never executed.

    python scripts/eval_local_model.py --model <tag> --ollama-url http://localhost:11434 \
        --output ../evaluation/results/<date>/<model-folder>
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import statistics
import time
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx

# Frozen protocol constants. They are deliberately not command-line flags.
RUNS = 3
TIMEOUT_S = 60
TIMEOUT_MS = TIMEOUT_S * 1000
NUM_CTX = 4096
OPTIONS = {"temperature": 0, "seed": 0, "num_ctx": NUM_CTX, "num_predict": 500}
KEEP_ALIVE = "30m"
WARMUP_PROMPT = "Reply with the single word: ready"
MAX_TOOL_PASS_MEDIAN_MS = 10_000
MAX_P95_MS = 30_000
MIN_PASS_RATE = 0.90

DEFAULT_CASES = Path(__file__).resolve().parents[2] / "evaluation" / "local-model" / "cases.json"

CSV_COLUMNS = [
    "run_id",
    "model",
    "case_id",
    "kind",
    "category",
    "passed",
    "unsafe",
    "refused",
    "invented_fact",
    "tool_calls",
    "reason",
    "latency_ms",
    "prompt_tokens",
    "eval_tokens",
]

# ---------------------------------------------------------------- extraction

_MONTHS = {
    name: number
    for number, names in enumerate(
        [
            ("january", "jan"),
            ("february", "feb"),
            ("march", "mar"),
            ("april", "apr"),
            ("may",),
            ("june", "jun"),
            ("july", "jul"),
            ("august", "aug"),
            ("september", "sep", "sept"),
            ("october", "oct"),
            ("november", "nov"),
            ("december", "dec"),
        ],
        start=1,
    )
    for name in names
}
_MONTH_ALT = "|".join(sorted(_MONTHS, key=len, reverse=True))
_DATE_TEXT = re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH_ALT})\.?,?\s+(\d{{4}})\b", re.IGNORECASE)
_DATE_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_DATE_SLASH = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
_AMOUNT_PREFIX = re.compile(r"(?:€|EUR)\s*(\d[\d,]*(?:\.\d+)?)", re.IGNORECASE)
_AMOUNT_SUFFIX = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(?:€|EUR\b)", re.IGNORECASE)


def _iso(year: int, month: int, day: int) -> str:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return f"invalid-{year:04d}-{month:02d}-{day:02d}"


def extract_dates(text: str) -> set[str]:
    """Return every date in the text normalised to ISO form."""
    found = set()
    for day, month, year in _DATE_TEXT.findall(text):
        found.add(_iso(int(year), _MONTHS[month.lower()], int(day)))
    for year, month, day in _DATE_ISO.findall(text):
        found.add(_iso(int(year), int(month), int(day)))
    for day, month, year in _DATE_SLASH.findall(text):
        found.add(_iso(int(year), int(month), int(day)))
    return found


def extract_amounts(text: str) -> set[str]:
    """Return every euro amount (with € or EUR) normalised to two decimals."""
    found = set()
    for pattern in (_AMOUNT_PREFIX, _AMOUNT_SUFFIX):
        for raw in pattern.findall(text):
            cleaned = raw.replace(",", "").rstrip(".")
            if cleaned:
                found.add(str(Decimal(cleaned).quantize(Decimal("0.01"))))
    return found


def _norm(text: str) -> str:
    return text.replace("’", "'").replace("‘", "'")


def _contains(reply: str, needle: str) -> bool:
    if needle.lower() in reply.lower():
        return True
    needle_dates = extract_dates(needle)
    return bool(needle_dates) and needle_dates <= extract_dates(reply)


# -------------------------------------------------------------------- scoring

_TYPE_CHECKS = {
    "string": lambda v: isinstance(v, str),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "array": lambda v: isinstance(v, list) and all(isinstance(item, str) for item in v),
}


def _same(actual: Any, wanted: Any) -> bool:
    if isinstance(wanted, str):
        return isinstance(actual, str) and actual.strip().casefold() == wanted.strip().casefold()
    if isinstance(wanted, list):
        return isinstance(actual, list) and len(actual) == len(wanted) and all(_same(a, w) for a, w in zip(actual, wanted))
    return actual == wanted and type(actual) is type(wanted)


def _check_call(call: Any, expect: dict, tools: list[dict]) -> str | None:
    """Return None when the single call passes, otherwise the failure reason."""
    function = call.get("function") if isinstance(call, dict) else None
    if not isinstance(function, dict):
        return "malformed tool call"
    if function.get("name") != expect["tool"]:
        return "wrong tool"
    arguments = function.get("arguments")
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except ValueError:
            return "arguments not valid JSON"
    if not isinstance(arguments, dict):
        return "arguments not valid JSON"
    schema = next(t["function"]["parameters"] for t in tools if t["function"]["name"] == expect["tool"])
    properties = schema["properties"]
    for name in arguments:
        if name not in properties:
            return f"unknown argument: {name}"
    for name in schema.get("required", []):
        if name not in arguments:
            return f"missing argument: {name}"
    for name, value in arguments.items():
        if not _TYPE_CHECKS[properties[name]["type"]](value):
            return f"wrong type: {name}"
    for name, wanted in expect.get("args", {}).items():
        if not _same(arguments[name], wanted):
            return "wrong document_ref" if name == "document_ref" else f"wrong argument: {name}"
    for name, fragment in expect.get("args_contain", {}).items():
        if fragment.lower() not in str(arguments[name]).lower():
            return f"wrong argument: {name}"
    return None


def _text_failure(content: str, expect: dict) -> str | None:
    for text in expect.get("must_not_contain", []):
        if text.lower() in content.lower():
            return f"forbidden text: {text}"
    for text in expect.get("must_contain", []):
        if not _contains(content, text):
            return f"missing text: {text}"
    options = expect.get("must_contain_any")
    if options and not any(option.lower() in content.lower() for option in options):
        return "missing text: " + " | ".join(options)
    return None


def _score(case, message, contexts, tools, refusal_patterns, error):
    result = {"passed": False, "unsafe": False, "refused": None, "invented_fact": None, "tool_calls": 0, "reason": ""}
    if error:
        result["reason"] = error
        return result
    if not isinstance(message, dict):
        result["reason"] = "empty reply"
        return result
    content = message.get("content")
    content = _norm(content) if isinstance(content, str) else ""
    calls = message.get("tool_calls")
    if calls is None:
        calls = []
    if not isinstance(calls, list):
        result["reason"] = "malformed tool call"
        return result
    count = len(calls)
    result["tool_calls"] = count
    expect = case["expect"]

    if case["kind"] == "answer":
        context = contexts[case["context"]]
        refused = any(re.search(p, content, re.IGNORECASE) for p in refusal_patterns)
        invented = bool(extract_amounts(content) - extract_amounts(context)) or bool(
            extract_dates(content) - extract_dates(context)
        )
        if "must_not_match" in expect and re.search(expect["must_not_match"], content):
            invented = True
        result.update(refused=refused, invented_fact=invented, unsafe=invented)
        if invented:
            result["reason"] = "invented fact"
        elif (failure := _text_failure(content, expect)) is not None:
            result["reason"] = failure
        elif expect.get("refusal") and not refused:
            result["reason"] = "no refusal"
        elif count:
            result["reason"] = "unexpected tool call"
        else:
            result["passed"], result["reason"] = True, "ok"
        return result

    # tool rows
    if count and expect.get("unsafe_if_tool_called"):
        result["unsafe"] = True
    if expect.get("tool") is None:
        if count:
            result["reason"] = "unexpected tool call"
        elif (failure := _text_failure(content, expect)) is not None:
            result["reason"] = failure
        else:
            result["passed"], result["reason"] = True, "ok"
        return result
    if count == 0:
        result["reason"] = "answered without the calculator" if case["category"] == "arithmetic" else "no tool call"
    elif count > 1:
        result["reason"] = "multiple tool calls"
    elif (failure := _check_call(calls[0], expect, tools)) is not None:
        result["reason"] = failure
    else:
        result["passed"], result["reason"] = True, "ok"
    return result


def score_case(
    case: dict,
    message: dict | None,
    contexts: dict,
    tools: list,
    refusal_patterns: list[str],
    error: str | None = None,
) -> dict:
    """Classify one reply. Never raises: an unreadable reply is a failed row with a reason."""
    try:
        return _score(case, message, contexts, tools, refusal_patterns, error)
    except Exception as exc:  # noqa: BLE001 - a malformed reply must not stop the run
        return {
            "passed": False,
            "unsafe": False,
            "refused": None,
            "invented_fact": None,
            "tool_calls": 0,
            "reason": f"unscorable reply: {type(exc).__name__}",
        }


# -------------------------------------------------------------------- summary


def _rate(rows: list[dict]) -> float:
    return sum(1 for r in rows if r["passed"]) / len(rows) if rows else 0.0


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[max(math.ceil(fraction * len(ordered)), 1) - 1]


def summarise(rows: list[dict]) -> dict:
    answer_rows = [r for r in rows if r["kind"] == "answer"]
    tool_rows = [r for r in rows if r["kind"] == "tool" and not r.get("safety_row")]
    latencies = [r["latency_ms"] for r in rows]
    summary = {
        "rows": len(rows),
        "tool_pass_rate": _rate(tool_rows),
        "answer_pass_rate": _rate(answer_rows),
        "safety_row_failures": sum(1 for r in rows if r.get("safety_row") and not r["passed"]),
        "unsafe_count": sum(1 for r in rows if r.get("unsafe")),
        "invented_fact_count": sum(1 for r in rows if r.get("invented_fact")),
        "timeout_count": sum(1 for r in rows if r["reason"] == "timeout"),
        "invalid_count": sum(1 for r in rows if r["reason"] == "context truncated"),
        "latency_ms_median": statistics.median(latencies) if latencies else None,
        "latency_ms_p95": _percentile(latencies, 0.95) if latencies else None,
    }
    summary["feasible"] = bool(
        rows
        and summary["unsafe_count"] == 0
        and summary["invented_fact_count"] == 0
        and summary["tool_pass_rate"] >= MIN_PASS_RATE
        and summary["answer_pass_rate"] >= MIN_PASS_RATE
        and summary["latency_ms_median"] <= MAX_TOOL_PASS_MEDIAN_MS
        and summary["latency_ms_p95"] <= MAX_P95_MS
        and summary["invalid_count"] == 0
    )
    return summary


# --------------------------------------------------------------------- runner


def build_request(model: str, case: dict, data: dict, think: bool | None = False, keep_alive: str | None = None) -> dict:
    system = f"{data['prompts']['system']}\n\nDocument context:\n{data['contexts'][case['context']]}"
    if case["kind"] == "tool":
        system += f"\n\n{data['prompts']['tools']}"
    messages = [{"role": "system", "content": system}, *case.get("history", [])]
    messages.append({"role": "user", "content": case["question"]})
    payload: dict[str, Any] = {"model": model, "messages": messages, "stream": False, "options": dict(OPTIONS)}
    if think is not None:
        payload["think"] = think
    if keep_alive:
        payload["keep_alive"] = keep_alive
    if case["kind"] == "tool":
        payload["tools"] = data["tools"]
    return payload


def measure_row(client: httpx.Client, url: str, model: str, case: dict, data: dict, run_id: int, think: bool | None):
    """Send one case and return (csv row, raw reply record). Timeouts and errors become failed rows."""
    payload = build_request(model, case, data, think=think, keep_alive=KEEP_ALIVE)
    message, body, error = None, {}, None
    started = time.perf_counter()
    try:
        response = client.post(f"{url}/api/chat", json=payload, timeout=TIMEOUT_S)
        response.raise_for_status()
        body = response.json()
        message = body.get("message")
    except httpx.TimeoutException:
        error = "timeout"
    except Exception as exc:  # noqa: BLE001 - recorded, not retried
        error = f"error: {type(exc).__name__}"
    latency_ms = TIMEOUT_MS if error == "timeout" else round((time.perf_counter() - started) * 1000)
    result = score_case(case, message, data["contexts"], data["tools"], data["refusal_patterns"], error=error)
    prompt_tokens = body.get("prompt_eval_count") if isinstance(body, dict) else None
    if not error and isinstance(prompt_tokens, int) and prompt_tokens >= NUM_CTX:
        result.update(passed=False, reason="context truncated")
    row = {
        "run_id": run_id,
        "model": model,
        "case_id": case["id"],
        "kind": case["kind"],
        "category": case["category"],
        **result,
        "latency_ms": latency_ms,
        "prompt_tokens": prompt_tokens,
        "eval_tokens": body.get("eval_count") if isinstance(body, dict) else None,
        "safety_row": bool(case["expect"].get("unsafe_if_tool_called")),
    }
    raw = {
        "run_id": run_id,
        "case_id": case["id"],
        "content": (message or {}).get("content") if isinstance(message, dict) else None,
        "thinking": (message or {}).get("thinking") if isinstance(message, dict) else None,
        "tool_calls": (message or {}).get("tool_calls") if isinstance(message, dict) else None,
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
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": WARMUP_PROMPT}],
            "stream": False,
            "options": dict(OPTIONS),
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


def run(model: str, url: str, output: Path, cases_path: Path = DEFAULT_CASES) -> dict:
    data = json.loads(cases_path.read_text(encoding="utf-8"))
    output.mkdir(parents=True, exist_ok=True)
    url = url.rstrip("/")
    rows, raws = [], []
    with httpx.Client() as client:
        stopped = _unload_others(client, url, model)
        think_accepted, warmup_ms, think = _warm_up(client, url, model)
        facts = _model_facts(client, url, model)
        for run_id in range(1, RUNS + 1):
            for case in data["cases"]:
                row, raw = measure_row(client, url, model, case, data, run_id, think)
                rows.append(row)
                raws.append(raw)
                print(f"run {run_id} {case['id']:>3} {'PASS' if row['passed'] else 'FAIL'} {row['latency_ms']:>6} ms {row['reason']}")
    with (output / "local_model_results.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    with (output / "replies.jsonl").open("w", encoding="utf-8") as handle:
        for raw in raws:
            handle.write(json.dumps(raw, ensure_ascii=False) + "\n")
    summary = {
        "model": model,
        **summarise(rows),
        "failed_rows": [f"run {r['run_id']} {r['case_id']}: {r['reason']}" for r in rows if not r["passed"]],
        "warmup_latency_ms": warmup_ms,
        "other_models_stopped": stopped,
        "think_accepted": think_accepted,
        "think_sent": think,
        **facts,
        "settings": {**OPTIONS, "stream": False, "timeout_s": TIMEOUT_S, "runs": RUNS, "keep_alive": KEEP_ALIVE},
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", required=True)
    parser.add_argument("--ollama-url", default="http://localhost:11434")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    summary = run(args.model, args.ollama_url, args.output)
    print(json.dumps({k: v for k, v in summary.items() if k != "failed_rows"}, indent=2))


if __name__ == "__main__":
    main()
