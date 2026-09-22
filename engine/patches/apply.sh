#!/usr/bin/env bash
# Apply this project's engine patches to an alpharune checkout, skipping any
# that are already in. Idempotent on purpose: the alternative is a half-applied
# tree that builds and behaves subtly differently.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${ALPHARUNE_ROOT:-$(cd "$HERE/../../../chorlick/alpharune" 2>/dev/null && pwd || true)}"

[ -n "$ROOT" ] && [ -d "$ROOT/src" ] || {
  echo "No alpharune checkout found. Set ALPHARUNE_ROOT." >&2; exit 2; }

# `if`, not `x && y`: under `set -e` a trailing AND-list that fails exits the
# script, so invoking this with no arguments at all would have killed it.
RESET=
if [ "${1:-}" = "--reset" ]; then RESET=1; fi

reset_tree() {
  echo "  restoring $ROOT/src and $ROOT/tests to upstream HEAD ..."
  git -C "$ROOT" checkout -- src tests
  # Scoped to src/ and tests/, never the whole repo: build/ lives here too and
  # throwing it away turns a two-minute fix into a half-hour rebuild.
  git -C "$ROOT" clean -fdq src tests
}

regenerate() {
  # A clean tree has no generated cards and none of the hand-written ones, so
  # it will not link. Leaving these two to the reader is the footgun this
  # flag exists to remove.
  echo "  regenerating generated cards ..."
  node "$HERE/../../coach/gen-cards.js" VEN --write >/dev/null
  echo "  reinstalling hand-written cards ..."
  "$HERE/../cards/install.sh" >/dev/null
}

apply_all() {
  applied=0 skipped=0 stale=0
  for p in "$HERE"/*.patch; do
    [ -e "$p" ] || continue
    name="$(basename "$p")"
    if git -C "$ROOT" apply --reverse --check "$p" >/dev/null 2>&1; then
      echo "  already applied: $name"; skipped=$((skipped + 1)); continue
    fi
    if ! git -C "$ROOT" apply --check "$p" >/dev/null 2>&1; then
      stale=$((stale + 1)); echo "  cannot apply: $name" >&2; continue
    fi
    git -C "$ROOT" apply "$p"
    echo "  applied: $name"; applied=$((applied + 1))
  done
}

apply_all

# The case this used to give up on.
#
# A patch that neither reverse-applies (already in) nor forward-applies
# (clean) almost always means the checkout carries an OLDER VERSION of this
# same patch set. That happens on every `git pull` that grows a patch, which
# is to say routinely — and the old message, "the checkout has moved under
# it; resolve by hand", named the symptom and nothing to do about it.
#
# There is nothing to resolve by hand: the engine tree holds no work of
# yours. Everything in it comes from upstream HEAD plus these patches plus
# two generators. So the fix is to put it back and redo all three, and the
# script can say that, or do it.
if [ "$stale" -gt 0 ] && [ -z "$RESET" ]; then
  echo "" >&2
  echo "  $stale patch(es) would not apply. Almost certainly this checkout has an" >&2
  echo "  OLDER version of them applied — which is what a pull that grew a patch" >&2
  echo "  leaves behind, and there is nothing of yours in $ROOT/src to lose." >&2
  echo "" >&2
  echo "  Re-run as:  ./engine/patches/apply.sh --reset" >&2
  echo "" >&2
  echo "  That restores src/ and tests/ to upstream HEAD, re-applies the patches," >&2
  echo "  and regenerates the cards. Then rebuild:" >&2
  echo "    (cd $ROOT && cmake --build build) && ./engine/build.sh" >&2
  exit 1
fi

if [ "$stale" -gt 0 ]; then
  reset_tree
  apply_all
  if [ "$stale" -gt 0 ]; then
    echo "  STILL will not apply after a reset — the patches are wrong, not the tree." >&2
    exit 1
  fi
  regenerate
fi

echo "$applied applied, $skipped already in."
if [ "$applied" -gt 0 ]; then echo "Rebuild: (cd $ROOT && cmake --build build) && ./engine/build.sh"; fi
exit 0
