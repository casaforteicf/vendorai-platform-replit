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
# Serialize with the automatic backend deploy as well as other manual releases.
exec 7>/opt/vendorai/deploy.lock
flock -n 7 || { echo DEPLOY_BUSY; exit 75; }
exec 9>"$LOCK"; flock -n 9 || { echo RELEASE_BUSY; exit 75; }
log(){ printf '%s lot=%s action=%s %s\n' "$(date -u +%FT%TZ)" "$LOT" "$ACTION" "$1" >> /var/log/vendi-contabo-operator.log; }
if [[ "$ACTION" == status ]]; then
 [[ -f "$STATE" ]] && cat "$STATE" || echo NO_PRODUCTION_RECORD
 docker inspect "$CURRENT" --format 'CONTAINER={{.State.Status}} IMAGE={{.Config.Image}}'
 # Status is observational: expose drift without mutating any container.
 if [[ -f "$STATE" ]]; then
   saved=$(sed -n 's/^STATUS=//p' "$STATE" | head -1)
   expected=$(sed -n 's/^IMAGE=//p' "$STATE" | head -1)
   active=$(docker inspect "$CURRENT" --format '{{.Config.Image}}' 2>/dev/null || true)
   backup=$(sed -n 's/^BACKUP=//p' "$STATE" | head -1)
   if [[ "$saved" == INCONSISTENT* || ( "$saved" == PUBLISHED && "$expected" != "$active" ) ]] || { [[ "$saved" == PUBLISHED ]] && ! docker inspect "$backup" >/dev/null 2>&1; }; then echo RELEASE_RECONCILIATION_REQUIRED; fi
 fi
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
# Fail closed if recorded production is not the actual live release.
# This does not rewrite history or stop containers.
assert_consistent(){
 [[ -f "$STATE" ]] || return 0
 local st recorded active backup
 st=$(sed -n 's/^STATUS=//p' "$STATE" | head -1)
 recorded=$(sed -n 's/^IMAGE=//p' "$STATE" | head -1)
 backup=$(sed -n 's/^BACKUP=//p' "$STATE" | head -1)
 active=$(docker inspect "$CURRENT" --format '{{.Config.Image}}' 2>/dev/null || true)
 if [[ "$st" == INCONSISTENT* ]]; then echo RELEASE_STATE_INCONSISTENT; return 65; fi
 if [[ "$st" == "PUBLISHED" ]]; then
  if [[ -z "$recorded" || "$active" != "$recorded" ]]; then echo RELEASE_IMAGE_MISMATCH; return 65; fi
  if [[ -z "$backup" ]] || ! docker inspect "$backup" >/dev/null 2>&1; then echo RELEASE_BACKUP_MISSING; return 65; fi
 fi
}
assert_consistent || { log "DENIED_INCONSISTENT_RELEASE_STATE";exit 65; }
# A manifest may name exactly one verified live predecessor. Other unresolved
# releases still block. The predecessor remains PUBLISHED until health passes.
PREVIOUS_LOT=$(get PREVIOUS_LOT)
PREVIOUS_STATE=""
if [[ -n "$PREVIOUS_LOT" ]]; then
 [[ "$PREVIOUS_LOT" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ && "$PREVIOUS_LOT" != "$LOT" ]] || { echo INVALID_PREVIOUS_LOT; exit 65; }
 PREVIOUS_STATE="$ROOT/state/$PREVIOUS_LOT.prod"
