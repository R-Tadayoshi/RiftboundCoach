#!/usr/bin/env bash
# Apply this project's engine patches to an alpharune checkout, skipping any
# that are already in. Idempotent on purpose: the alternative is a half-applied
# tree that builds and behaves subtly differently.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${ALPHARUNE_ROOT:-$(cd "$HERE/../../../chorlick/alpharune" 2>/dev/null && pwd || true)}"

[ -n "$ROOT" ] && [ -d "$ROOT/src" ] || {
  echo "No alpharune checkout found. Set ALPHARUNE_ROOT." >&2; exit 2; }

applied=0 skipped=0
for p in "$HERE"/*.patch; do
  [ -e "$p" ] || continue
  name="$(basename "$p")"
  if git -C "$ROOT" apply --reverse --check "$p" >/dev/null 2>&1; then
    echo "  already applied: $name"; skipped=$((skipped + 1)); continue
  fi
  if ! git -C "$ROOT" apply --check "$p" >/dev/null 2>&1; then
    echo "  CANNOT APPLY: $name — the checkout has moved under it." >&2
    echo "  Resolve by hand; do not force." >&2
    exit 1
  fi
  git -C "$ROOT" apply "$p"
  echo "  applied: $name"; applied=$((applied + 1))
done

echo "$applied applied, $skipped already in."
[ "$applied" -gt 0 ] && echo "Rebuild: (cd $ROOT && cmake --build build) && ./engine/build.sh"
exit 0
