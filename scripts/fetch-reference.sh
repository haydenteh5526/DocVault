#!/usr/bin/env bash
# Restore the reference repositories used for the literature review.
#
# reference/ is gitignored (~317 MB of third-party code, and vendoring GPL/MIT
# projects into an academic repo invites licensing and plagiarism questions), so
# this script stores the *recipe* instead of the payload.
#
# Commits are pinned to what was reviewed, so quotes and line references in the
# report stay valid — upstream moving on won't invalidate your citations.
#
# Usage:  bash scripts/fetch-reference.sh
# Windows: run from Git Bash, or `wsl bash scripts/fetch-reference.sh`

set -euo pipefail

# repo_name|clone_url|pinned_commit
REPOS=(
  "paperless-ngx|https://github.com/paperless-ngx/paperless-ngx.git|82aefe5"
  "docling|https://github.com/docling-project/docling.git|521e86b"
  "quivr|https://github.com/QuivrHQ/quivr.git|947a785"
  "kreuzberg|https://github.com/kreuzberg-dev/kreuzberg.git|5881fec"
)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/reference"
mkdir -p "$DEST"

for entry in "${REPOS[@]}"; do
  IFS='|' read -r name url commit <<< "$entry"
  target="$DEST/$name"

  if [ -d "$target/.git" ]; then
    echo "== $name: already present, skipping"
    continue
  fi

  echo "== $name: cloning"
  # Full history is needed to check out a specific old commit.
  git clone --quiet "$url" "$target"
  git -C "$target" checkout --quiet "$commit"
  echo "   pinned at $commit"
done

echo
echo "Done. Reviewed versions:"
for entry in "${REPOS[@]}"; do
  IFS='|' read -r name _ commit <<< "$entry"
  printf '  %-16s %s\n' "$name" "$commit"
done
