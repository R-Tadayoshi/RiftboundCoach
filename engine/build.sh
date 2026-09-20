#!/usr/bin/env bash
# Build the engine probe against a local alpharune checkout.
#
# Not a CMake target on purpose: this compiles ONE file against the engine's
# static library, so it stays out of alpharune's build and survives a re-clone
# of it. ALPHARUNE_ROOT points at the checkout; it must have been built once
# (cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build build).
set -euo pipefail

ROOT="${ALPHARUNE_ROOT:-$(cd "$(dirname "$0")/../../chorlick/alpharune" && pwd)}"
OUT="${1:-./engine/probe}"

[ -f "$ROOT/build/libriftbound_core.a" ] || {
  echo "No libriftbound_core.a under $ROOT/build — build alpharune first." >&2
  exit 2
}

g++ -std=gnu++20 -O1 \
  -I "$ROOT/src" -I "$ROOT/build/generated" \
  "$(dirname "$0")/probe.cpp" \
  "$ROOT/build/libriftbound_core.a" \
  -lboost_system -lboost_filesystem -lboost_context \
  -o "$OUT"

echo "built $OUT"
echo "run it from the alpharune checkout, which is where decks/ and cards/ live:"
echo "  (cd $ROOT && RIFTBOUND_ROOT=. $(realpath "$OUT") decks/draven_test.txt decks/fiora_test.txt)"
