#!/usr/bin/env bash
# Read-only audit of Vendor.ai automated releases on the Contabo host.
# Does not execute deployments, inspect secrets, or change crontabs/locks.
set -uo pipefail
BASE=/opt/vendorai
echo "=== Vendor.ai deploy audit (read-only) ==="
date -u '+UTC=%Y-%m-%dT%H:%M:%SZ'
echo "--- scheduled deploy jobs (current user; command paths only) ---"
if crontab -l 2>/dev/null | grep -E 'deploy-(backend|frontend-auto)\.sh' | sed -E 's#(^[^#]*)(/opt/vendorai/deploy-(backend|frontend-auto)\.sh).*#\2#' | sort -u; then :; else echo "No matching user crontab entries"; fi
echo "--- deployed state ---"
for path in "$BASE/deploy-state/last-status" "$BASE/deploy-state/last-frontend-status" "$BASE/deploy-state/last-deployed-sha"; do
  if [[ -f "$path" ]]; then
    printf '%s: ' "${path##*/}"
    head -c 240 "$path" | tr '\n' ' '
    printf '\n'
  else
    echo "${path##*/}: MISSING"
  fi
done
echo "--- lock references (script inspection; not proof of runtime contention) ---"
for path in "$BASE/deploy-backend.sh" "$BASE/deploy-frontend-auto.sh"; do
  if [[ -r "$path" ]]; then
    printf '%s: ' "${path##*/}"
    grep -Eo '([/[:alnum:]_.-]*/)?deploy\.lock' "$path" | sort -u | tr '\n' ' '
    printf '\n'
  else
    echo "${path##*/}: UNREADABLE_OR_MISSING"
  fi
done
echo "--- health ---"
for port in 5000 5001; do
  status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$port/api/auth/healthz" 2>/dev/null || true)
  printf 'port_%s_health_http=%s\n' "$port" "${status:-ERROR}"
done
echo "Review this output alongside the actual cron configuration and deploy logs before changing scheduling."
