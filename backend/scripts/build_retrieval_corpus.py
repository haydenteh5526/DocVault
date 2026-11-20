"""Render the synthetic retrieval corpus as page images (issue 33, Task 3).

Each text file in the corpus becomes a clean A4 page. Ten of them also get a
poorly scanned version, degraded the same way every time from a fixed seed. The
images are written to --out (not committed); manifest.json, which is committed,
lists each file's SHA-256 so a later run can check it rebuilt the same pages.

    python scripts/build_retrieval_corpus.py --corpus ../evaluation/retrieval/corpus \
        --out ../evaluation/retrieval/build --seed 20261120

Add --check to compare the rebuilt images with the committed manifest instead of
writing it. The protocol is in evaluation/retrieval/README.md.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Frozen protocol constants. They are deliberately not command-line flags.
PAGE_SIZE = (1654, 2339)  # A4 at 200 dpi
FONT_SIZE = 30
MARGIN_X = 120
MARGIN_Y = 40  # 60 lines of LINE_HEIGHT still end above the bottom edge
LINE_HEIGHT = 38
POOR_SCANS = ("D02", "D07", "D09", "D12", "D16", "D17", "D20", "D22", "D25", "D28")
MAX_ROTATION_DEG = 3.5
BLUR_SIGMA = 1.4
CONTRAST = 0.55
BRIGHTNESS = 25
NOISE_SIGMA = 14
DOWNSCALE = 0.6
JPEG_QUALITY = 25
DEFAULT_SEED = 20261120
MANIFEST_VERSION = 1


def _read(path: Path) -> str:
    # Universal newlines, so a checkout with CRLF line endings renders the same page.
    return path.read_text(encoding="utf-8")


def render_page(text: str) -> Image.Image:
    page = Image.new("L", PAGE_SIZE, 255)
    draw = ImageDraw.Draw(page)
    font = ImageFont.load_default(size=FONT_SIZE)
    for number, line in enumerate(text.splitlines()):
        draw.text((MARGIN_X, MARGIN_Y + number * LINE_HEIGHT), line, fill=0, font=font)
    return page


def degrade(page: Image.Image, seed: int, document_number: int) -> bytes:
    """The poor profile: a rotated, blurred, faded, noisy, low-resolution JPEG."""
    rng = np.random.default_rng(seed + document_number)

    angle = float(rng.uniform(-MAX_ROTATION_DEG, MAX_ROTATION_DEG))
    image = page.rotate(angle, resample=Image.Resampling.BILINEAR, fillcolor=255)
    image = image.filter(ImageFilter.GaussianBlur(BLUR_SIGMA))

    pixels = np.asarray(image, dtype=np.float64)
    pixels = (pixels - 128.0) * CONTRAST + 128.0 + BRIGHTNESS
    pixels = np.clip(pixels, 0, 255)
    pixels = pixels + rng.normal(0.0, NOISE_SIGMA, pixels.shape)
    image = Image.fromarray(np.clip(np.rint(pixels), 0, 255).astype(np.uint8), mode="L")

    width, height = image.size
    small = image.resize((round(width * DOWNSCALE), round(height * DOWNSCALE)), Image.Resampling.BILINEAR)
    image = small.resize((width, height), Image.Resampling.BILINEAR)

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=JPEG_QUALITY)
    return buffer.getvalue()


def _png_bytes(page: Image.Image) -> bytes:
    buffer = io.BytesIO()
    page.save(buffer, format="PNG")
    return buffer.getvalue()


def build(corpus: Path, out: Path, seed: int = DEFAULT_SEED) -> list[dict]:
    """Write the images and return the manifest entries, ordered by document and profile."""
    entries: list[dict] = []
    (out / "clean").mkdir(parents=True, exist_ok=True)
    (out / "poor").mkdir(parents=True, exist_ok=True)
    for path in sorted(corpus.glob("D*.txt")):
        document_id = path.name.split("-", 1)[0]
        text = _read(path)
        first_line = text.splitlines()[0]
        if not first_line.startswith("Title: "):
            raise ValueError(f"{path.name} does not start with a Title line")
        title = first_line[len("Title: "):]
        page = render_page(text)

        files = [("clean", f"clean/{document_id}.png", _png_bytes(page))]
        if document_id in POOR_SCANS:
            files.append(("poor", f"poor/{document_id}.jpg", degrade(page, seed, int(document_id[1:]))))
        for profile, relative, data in files:
            (out / relative).write_bytes(data)
            entries.append({
                "document_id": document_id,
                "profile": profile,
                "title": title,
                "path": relative,
                "sha256": hashlib.sha256(data).hexdigest(),
            })
    return entries


def manifest_of(entries: list[dict], seed: int) -> dict:
    return {"version": MANIFEST_VERSION, "seed": seed, "files": entries}


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[2] / "evaluation" / "retrieval"
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--corpus", type=Path, default=root / "corpus")
    parser.add_argument("--out", type=Path, default=root / "build")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--manifest", type=Path, default=root / "manifest.json")
    parser.add_argument("--check", action="store_true", help="compare with the manifest instead of writing it")
    args = parser.parse_args(argv)

    manifest = manifest_of(build(args.corpus, args.out, args.seed), args.seed)
    if not args.check:
        args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"Wrote {len(manifest['files'])} images to {args.out} and the manifest to {args.manifest}")
        return 0

    expected = json.loads(args.manifest.read_text(encoding="utf-8"))
    wanted = {(e["document_id"], e["profile"]): e["sha256"] for e in expected["files"]}
    found = {(e["document_id"], e["profile"]): e["sha256"] for e in manifest["files"]}
    wrong = sorted(key for key in wanted.keys() | found.keys() if wanted.get(key) != found.get(key))
    if wrong:
        print(f"Checksum mismatch for {len(wrong)} of {len(wanted)} files: " + ", ".join("/".join(k) for k in wrong))
        return 1
    print(f"All {len(wanted)} files match the manifest.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
