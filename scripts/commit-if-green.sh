#!/usr/bin/env bash
# Commit only when the suite is actually green.
#
# Written after committing twice on a red suite. Both times the chain was
#   npm test 2>&1 | grep -E "^# (tests|pass|fail)" && git commit ...
# and grep exits 0 because it MATCHED the summary lines — including the line
# saying tests failed. The gate reported on the wrong thing entirely.
#
#   scripts/commit-if-green.sh -F message.txt
#   scripts/commit-if-green.sh -m "subject"
set -euo pipefail

cd "$(dirname "$0")/.."

if ! out=$(npm test 2>&1); then
  printf '%s\n' "$out" | grep -E "^not ok|^# (tests|pass|fail)" || true
  echo
  echo "REFUSING TO COMMIT: npm test exited non-zero."
  exit 1
fi

fails=$(printf '%s\n' "$out" | sed -n 's/^# fail \([0-9]*\)$/\1/p' | tail -1)
if [ -z "$fails" ]; then
  echo "REFUSING TO COMMIT: no '# fail' line in the test output."
  exit 1
fi
if [ "$fails" != "0" ]; then
  printf '%s\n' "$out" | grep -E "^not ok" || true
  echo
  echo "REFUSING TO COMMIT: $fails test(s) failing."
  exit 1
fi

printf '%s\n' "$out" | grep -E "^# (tests|pass|fail)"
git commit "$@"
