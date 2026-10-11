import re


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[dict]:
    """Split text into chunks that respect paragraph and sentence boundaries."""
    if not text:
        return []

    sections = _split_into_sections(text)
    chunks: list[dict] = []

    for section_title, section_text in sections:
        for chunk in _chunk_by_boundaries(section_text, chunk_size, overlap):
            chunks.append({"text": chunk, "section_title": section_title})

    return [c for c in chunks if c["text"].strip()]


def _chunk_by_boundaries(text: str, chunk_size: int, overlap: int) -> list[str]:
    """Pack sentences into chunks without exceeding chunk_size, keeping sentences whole."""
    # Split into paragraphs first, then sentences
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    sentences: list[str] = []
    for para in paragraphs:
        sentences.extend(_split_sentences(para))

    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if len(current) + len(sentence) + 1 <= chunk_size:
            current = f"{current} {sentence}".strip()
        else:
            if current:
                chunks.append(current)
            # Start new chunk; carry overlap tail from previous
            if overlap and chunks:
                tail = chunks[-1][-overlap:]
                current = f"{tail} {sentence}".strip()
            else:
                current = sentence
            # If a single sentence exceeds chunk_size, hard-split it
            while len(current) > chunk_size:
                chunks.append(current[:chunk_size])
                current = current[chunk_size - overlap:]
    if current:
        chunks.append(current)
    return chunks


def _split_sentences(text: str) -> list[str]:
    """Naive but effective sentence splitter."""
    parts = re.split(r"(?<=[.!?])\s+", text.replace("\n", " "))
    return [p.strip() for p in parts if p.strip()]


def _split_into_sections(text: str) -> list[tuple[str | None, str]]:
    lines = text.split("\n")
    sections: list[tuple[str | None, str]] = []
    current_title: str | None = None
    current_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if _is_heading(stripped):
            if current_lines:
                sections.append((current_title, "\n".join(current_lines)))
            current_title = stripped
            current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        sections.append((current_title, "\n".join(current_lines)))

    return sections if sections else [(None, text)]


def _is_heading(line: str) -> bool:
    if not line or len(line) > 80:
        return False
    if line.isupper() and len(line) > 3:
        return True
    if re.match(r"^\d+[\.\)]\s+\w", line):
        return True
    if line.endswith(":") and len(line) < 50:
        return True
    return False
