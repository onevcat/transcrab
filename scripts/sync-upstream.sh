#!/usr/bin/env bash
set -euo pipefail

# Sync upstream template changes into your personal repo.
#
# Assumes:
# - origin   = your personal repo (private)
# - upstream = template repo (public)
#
# Usage:
#   ./scripts/sync-upstream.sh

git fetch upstream --prune

git checkout main

git merge --no-ff upstream/main -m "merge: sync upstream" || {
  echo "Merge has conflicts. Resolve them, then run:" >&2
  echo "  git add -A && git commit" >&2
  echo "  git push origin main" >&2
  exit 1
}

git push origin main

echo "OK: synced upstream -> origin/main"
