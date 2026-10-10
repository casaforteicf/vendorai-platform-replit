#!/usr/bin/env bash
# Controlled production candidate rollout and rollback; never executes arbitrary shell.
set -Eeuo pipefail
ACTION="${1:-}"; LOT="${2:-}"
[[ "$#" == 2 && "$LOT" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]] || { echo INVALID_ARGUMENTS; exit 64; }
case "$ACTION" in publish|rollback|status) ;; *) echo INVALID_ACTION; exit 64;; esac
ROOT=/var/lib/vendi-release
MANIFEST="$ROOT/manifests/$LOT.env"
CURRENT=vendorai-prod-api-candidate
STATE="$ROOT/state/$LOT.prod"
LOCK=/run/lock/vendi-production-release.lock
mkdir -p "$ROOT/state"
exec 9>"$LOCK"; flock -n 9 || { echo RELEASE_BUSY; exit 75; }
log(){ printf '%s lot=%s action=%s %s\n' "$(date -u +%FT%TZ)" "$LOT" "$ACTION" "$1" >> /var/log/vendi-contabo-operator.log; }
if [[ "$ACTION" == status ]]; then
 [[ -f "$STATE" ]] && cat "$STATE" || echo NO_PRODUCTION_RECORD
 docker inspect "$CURRENT" --format 'CONTAINER={{.State.Status}} IMAGE={{.Config.Image}}'
 exit 0
fi
[[ -f "$MANIFEST" && "$(stat -c %u "$MANIFEST")" == 0 ]] || { echo MISSING_ROOT_MANIFEST; exit 65; }
get(){ sed -n "s/^$1=//p" "$MANIFEST" | head -1; }
SHA=$(get SHA)
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo INVALID_SHA; exit 65; }
IMAGE="vendorai-release:${LOT,,}-${SHA:0:12}"
TAG="${LOT,,}-${SHA:0:12}"
BACK="${CURRENT}-backup-${TAG}"
NEXT="${CURRENT}-next-${TAG}"
check(){ curl -fsS --max-time 4 http://127.0.0.1:5001/api/auth/healthz >/dev/null; }
if [[ "$ACTION" == rollback ]]; then
 [[ -f "$STATE" ]] || { echo NO_ROLLBACK_STATE;exit 65; }
 SAVED=$(sed -n 's/^BACKUP=//p' "$STATE")
 [[ "$SAVED" =~ ^vendorai-prod-api-candidate-backup-[a-z0-9-]+$ ]] || { echo INVALID_BACKUP_STATE;exit 65; }
 docker inspect "$SAVED" >/dev/null || { echo BACKUP_MISSING;exit 65; }
 REPLACED="${CURRENT}-failed-$(date -u +%s)"
 docker stop "$CURRENT" >/dev/null
 docker rename "$CURRENT" "$REPLACED"
 if ! docker rename "$SAVED" "$CURRENT"; then
   docker rename "$REPLACED" "$CURRENT"
   docker start "$CURRENT" >/dev/null
   echo ROLLBACK_RESTORE_FAILED
   exit 1
 fi
 docker start "$CURRENT" >/dev/null
 for _ in $(seq 1 30); do if check; then
  sed -i 's/^STATUS=PUBLISHED$/STATUS=ROLLED_BACK/' "$STATE"
  echo ROLLBACK_HEALTH_200
  log "ROLLBACK_OK"
  exit 0
fi;sleep 2;done
 echo ROLLBACK_HEALTH_FAILED;log "ROLLBACK_HEALTH_FAILED";exit 1
fi
# Publish only an image that was actually built and recorded with the requested commit.
BUILDSTATE="$ROOT/state/$LOT"
[[ -f "$BUILDSTATE" ]] || { echo BUILD_NOT_RECORDED;exit 65; }
grep -Fxq "SHA=$SHA" "$BUILDSTATE" || { echo SHA_MISMATCH;exit 65; }
grep -Fxq "IMAGE=$IMAGE" "$BUILDSTATE" || { echo IMAGE_MISMATCH;exit 65; }
grep -Fxq "STATUS=BUILT_NOT_DEPLOYED" "$BUILDSTATE" || { echo BUILD_NOT_APPROVED;exit 65; }
docker image inspect "$IMAGE" >/dev/null
[[ ! -e "$STATE" ]] || { echo RELEASE_RECORD_EXISTS;exit 65; }
docker inspect "$CURRENT" >/dev/null
docker inspect "$BACK" >/dev/null 2>&1 && { echo BACKUP_NAME_EXISTS;exit 65; }
docker inspect "$NEXT" >/dev/null 2>&1 && { echo NEXT_NAME_EXISTS;exit 65; }
# The live container is preserved by rename for rollback. No volumes may be silently omitted.
MOUNTS=$(docker inspect "$CURRENT" --format '{{len .Mounts}}')
[[ "$MOUNTS" == 0 ]] || { echo MOUNTS_REQUIRE_EXPLICIT_RELEASE_CONFIGURATION;exit 65; }
NETWORK=$(docker inspect "$CURRENT" -f '{{.HostConfig.NetworkMode}}')
[[ "$NETWORK" == "vendorai-prod" ]] || { echo NETWORK_NOT_ALLOWED;exit 65; }
ENVFILE=$(mktemp /root/vendi-prod-env.XXXXXXXX)
chmod 600 "$ENVFILE"
cleanup(){ rm -f "$ENVFILE"; }
trap cleanup EXIT
python3 - "$CURRENT" "$ENVFILE" <<'PY'
import subprocess,json,sys
a=json.loads(subprocess.check_output(["docker","inspect",sys.argv[1]]))[0]["Config"]["Env"]
if any("\n" in x or "\r" in x for x in a): raise SystemExit("MULTILINE_ENV_UNSUPPORTED")
with open(sys.argv[2],"w") as f:f.write("\n".join(a)+"\n")
PY
docker create --name "$NEXT" --network "$NETWORK" --restart unless-stopped --env-file "$ENVFILE" -p 127.0.0.1:5001:5000 "$IMAGE" >/dev/null
swapped=0;success=0
restore(){
 if [[ "$swapped" == 1 && "$success" != 1 ]]; then
   log "ROLLING_BACK_FAILED_PUBLISH"
   docker rm -f "$CURRENT" >/dev/null 2>&1 || true
   docker rename "$BACK" "$CURRENT"
   docker start "$CURRENT" >/dev/null
 fi
 docker rm -f "$NEXT" >/dev/null 2>&1 || true
}
trap 'rc=$?; trap - EXIT; restore; cleanup; exit "$rc"' EXIT
docker stop "$CURRENT" >/dev/null
docker rename "$CURRENT" "$BACK"
swapped=1
docker rename "$NEXT" "$CURRENT"
docker start "$CURRENT" >/dev/null
ok=0
for _ in $(seq 1 45); do if check; then ok=1;break;fi;sleep 2;done
[[ "$ok" == 1 ]] || { echo RELEASE_HEALTH_FAILED;log "HEALTH_FAILED";exit 1; }
printf 'LOT=%s\nSHA=%s\nIMAGE=%s\nBACKUP=%s\nSTATUS=PUBLISHED\n' "$LOT" "$SHA" "$IMAGE" "$BACK" > "$STATE"
success=1
log "PUBLISHED sha=$SHA backup=$BACK"
echo "VENDI04_PRODUCTION_HEALTH_200_BACKUP_PRESERVED"
