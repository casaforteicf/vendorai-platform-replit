#!/usr/bin/env bash
# VENDI-04: safe host release preflight. No build or mutation.
set -Eeuo pipefail
LOT="${1:-}"
[[ "$LOT" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]] || { echo INVALID_LOT; exit 64; }
REPO=/home/vendorai/vendorai-api-auth-test
[[ -d "$REPO/.git" ]] || { echo REPOSITORY_MISSING; exit 65; }
echo "LOT=$LOT"
echo "PHASE=preflight"
echo "=== CONTAINERS ==="
for C in vendorai-homolog-api vendorai-prod-api-candidate vendorai-mcp-contabo-fixed; do
  docker inspect "$C" --format 'NAME={{.Name}} STATE={{.State.Status}} IMAGE={{.Config.Image}}'
done
echo "=== HEALTH ==="
for PORT in 5000 5001; do
  HTTP=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "http://127.0.0.1:${PORT}/api/auth/healthz" || true)
  echo "PORT_${PORT}_HTTP=$HTTP"
  [[ "$HTTP" == "200" ]] || exit 69
done
echo "=== WORKSPACE ==="
git -c safe.directory="$REPO" -C "$REPO" rev-parse --is-inside-work-tree
git -c safe.directory="$REPO" -C "$REPO" rev-parse --short HEAD
echo "=== STORAGE ==="
df -h /
echo "=== CAPACITY ==="
FREE_KB=$(df -Pk / | awk 'NR==2 {print $4}')
echo "FREE_KB=$FREE_KB"
if [[ "$FREE_KB" -lt 2097152 ]]; then
  echo "BUILD_BLOCKED_LOW_DISK"; exit 75
fi
echo "VENDI04_RELEASE_PREFLIGHT_PASSED"
