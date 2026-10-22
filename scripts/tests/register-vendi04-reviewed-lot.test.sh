#!/usr/bin/env bash
# Non-destructive validation for VENDI-04 manifest registration helper.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/register-vendi04-reviewed-lot.sh"
bash -n "$SCRIPT"
test_case() {
  local expected=$1; shift
  local output rc
  rc=0
  output="$(bash "$SCRIPT" "$@" 2>&1)" || rc=$?
  [[ "$rc" == 64 ]] || { echo "Unexpected exit for $expected: $rc ($output)"; exit 1; }
  [[ "$output" == "$expected" ]] || { echo "Unexpected output: $output"; exit 1; }
}
test_case INVALID_LOT "bad" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
test_case INVALID_SHA "VDEV-03" "invalid"
test_case INVALID_SHA "VDEV-03" "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
test_case INVALID_LOT "../VDEV-03" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
echo "VENDI04_REGISTER_VALIDATION_PASSED"
