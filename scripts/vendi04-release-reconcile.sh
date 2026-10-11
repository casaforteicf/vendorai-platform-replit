#!/usr/bin/env bash
# VENDI-04: audit ALL release records against actual production, fail closed.
# Read-only on Docker and release state; no auto rewriting stale history.
set -Eeuo pipefail
root=/var/lib/vendi-release/state
current=vendorai-prod-api-candidate
[[ -d "$root" ]] || { echo NO_STATE_DIRECTORY; exit 65; }
actual=$(docker inspect "$current" -f '{{.Config.Image}}' 2>/dev/null) || { echo PRODUCTION_CONTAINER_MISSING;exit 65; }
health=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:5001/api/auth/healthz || true)
echo "PRODUCTION_IMAGE=$actual"
echo "PRODUCTION_HEALTH_HTTP=$health"
[[ "$health" == 200 ]] || { echo PRODUCTION_UNHEALTHY;exit 69; }
problem=0
shopt -s nullglob
for state in "$root"/*.prod;do
  lot=${state##*/};lot=${lot%.prod}
  status=$(sed -n 's/^STATUS=//p' "$state" | head -1)
  image=$(sed -n 's/^IMAGE=//p' "$state" | head -1)
  backup=$(sed -n 's/^BACKUP=//p' "$state" | head -1)
  case "$status" in
    PUBLISHED)
      if [[ "$image" != "$actual" ]];then
        echo "LOT=$lot RESULT=DRIFT_IMAGE"; problem=1
      elif [[ -z "$backup" ]] || ! docker inspect "$backup" >/dev/null 2>&1;then
        echo "LOT=$lot RESULT=BACKUP_MISSING";problem=1
      else
        echo "LOT=$lot RESULT=CONSISTENT_PUBLISHED"
      fi;;
    INCONSISTENT*) echo "LOT=$lot RESULT=BLOCKED_INCONSISTENT_STATE";problem=1;;
    ROLLED_BACK) echo "LOT=$lot RESULT=ROLLED_BACK_HISTORICAL";;
    *) echo "LOT=$lot RESULT=UNKNOWN_STATUS";problem=1;;
  esac
done
if [[ "$problem" == 1 ]];then echo "RELEASE_GATE=BLOCKED";exit 65;fi
echo "RELEASE_GATE=OK"
