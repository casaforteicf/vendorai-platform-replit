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
# Global release safety: no other lot may retain an unresolved publication.
# An inconsistent historical release MUST be reconciled explicitly (not deleted).
if [[ "$ACTION" == publish ]]; then
 for record in "$ROOT"/state/*.prod; do
  [[ -f "$record" && "$record" != "$STATE" ]] || continue
  record_status=$(sed -n 's/^STATUS=//p' "$record" | head -1)
  case "$record_status" in
   PUBLISHED|INCONSISTENT*) echo "OTHER_RELEASE_REQUIRES_RECONCILIATION"; log "BLOCKED_OTHER_RELEASE=$record"; exit 65;;
  esac
 done
fi
# Both publication and rollback serialize with the automatic Contabo cron deployment.
# The independent cron deploy must use the SAME shared flock.
# Refuse publication until a root-owned config pins a lock path whose use by
# the cron script was audited; guessing a lock silently permits overlap.
SHARED_LOCK_CONFIG=/etc/vendorai/vendi-shared-deploy-lock.path
[[ -f "$SHARED_LOCK_CONFIG" &&
   "$(stat -c %u "$SHARED_LOCK_CONFIG")" == 0 &&
   "$(stat -c %a "$SHARED_LOCK_CONFIG")" == 600 ]] || {
  echo SHARED_DEPLOY_LOCK_NOT_PROVISIONED; exit 65;
}
SHARED_LOCK=$(cat "$SHARED_LOCK_CONFIG")
[[ "$SHARED_LOCK" =~ ^/opt/vendorai/[a-zA-Z0-9._/-]+$ && "$SHARED_LOCK" != *..* &&
   -f /opt/vendorai/deploy-backend.sh ]] || { echo SHARED_DEPLOY_LOCK_INVALID; exit 65; }
grep -Fq "$SHARED_LOCK" /opt/vendorai/deploy-backend.sh || {
  echo SHARED_DEPLOY_LOCK_NOT_IN_CRON_SCRIPT; exit 65;
}
exec 8>"$SHARED_LOCK"
flock -n 8 || { echo AUTOMATIC_DEPLOY_IN_PROGRESS; exit 75; }
if [[ "$ACTION" == rollback ]]; then
 [[ -f "$STATE" ]] || { echo NO_ROLLBACK_STATE;exit 65; }
 RECORDED_IMAGE=$(sed -n 's/^IMAGE=//p' "$STATE")
 RECORDED_STATUS=$(sed -n 's/^STATUS=//p' "$STATE")
 ACTIVE_IMAGE=$(docker inspect "$CURRENT" --format '{{.Config.Image}}' 2>/dev/null || true)
 [[ "$RECORDED_STATUS" == PUBLISHED && -n "$RECORDED_IMAGE" && "$ACTIVE_IMAGE" == "$RECORDED_IMAGE" ]] || { echo ROLLBACK_BLOCKED_PRODUCTION_VERSION_MISMATCH;exit 65; }
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
 REPLACED="${CURRENT}-failed-$(date -u +%s)"
 docker inspect "$REPLACED" >/dev/null 2>&1 && { echo ROLLBACK_TEMP_NAME_ALREADY_EXISTS; exit 65; }
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
     echo ROLLBACK_HEALTH_200;log "ROLLBACK_OK";exit 0
   fi
   sleep 2
 done
 # The backup container started, but failed its health gate. Restore the
 # previously running image instead of leaving production in a failed state.
 log "ROLLBACK_BACKUP_UNHEALTHY_RESTORING_ORIGINAL"
 if docker stop "$CURRENT" >/dev/null 2>&1 &&
    docker rename "$CURRENT" "$SAVED" &&
    docker rename "$REPLACED" "$CURRENT" &&
    docker start "$CURRENT" >/dev/null; then
   for _ in $(seq 1 30); do
     if check; then
       echo ROLLBACK_BACKUP_UNHEALTHY_ORIGINAL_RESTORED
       log "ROLLBACK_ABORTED_ORIGINAL_RESTORED"
       exit 1
     fi
     sleep 2
   done
 fi
 echo ROLLBACK_HEALTH_FAILED_MANUAL_RECOVERY_REQUIRED
 log "ROLLBACK_HEALTH_FAILED_MANUAL_RECOVERY"
 exit 1
fi
# Publish only an image that was actually built and recorded with the requested commit.
BUILDSTATE="$ROOT/state/$LOT"
[[ -f "$BUILDSTATE" ]] || { echo BUILD_NOT_RECORDED;exit 65; }
grep -Fxq "SHA=$SHA" "$BUILDSTATE" || { echo SHA_MISMATCH;exit 65; }
grep -Fxq "IMAGE=$IMAGE" "$BUILDSTATE" || { echo IMAGE_MISMATCH;exit 65; }
grep -Fxq "STATUS=BUILT_NOT_DEPLOYED" "$BUILDSTATE" || { echo BUILD_NOT_APPROVED;exit 65; }
docker image inspect "$IMAGE" >/dev/null
# A built image is never sufficient for publication. Require a recent, root-owned
# receipt from the isolated read-only candidate homologation of this exact image ID.
PROOF="$ROOT/state/$LOT.homolog"
[[ -f "$PROOF" && "$(stat -c %u "$PROOF")" == 0 &&
   "$(stat -c %a "$PROOF")" == 600 ]] || { echo HOMOLOG_RECEIPT_REQUIRED; exit 65; }
grep -Fxq "LOT=$LOT" "$PROOF" &&
grep -Fxq "SHA=$SHA" "$PROOF" &&
grep -Fxq "IMAGE=$IMAGE" "$PROOF" &&
grep -Fxq "STATUS=HOMOLOGATED" "$PROOF" &&
grep -Fxq "MODE=ISOLATED_READONLY" "$PROOF" || {
  echo HOMOLOG_RECEIPT_MISMATCH; exit 65;
}
PROOF_IMAGE_ID=$(sed -n 's/^IMAGE_ID=//p' "$PROOF" | head -1)
ACTUAL_IMAGE_ID=$(docker image inspect "$IMAGE" --format '{{.Id}}')
[[ -n "$PROOF_IMAGE_ID" && "$PROOF_IMAGE_ID" == "$ACTUAL_IMAGE_ID" ]] || {
  echo HOMOLOG_IMAGE_DIGEST_MISMATCH; exit 65;
}
PROOF_TIME=$(sed -n 's/^AT_EPOCH=//p' "$PROOF" | head -1)
NOW=$(date +%s)
[[ "$PROOF_TIME" =~ ^[0-9]{10,12}$ ]] && (( PROOF_TIME <= NOW && NOW - PROOF_TIME <= 86400 )) || {
  echo HOMOLOG_RECEIPT_EXPIRED; exit 65;
}
# Pin the database migration baseline to the ACTUALLY running production image.
# If schema changes are detected, rollback requires a separately reviewed
# compatibility/restore proof. Never infer migration safety from HTTP 200.
REPO=/home/vendorai/vendorai-api-auth-test
[[ -d "$REPO/.git" ]] || { echo RELEASE_GIT_REPOSITORY_UNAVAILABLE; exit 65; }
BASE_IMAGE=$(docker inspect "$CURRENT" --format '{{.Config.Image}}')
BASE_REV=""
if [[ "$BASE_IMAGE" =~ ^vendorai-api:main-([a-f0-9]{9,12})$ ]]; then
  BASE_REV="${BASH_REMATCH[1]}"
elif [[ "$BASE_IMAGE" =~ ^vendorai-release:vendi-[a-z0-9-]+-([a-f0-9]{12})$ ]]; then
  BASE_REV="${BASH_REMATCH[1]}"
fi
[[ -n "$BASE_REV" ]] || { echo PRODUCTION_SOURCE_REVISION_UNKNOWN; exit 65; }
BASE_SHA=$(git -c "safe.directory=$REPO" -C "$REPO" rev-parse --verify "$BASE_REV^{commit}" 2>/dev/null) ||
  { echo PRODUCTION_SOURCE_SHA_NOT_AVAILABLE; exit 65; }
git -c "safe.directory=$REPO" -C "$REPO" cat-file -e "$SHA^{commit}" 2>/dev/null ||
  { echo RELEASE_CANDIDATE_SHA_NOT_AVAILABLE; exit 65; }
git -c "safe.directory=$REPO" -C "$REPO" merge-base --is-ancestor "$BASE_SHA" "$SHA" ||
  { echo RELEASE_SOURCE_NOT_DESCENDANT_OF_PRODUCTION; exit 65; }
SCHEMA_FILES=$(git -c "safe.directory=$REPO" -C "$REPO" diff --name-only "$BASE_SHA" "$SHA" -- lib/db/migrations lib/db/src/schema) ||
  { echo SCHEMA_DIFF_UNAVAILABLE; exit 65; }
if [[ -n "$SCHEMA_FILES" ]]; then
  SCHEMA_PROOF="$ROOT/state/$LOT.schema-reviewed"
  [[ -f "$SCHEMA_PROOF" && "$(stat -c %u "$SCHEMA_PROOF")" == 0 &&
    "$(stat -c %a "$SCHEMA_PROOF")" == 600 ]] || {
      echo SCHEMA_CHANGE_REVIEW_REQUIRED; exit 65;
    }
  grep -Fxq "LOT=$LOT" "$SCHEMA_PROOF" &&
  grep -Fxq "BASE_SHA=$BASE_SHA" "$SCHEMA_PROOF" &&
  grep -Fxq "SHA=$SHA" "$SCHEMA_PROOF" &&
  grep -Fxq "STATUS=ROLLBACK_COMPATIBILITY_VERIFIED" "$SCHEMA_PROOF" || {
    echo SCHEMA_COMPATIBILITY_EVIDENCE_MISMATCH; exit 65;
  }
fi
echo "SCHEMA_CHANGE_DETECTED=$([[ -n "$SCHEMA_FILES" ]] && echo YES || echo NO)"
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
printf 'LOT=%s\nSHA=%s\nIMAGE=%s\nBACKUP=%s\nSTATUS=PUBLISHED\n' "$LOT" "$SHA" "$IMAGE" "$BACK" > "$STATE"
success=1
log "PUBLISHED sha=$SHA backup=$BACK"
echo "VENDI04_PRODUCTION_HEALTH_200_BACKUP_PRESERVED"