fi
if [[ "$ACTION" == publish ]]; then
 for record in "$ROOT"/state/*.prod; do
  [[ -f "$record" && "$record" != "$STATE" ]] || continue
  record_status=$(sed -n 's/^STATUS=//p' "$record" | head -1)
  case "$record_status" in
   PUBLISHED)
    [[ "$record" == "$PREVIOUS_STATE" ]] || { echo OTHER_RELEASE_REQUIRES_RECONCILIATION; exit 65; }
    ;;
   INCONSISTENT*) echo OTHER_RELEASE_REQUIRES_RECONCILIATION; exit 65;;
  esac
 done
 if [[ -n "$PREVIOUS_STATE" ]]; then
  [[ -f "$PREVIOUS_STATE" && "$(stat -c %u "$PREVIOUS_STATE")" == 0 ]] || { echo PREVIOUS_RECORD_MISSING; exit 65; }
  grep -Fxq "LOT=$PREVIOUS_LOT" "$PREVIOUS_STATE" &&
  grep -Fxq STATUS=PUBLISHED "$PREVIOUS_STATE" || { echo PREVIOUS_NOT_PUBLISHED; exit 65; }
  prior_sha=$(sed -n 's/^SHA=//p' "$PREVIOUS_STATE" | head -1)
  [[ "$prior_sha" =~ ^[0-9a-f]{40}$ ]] || { echo PREVIOUS_SHA_INVALID; exit 65; }
  prior_image="vendorai-release:${PREVIOUS_LOT,,}-${prior_sha:0:12}"
  grep -Fxq "IMAGE=$prior_image" "$PREVIOUS_STATE" || { echo PREVIOUS_IMAGE_INVALID; exit 65; }
  [[ "$(docker inspect "$CURRENT" --format '{{.Config.Image}}')" == "$prior_image" ]] || { echo PREVIOUS_IMAGE_MISMATCH; exit 65; }
  [[ "$(docker inspect "$CURRENT" --format '{{.Image}}')" == "$(docker image inspect "$prior_image" --format '{{.Id}}')" ]] || { echo PREVIOUS_IMAGE_ID_MISMATCH; exit 65; }
  prior_backup=$(sed -n 's/^BACKUP=//p' "$PREVIOUS_STATE" | head -1)
  [[ "$prior_backup" =~ ^vendorai-prod-api-candidate-backup-[a-z0-9-]+$ ]] &&
  docker inspect "$prior_backup" >/dev/null || { echo PREVIOUS_BACKUP_MISSING; exit 65; }
 fi
fi
if [[ "$ACTION" == rollback ]]; then
 [[ -f "$STATE" ]] || { echo NO_ROLLBACK_STATE;exit 65; }
 RECORDED_IMAGE=$(sed -n 's/^IMAGE=//p' "$STATE")
 RECORDED_STATUS=$(sed -n 's/^STATUS=//p' "$STATE")
 ACTIVE_IMAGE=$(docker inspect "$CURRENT" --format '{{.Config.Image}}' 2>/dev/null || true)
 [[ "$RECORDED_STATUS" == PUBLISHED && -n "$RECORDED_IMAGE" && "$ACTIVE_IMAGE" == "$RECORDED_IMAGE" ]] || { echo ROLLBACK_BLOCKED_PRODUCTION_VERSION_MISMATCH;exit 65; }
 PREVIOUS_LOT=$(sed -n 's/^PREVIOUS_LOT=//p' "$STATE" | head -1)
 PREVIOUS_STATE=""
 if [[ -n "$PREVIOUS_LOT" ]]; then
  [[ "$PREVIOUS_LOT" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ && "$PREVIOUS_LOT" != "$LOT" ]] || { echo INVALID_PREVIOUS_LOT; exit 65; }
  PREVIOUS_STATE="$ROOT/state/$PREVIOUS_LOT.prod"
  grep -Fxq STATUS=SUPERSEDED "$PREVIOUS_STATE" &&
  grep -Fxq "SUPERSEDED_BY=$LOT" "$PREVIOUS_STATE" || { echo PREVIOUS_RECORD_DIVERGED; exit 65; }
 fi
 SAVED=$(sed -n 's/^BACKUP=//p' "$STATE")
 [[ "$SAVED" =~ ^vendorai-prod-api-candidate-backup-[a-z0-9-]+$ ]] || { echo INVALID_BACKUP_STATE;exit 65; }
 # Preserved from the installed Contabo operator: deny rollback of a release
 # whose image no longer matches the live container (another agent/release).
 RECORDED_IMAGE=$(sed -n 's/^IMAGE=//p' "$STATE" | head -1)
 ACTIVE_IMAGE=$(docker inspect "$CURRENT" --format '{{.Config.Image}}' 2>/dev/null || true)
 [[ -n "$RECORDED_IMAGE" && "$ACTIVE_IMAGE" == "$RECORDED_IMAGE" ]] || {
   echo ROLLBACK_BLOCKED_PRODUCTION_VERSION_MISMATCH
   exit 65
 }

 [[ "$(sed -n 's/^STATUS=//p' "$STATE" | head -1)" == "PUBLISHED" ]] || { echo ROLLBACK_NOT_PUBLISHED;exit 65; }
 docker inspect "$SAVED" >/dev/null || { echo BACKUP_MISSING;exit 65; }
 if [[ -n "$PREVIOUS_STATE" ]]; then
  prior_image=$(sed -n 's/^IMAGE=//p' "$PREVIOUS_STATE" | head -1)
  [[ "$(docker inspect "$SAVED" --format '{{.Config.Image}}')" == "$prior_image" ]] || { echo ROLLBACK_PREVIOUS_IMAGE_MISMATCH; exit 65; }
  prior_backup=$(sed -n 's/^BACKUP=//p' "$PREVIOUS_STATE" | head -1)
  [[ "$prior_backup" =~ ^vendorai-prod-api-candidate-backup-[a-z0-9-]+$ ]] &&
  docker inspect "$prior_backup" >/dev/null || { echo PREVIOUS_BACKUP_MISSING; exit 65; }
 fi
 REPLACED="${CURRENT}-failed-$(date -u +%s)"
 docker stop "$CURRENT" >/dev/null
 docker rename "$CURRENT" "$REPLACED"
 if ! docker rename "$SAVED" "$CURRENT"; then
   docker rename "$REPLACED" "$CURRENT"
   docker start "$CURRENT" >/dev/null || true
   echo ROLLBACK_RENAME_FAILED; exit 1
 fi
 if ! docker start "$CURRENT" >/dev/null; then
   docker rename "$CURRENT" "$SAVED"
   docker rename "$REPLACED" "$CURRENT"
   docker start "$CURRENT" >/dev/null || true
   echo ROLLBACK_START_FAILED_ORIGINAL_RESTORED;exit 1
 fi
 for _ in $(seq 1 30); do
   if check; then
     tmpstate=$(mktemp "$ROOT/state/.rollback.XXXXXXXX")
     sed 's/^STATUS=PUBLISHED$/STATUS=ROLLED_BACK/' "$STATE" > "$tmpstate"
     chmod 600 "$tmpstate"; mv -f "$tmpstate" "$STATE"
     if [[ -n "$PREVIOUS_STATE" ]]; then
       tmpprior=$(mktemp "$ROOT/state/.previous.XXXXXXXX")
       sed -e 's/^STATUS=SUPERSEDED$/STATUS=PUBLISHED/' -e '/^SUPERSEDED_BY=/d' "$PREVIOUS_STATE" > "$tmpprior"
       chmod 600 "$tmpprior"; mv -f "$tmpprior" "$PREVIOUS_STATE"
     fi
     echo ROLLBACK_HEALTH_200;log "ROLLBACK_OK";exit 0
   fi
   sleep 2
 done
 echo ROLLBACK_HEALTH_FAILED_MANUAL_RECOVERY_REQUIRED
 log "ROLLBACK_HEALTH_FAILED"
 exit 1
fi
# Publish only an image that was actually built and recorded with the requested commit.
BUILDSTATE="$ROOT/state/$LOT"
[[ -f "$BUILDSTATE" ]] || { echo BUILD_NOT_RECORDED;exit 65; }
grep -Fxq "SHA=$SHA" "$BUILDSTATE" || { echo SHA_MISMATCH;exit 65; }
grep -Fxq "IMAGE=$IMAGE" "$BUILDSTATE" || { echo IMAGE_MISMATCH;exit 65; }
grep -Fxq "STATUS=BUILT_NOT_DEPLOYED" "$BUILDSTATE" || { echo BUILD_NOT_APPROVED;exit 65; }
docker image inspect "$IMAGE" >/dev/null
[[ ! -e "$STATE" ]] || { echo RELEASE_RECORD_EXISTS_REQUIRES_RECONCILIATION;exit 65; }
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
success=1
# Write the new receipt first. A partial ledger transition blocks subsequent
# releases and requires reconciliation; it must never silently unlock a release.
tmpstate=$(mktemp "$ROOT/state/.publish.XXXXXXXX")
printf 'LOT=%s\nSHA=%s\nIMAGE=%s\nBACKUP=%s\nPREVIOUS_LOT=%s\nSTATUS=PUBLISHED\n' "$LOT" "$SHA" "$IMAGE" "$BACK" "$PREVIOUS_LOT" > "$tmpstate"
chmod 600 "$tmpstate"; mv -f "$tmpstate" "$STATE"
if [[ -n "$PREVIOUS_STATE" ]]; then
 tmpprior=$(mktemp "$ROOT/state/.previous.XXXXXXXX")
 sed 's/^STATUS=PUBLISHED$/STATUS=SUPERSEDED/' "$PREVIOUS_STATE" > "$tmpprior"
 printf 'SUPERSEDED_BY=%s\n' "$LOT" >> "$tmpprior"
 chmod 600 "$tmpprior"; mv -f "$tmpprior" "$PREVIOUS_STATE"
fi
log "PUBLISHED sha=$SHA backup=$BACK"
echo "VENDI04_PRODUCTION_HEALTH_200_BACKUP_PRESERVED"
