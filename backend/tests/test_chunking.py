"""Unit tests for chunking_service — pure functions, no DB or network."""
from app.services import chunking_service


def test_empty_text_returns_no_chunks():
    assert chunking_service.chunk_text("") == []


def test_short_text_single_chunk():
    chunks = chunking_service.chunk_text("This is a short manual.")
    assert len(chunks) == 1
    assert "short manual" in chunks[0]["text"]


def test_chunks_respect_size_limit():
    # Build long text from many sentences
    text = " ".join(f"Sentence number {i} about the product." for i in range(200))
    chunks = chunking_service.chunk_text(text, chunk_size=200, overlap=20)
    assert len(chunks) > 1
    # Each chunk should be roughly within size (allow overlap slack)
    for c in chunks:
        assert len(c["text"]) <= 200 + 40


def test_sentences_not_split_midway():
    text = "First sentence here. Second sentence here. Third sentence here."
    chunks = chunking_service.chunk_text(text, chunk_size=1000, overlap=0)
    # All content preserved in a single chunk
    joined = " ".join(c["text"] for c in chunks)
    assert "First sentence" in joined
    assert "Third sentence" in joined


def test_section_headings_detected():
    text = "INTRODUCTION\nThis is the intro.\n\nSAFETY WARNINGS\nDo not submerge in water."
    chunks = chunking_service.chunk_text(text, chunk_size=500, overlap=0)
    titles = {c["section_title"] for c in chunks}
    # At least one recognised heading
    assert any(t and "SAFETY" in t for t in titles if t)


def test_whitespace_only_filtered():
    chunks = chunking_service.chunk_text("   \n\n   \n  ")
    assert chunks == []


def test_heading_detection_rules():
    assert chunking_service._is_heading("SAFETY INSTRUCTIONS") is True
    assert chunking_service._is_heading("1. Getting Started") is True
    assert chunking_service._is_heading("Specifications:") is True
    assert chunking_service._is_heading("this is a normal sentence") is False
    assert chunking_service._is_heading("") is False
