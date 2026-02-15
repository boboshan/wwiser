#!/usr/bin/env bash
#
# Merge dev into main, excluding monitor and source-rename tools.
#
# Usage:
#   ./scripts/merge-to-main.sh            # default commit message
#   ./scripts/merge-to-main.sh "message"  # custom commit message
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

DEV_ONLY_ROUTES=(
  "src/routes/monitor"
  "src/routes/source-rename"
)

DEV_ONLY_IDS=("source-rename" "monitor")

COMMIT_MSG="${1:-merge dev into main (exclude source-rename and monitor)}"

# ── Preflight ────────────────────────────────────────────────────────────────

current_branch=$(git branch --show-current)
if [[ "$current_branch" != "main" ]]; then
  echo "Error: must be on 'main' (currently on '$current_branch')"
  exit 1
fi

if [[ -n $(git status --porcelain) ]]; then
  echo "Error: working tree is not clean — commit or stash first"
  exit 1
fi

# ── Merge ────────────────────────────────────────────────────────────────────

echo "Merging dev into main..."
git merge dev --no-commit --no-ff || true   # allow conflicts, we'll fix them

# ── Remove dev-only routes ───────────────────────────────────────────────────

for route in "${DEV_ONLY_ROUTES[@]}"; do
  if [[ -e "$route" ]]; then
    echo "Removing $route"
    git rm -rf "$route"
  fi
done

# ── Patch site.ts ────────────────────────────────────────────────────────────

echo "Stripping dev-only tool config from site.ts..."
node "$SCRIPT_DIR/strip-dev-tools.mjs" "${DEV_ONLY_IDS[@]}"
git add src/lib/config/site.ts

# ── Stage & commit ───────────────────────────────────────────────────────────

git add -A
echo ""
echo "Changes staged. Review:"
echo ""
git diff --cached --stat
echo ""
read -rp "Commit merge? [Y/n] " confirm
if [[ "${confirm:-Y}" =~ ^[Yy]$ ]]; then
  git commit -m "$COMMIT_MSG"
  echo "Done — merged dev into main (monitor & source-rename excluded)."
else
  echo "Merge staged but NOT committed. Run 'git commit' when ready, or 'git merge --abort' to cancel."
fi
