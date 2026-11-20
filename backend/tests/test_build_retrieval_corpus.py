"""The synthetic retrieval corpus: how it is rendered, listed and questioned (issue 33, Task 3)."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
RETRIEVAL = ROOT / "evaluation" / "retrieval"
CORPUS = RETRIEVAL / "corpus"
SCRIPT_PATH = ROOT / "backend" / "scripts" / "build_retrieval_corpus.py"

_spec = importlib.util.spec_from_file_location("build_retrieval_corpus", SCRIPT_PATH)
builder = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(builder)

POOR_SCANS = {"D02", "D07", "D09", "D12", "D16", "D17", "D20", "D22", "D25", "D28"}
SEED = 20261120


def _document_id(path: Path) -> str:
    return path.name.split("-", 1)[0]


def _normal(text: str) -> str:
    return " ".join(text.lower().split())


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_corpus_build_is_deterministic(tmp_path):
    first = builder.build(CORPUS, tmp_path / "first", SEED)
    second = builder.build(CORPUS, tmp_path / "second", SEED)

    assert [(e["document_id"], e["profile"], e["sha256"]) for e in first] == [
        (e["document_id"], e["profile"], e["sha256"]) for e in second
    ]
    for entry in first:
        assert _digest(tmp_path / "first" / entry["path"]) == entry["sha256"]
        assert _digest(tmp_path / "second" / entry["path"]) == entry["sha256"]


def test_a_different_seed_changes_only_the_poor_scans(tmp_path):
    base = {(e["document_id"], e["profile"]): e["sha256"] for e in builder.build(CORPUS, tmp_path / "a", SEED)}
    other = {(e["document_id"], e["profile"]): e["sha256"] for e in builder.build(CORPUS, tmp_path / "b", SEED + 1)}

    assert all(base[key] == other[key] for key in base if key[1] == "clean")
    assert all(base[key] != other[key] for key in base if key[1] == "poor")


def test_pages_have_the_frozen_size_and_the_poor_profile_is_degraded(tmp_path):
    from PIL import Image

    entries = builder.build(CORPUS, tmp_path, SEED)
    by_key = {(e["document_id"], e["profile"]): e for e in entries}

    clean = Image.open(tmp_path / by_key[("D02", "clean")]["path"])
    poor = Image.open(tmp_path / by_key[("D02", "poor")]["path"])
    assert clean.size == (1654, 2339) and poor.size == (1654, 2339)
    assert by_key[("D02", "clean")]["path"] == "clean/D02.png"
    assert by_key[("D02", "poor")]["path"] == "poor/D02.jpg"
    assert clean.convert("L").getextrema() == (0, 255)
    # Contrast is cut to 55% around mid-grey, then brightened, so pure black is gone.
    assert poor.convert("L").getextrema()[0] > 40


def test_the_poor_profile_keeps_the_text_inside_the_page(tmp_path):
    long_text = "Title: Long page\n" + "\n".join(f"Line {i} " + "x" * 70 for i in range(2, 61)) + "\n"
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    (corpus / "D02-long.txt").write_text(long_text, encoding="utf-8")

    entries = builder.build(corpus, tmp_path / "out", SEED)

    assert {(e["document_id"], e["profile"]) for e in entries} == {("D02", "clean"), ("D02", "poor")}


def test_manifest_matches_corpus():
    manifest = json.loads((RETRIEVAL / "manifest.json").read_text(encoding="utf-8"))
    files = sorted(CORPUS.glob("D*.txt"))
    assert len(files) == 30

    entries = manifest["files"]
    clean = [e for e in entries if e["profile"] == "clean"]
    poor = [e for e in entries if e["profile"] == "poor"]
    assert sorted(e["document_id"] for e in clean) == [_document_id(p) for p in files]
    assert {e["document_id"] for e in poor} == POOR_SCANS and len(poor) == 10
    assert len(entries) == 40
    for path in files:
        first_line = path.read_text(encoding="utf-8").splitlines()[0]
        entry = next(e for e in clean if e["document_id"] == _document_id(path))
        assert first_line == f"Title: {entry['title']}"
    assert all(re.fullmatch(r"[0-9a-f]{64}", e["sha256"]) for e in entries)
    assert manifest["seed"] == SEED


def test_corpus_files_fit_one_page_and_hold_nothing_real():
    for path in sorted(CORPUS.glob("D*.txt")):
        text = path.read_text(encoding="utf-8")
        lines = text.splitlines()
        assert lines[0].startswith("Title: "), path.name
        assert len(lines) <= 60, path.name
        assert max(len(line) for line in lines) <= 80, path.name
        assert text.isascii(), path.name
        lowered = text.lower()
        assert "@" not in text, f"{path.name} has an email address"
        assert "eircode" not in lowered, path.name


def _questions():
    return json.loads((RETRIEVAL / "questions.json").read_text(encoding="utf-8"))


def _documents():
    return {_document_id(p): _normal(p.read_text(encoding="utf-8")) for p in CORPUS.glob("D*.txt")}


def test_questions_file_is_well_formed():
    data = _questions()
    questions = data["questions"]
    documents = _documents()

    assert data["version"] == 1
    assert [q["id"] for q in questions] == [f"Q{i:02d}" for i in range(1, 61)]

    counts = {}
    for q in questions:
        assert set(q) - {"note"} == {"id", "split", "category", "question", "relevant", "answer_key", "expected_answer"}
        assert q["split"] in {"calibration", "test"}
        assert q["category"] in {"exact", "paraphrase", "confuser", "cross_document", "unanswerable"}
        counts[(q["category"], q["split"])] = counts.get((q["category"], q["split"]), 0) + 1
        assert all(doc in documents for doc in q["relevant"]), q["id"]
        assert q["question"].endswith("?") and q["expected_answer"]
        if q["category"] == "unanswerable":
            assert q["relevant"] == [] and q["answer_key"] is None, q["id"]
            assert q["expected_answer"] == "Not in the documents"
        else:
            assert q["relevant"] and q["answer_key"], q["id"]
            assert any(_normal(q["answer_key"]) in documents[doc] for doc in q["relevant"]), q["id"]
        if q["category"] == "cross_document":
            assert len(q["relevant"]) >= 2, q["id"]

    assert counts == {
        ("exact", "calibration"): 3, ("exact", "test"): 9,
        ("paraphrase", "calibration"): 3, ("paraphrase", "test"): 9,
        ("confuser", "calibration"): 2, ("confuser", "test"): 6,
        ("cross_document", "calibration"): 2, ("cross_document", "test"): 6,
        ("unanswerable", "calibration"): 10, ("unanswerable", "test"): 10,
    }
    assert sum(1 for q in questions if q["split"] == "calibration") == 20


def test_questions_about_poor_scans_are_all_held_out():
    questions = _questions()["questions"]
    about_poor = [q for q in questions if set(q["relevant"]) & POOR_SCANS]

    assert len(about_poor) >= 12
    assert all(q["split"] == "test" for q in about_poor)


def test_question_texts_are_unique():
    texts = [q["question"] for q in _questions()["questions"]]
    assert len(set(texts)) == 60


@pytest.mark.parametrize("name", ["D12-guarantee-washer-dryer-wd8", "D13-guarantee-desk-lamp"])
def test_the_washer_dryer_and_desk_lamp_cards_share_their_wording(name):
    text = (CORPUS / f"{name}.txt").read_text(encoding="utf-8")
    assert "This guarantee covers defects in materials and workmanship under normal" in text
    assert "guarantee does not cover accidental damage, misuse or normal wear." in text
