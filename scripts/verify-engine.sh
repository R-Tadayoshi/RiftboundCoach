#!/usr/bin/env bash
# Build the engine and run its tests, and do not report success unless both
# actually happened.
#
# Written after reporting "0 compile errors, 1057 tests pass" for a card that
# never compiled. The build was still running when I grepped its output — an
# empty grep looks exactly like a clean one — and the test binary I then ran
# predated the change. Two stale reads agreeing produced a confident wrong
# answer, which is this project's signature failure.
#
# So: wait for the build to finish, check its EXIT marker, and refuse to run a
# test binary older than the library it links.
set -euo pipefail

ROOT="${ALPHARUNE_ROOT:-$(cd "$(dirname "$0")/../../chorlick/alpharune" && pwd)}"
LOG="${TMPDIR:-/tmp}/riftbound-verify.log"

# Never wait on `pgrep -f "cmake --build"`. The waiting shell's own command
# line contains that string, so the pattern matches itself and the loop never
# exits — which is how a dozen stray waiters and several concurrent builds
# ended up thrashing this machine. Run the build in the foreground here and
# let the shell wait on it properly.
# One build at a time. Two ninja processes on the same build directory
# corrupt each other's state, and killing a cmake leaves its ninja orphaned
# and still writing — which is how this tree ended up with two.
lock="$ROOT/build/.verify.lock"
exec 9>"$lock"
if ! flock -n 9; then
  echo "another build is running against $ROOT/build; waiting for it ..." >&2
  flock 9
fi

echo "building $ROOT ..."
if ! (cd "$ROOT" && cmake --build build) > "$LOG" 2>&1; then
  echo "BUILD FAILED:"
  grep -iE "error:" "$LOG" | head -20
  exit 1
fi
echo "  build ok"

lib="$ROOT/build/libriftbound_core.a"
bin="$ROOT/build/riftbound_tests"
[ -f "$bin" ] || { echo "no test binary at $bin" >&2; exit 1; }
if [ "$bin" -ot "$lib" ]; then
  echo "REFUSING: $bin is older than $lib — it would test the previous build." >&2
  exit 1
fi

echo "running the engine's tests ..."
out=$(cd "$ROOT" && RIFTBOUND_ROOT=. ./build/riftbound_tests 2>&1) || {
  echo "$out" | tail -30; exit 1; }
echo "$out" | grep -E "tests from .* ran|PASSED|FAILED" | tail -3
echo "$out" | grep -q "\[  PASSED  \]" || { echo "no PASSED line — treating as failure" >&2; exit 1; }
