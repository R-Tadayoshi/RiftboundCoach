#!/usr/bin/env bash
# Build the engine probe against a local alpharune checkout.
#
# Not a CMake target on purpose: this compiles ONE file against the engine's
# static library, so it stays out of alpharune's build and survives a re-clone
# of it. ALPHARUNE_ROOT points at the checkout; it must have been built once
# (cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build build).
set -euo pipefail

ROOT="${ALPHARUNE_ROOT:-$(cd "$(dirname "$0")/../../chorlick/alpharune" && pwd)}"
OUTDIR="${1:-./engine}"

[ -f "$ROOT/build/libriftbound_core.a" ] || {
  echo "No libriftbound_core.a under $ROOT/build — build alpharune first." >&2
  exit 2
}

HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUTDIR"

for src in probe position rank search; do
  g++ -std=gnu++20 -O1 \
    -I "$ROOT/src" -I "$ROOT/build/generated" \
    "$HERE/$src.cpp" \
    "$ROOT/build/libriftbound_core.a" \
    -lboost_system -lboost_filesystem -lboost_context \
    -o "$OUTDIR/$src"
  echo "built $OUTDIR/$src"
done

cat <<MSG

Run from the alpharune checkout — decks/ and cards/ are resolved relative to it:
  cd $ROOT
  RIFTBOUND_ROOT=. $(cd "$OUTDIR" && pwd)/position \
      decks/fiora_test.txt decks/draven_test.txt <position.txt>
MSG
