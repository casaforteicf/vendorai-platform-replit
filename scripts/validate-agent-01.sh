#!/usr/bin/env bash
# Read-only source validation for AGENT-01 in an isolated checkout (e.g. Contabo homolog build).
# Does not start workers, connect to production, run migrations or publish anything.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "AGENT01_VALIDATE_ERROR=PNPM_MISSING" >&2
  exit 1
fi

echo "AGENT01_VALIDATION=START"
echo "AGENT01_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

pnpm --filter @workspace/api-server exec vitest run src/services/agent-manager-policy.test.ts
echo "AGENT01_POLICY_TEST=PASS"

pnpm --filter @workspace/api-server run typecheck
echo "AGENT01_TYPECHECK=PASS"
echo "AGENT01_VALIDATION=PASS"
