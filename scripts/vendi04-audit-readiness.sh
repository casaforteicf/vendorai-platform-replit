#!/usr/bin/env bash
# Only read-only readiness evidence. Never prints DB URLs or credential values.
set -Eeuo pipefail
LOT="${1:-}"
[[ "$#" == 1 && "$LOT" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]] || { echo INVALID_LOT; exit 64; }
ROOT=/var/lib/vendi-release
M="$ROOT/manifests/$LOT.env"
[[ -f "$M" ]] || { echo MANIFEST_MISSING; exit 65; }
SHA=$(sed -n 's/^SHA=//p' "$M" | head -1)
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo MANIFEST_SHA_INVALID; exit 65; }
IMAGE="vendorai-release:${LOT,,}-${SHA:0:12}"
echo "LOT=$LOT"
echo "SHA=$SHA"
echo "MANIFEST_OWNER=$(stat -c %u "$M")"
echo "IMAGE=$IMAGE"
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
 echo "CANDIDATE_IMAGE=present"
else
 echo "CANDIDATE_IMAGE=missing"
fi
for pair in "HOMOLOG:vendorai-homolog-api:5000" "PRODUCTION:vendorai-prod-api-candidate:5001"; do
 IFS=: read -r label container port <<<"$pair"
 if docker inspect "$container" >/dev/null 2>&1; then
  echo "${label}_IMAGE=$(docker inspect "$container" --format '{{.Config.Image}}')"
  echo "${label}_STATE=$(docker inspect "$container" --format '{{.State.Status}}')"
 else
  echo "${label}_STATE=missing"
 fi
 echo "${label}_HTTP=$(curl -s --output /dev/null --write-out '%{http_code}' --max-time 5 "http://127.0.0.1:$port/api/auth/healthz" || true)"
done
FREE_KB=$(df -Pk / | awk 'NR==2{print $4}')
echo "FREE_KB=$FREE_KB"
MEM_AVAILABLE_KB=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
SWAP_TOTAL_KB=$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)
SWAP_FREE_KB=$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)
echo "MEM_AVAILABLE_KB=$MEM_AVAILABLE_KB"
echo "SWAP_TOTAL_KB=$SWAP_TOTAL_KB"
echo "SWAP_FREE_KB=$SWAP_FREE_KB"
echo "DOCKER_CONTAINERS_TOTAL=$(docker ps -aq | wc -l)"
echo "DOCKER_CONTAINERS_RUNNING=$(docker ps -q | wc -l)"
echo "DOCKER_IMAGES_DISTINCT=$(docker image ls -q --no-trunc | sort -u | wc -l)"
echo "DOCKER_VOLUMES_TOTAL=$(docker volume ls -q | wc -l)"
echo "STOPPED_CONTAINERS_REVIEW_ONLY_BEGIN"
docker ps -a --filter status=exited --format 'NAME={{.Names}} IMAGE={{.Image}} STATUS={{.Status}}' | head -n 30
echo "STOPPED_CONTAINERS_REVIEW_ONLY_END"
echo "DANGLING_IMAGES_REVIEW_ONLY_BEGIN"
docker image ls --filter dangling=true --format 'ID={{.ID}} SIZE={{.Size}}' | head -n 20
echo "DANGLING_IMAGES_REVIEW_ONLY_END"
echo "NO_AUTOMATIC_DELETION=YES"
[[ "$FREE_KB" =~ ^[0-9]+$ ]] || exit 70
if (( FREE_KB < 14680064 )); then echo "BUILD_CAPACITY=BLOCKED"; else echo "BUILD_CAPACITY=READY"; fi
if [[ -f "$ROOT/state/$LOT.homolog" ]]; then
 echo "HOMOLOG_RECEIPT=present"
 grep -E '^(SHA|STATUS|AT_EPOCH|MODE)=' "$ROOT/state/$LOT.homolog" || true
else echo "HOMOLOG_RECEIPT=missing"; fi
for record in "$ROOT"/state/*.prod; do
 [[ -f "$record" ]] || continue
 saved=$(sed -n 's/^STATUS=//p' "$record" | head -1)
 bn=$(basename "$record")
 echo "HISTORICAL_RECORD=$bn:$saved"
 if [[ "$saved" == PUBLISHED ]]; then
   backup=$(sed -n 's/^BACKUP=//p' "$record" | head -1)
   [[ -n "$backup" ]] && docker inspect "$backup" >/dev/null 2>&1 ||
     echo "HISTORICAL_RECONCILIATION_REQUIRED=$bn"
 fi
done
echo "AUDIT_READONLY=COMPLETE"
