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
  recorded_id=$(sed -n 's/^IMAGE_ID=//p' "$STATE" | head -1)
  if [[ -n "$recorded_id" && "$(docker inspect "$CURRENT" --format '{{.Image}}')" != "$recorded_id" ]]; then echo RELEASE_DIGEST_MISMATCH; return 65; fi
 fi
}
# The consistency checks below are executed only after acquiring the cron lock.
# At most one preceding release can be active. Its state may be transitioned to
# SUPERSEDED only AFTER the new candidate passes its production health gate.
# Preserve its backup container; older/inconsistent PUBLISHED states still block.
PREVIOUS_PUBLISHED_RECORD=""
check_predecessor(){
if [[ "$ACTION" == publish ]]; then
 active_pre_publish=$(docker inspect "$CURRENT" --format '{{.Config.Image}}' 2>/dev/null || true)
 [[ -n "$active_pre_publish" ]] || { echo ACTIVE_PRODUCTION_IMAGE_UNKNOWN; exit 65; }
 for record in "$ROOT"/state/*.prod; do
  [[ -f "$record" && ! -L "$record" && "$record" != "$STATE" ]] || continue
  [[ "$(stat -c %u "$record")" == 0 ]] || { echo UNSAFE_HISTORICAL_RELEASE_RECORD; exit 65; }
  record_status=$(sed -n 's/^STATUS=//p' "$record" | head -1)
  record_lot="${record##*/}"; record_lot="${record_lot%.prod}"
  [[ "$record_lot" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]] || { echo INVALID_HISTORICAL_LOT; exit 65; }
  case "$record_status" in
   PUBLISHED)
    record_image=$(sed -n 's/^IMAGE=//p' "$record" | head -1)
    record_backup=$(sed -n 's/^BACKUP=//p' "$record" | head -1)
    [[ "$record_image" == "$active_pre_publish" && -n "$record_backup" ]] &&
      docker inspect "$record_backup" >/dev/null 2>&1 || {
       echo OTHER_RELEASE_REQUIRES_RECONCILIATION; log "BLOCKED_OTHER_RELEASE=$record"; exit 65;
      }
    [[ -z "$PREVIOUS_PUBLISHED_RECORD" ]] || { echo MULTIPLE_ACTIVE_RELEASE_RECORDS; exit 65; }
    PREVIOUS_PUBLISHED_RECORD="$record"
    ;;
   INCONSISTENT*) echo OTHER_RELEASE_REQUIRES_RECONCILIATION; log "BLOCKED_OTHER_RELEASE=$record"; exit 65;;
   SUPERSEDED)
    record_image=$(sed -n 's/^IMAGE=//p' "$record" | head -1)
    [[ "$record_image" != "$active_pre_publish" ]] || { echo ACTIVE_PREDECESSOR_REQUIRES_RECONCILIATION; exit 65; }
    ;;
  esac
 done
fi
}
# Both publication and rollback serialize with the automatic Contabo cron deployment.
# The independent cron deploy must use the SAME shared flock.
# Refuse publication until a root-owned config pins a lock path whose use by
# the cron script was audited; guessing a lock silently permits overlap.
SHARED_LOCK_CONFIG=/etc/vendorai/vendi-shared-deploy-lock.path
[[ -f "$SHARED_LOCK_CONFIG" && ! -L "$SHARED_LOCK_CONFIG" &&
   "$(stat -c %u "$SHARED_LOCK_CONFIG")" == 0 &&
   "$(stat -c %a "$SHARED_LOCK_CONFIG")" == 600 ]] || {
  echo SHARED_DEPLOY_LOCK_NOT_PROVISIONED; exit 65;
}
SHARED_LOCK=$(cat "$SHARED_LOCK_CONFIG")
[[ "$SHARED_LOCK" =~ ^/opt/vendorai/[a-zA-Z0-9._/-]+$ && "$SHARED_LOCK" != *..* &&
   -f /opt/vendorai/deploy-backend.sh ]] || { echo SHARED_DEPLOY_LOCK_INVALID; exit 65; }
# The installed Contabo cron derives its lock from BASE and LOCK variables:
# BASE="/opt/vendorai"; LOCK="$BASE/deploy.lock"; exec 9>"$LOCK"; flock -n 9.
# Accept either an explicit absolute path or this exact, audited derivation.
# Never assume that the presence of a flock command alone proves the same lock.
DEPLOY_SCRIPT=/opt/vendorai/deploy-backend.sh
# Only accept the exact known cron layout; comments or an unrelated flock
# statement are not sufficient evidence of lock coordination.
if [[ "$SHARED_LOCK" == "/opt/vendorai/deploy.lock" ]] &&
   grep -Fxq 'BASE="/opt/vendorai"' "$DEPLOY_SCRIPT" &&
   grep -Fxq 'LOCK="$BASE/deploy.lock"' "$DEPLOY_SCRIPT" &&
   grep -Eq '^[[:space:]]*exec[[:space:]]+9>[[:space:]]*"?[$]LOCK"?' "$DEPLOY_SCRIPT" &&
   grep -Eq '^[[:space:]]*if[[:space:]]+![[:space:]]+flock[[:space:]]+-n[[:space:]]+9([[:space:]]|;)' "$DEPLOY_SCRIPT"; then
  :
else
  echo SHARED_DEPLOY_LOCK_NOT_IN_CRON_SCRIPT; exit 65
fi
[[ ! -L "$SHARED_LOCK" ]] || { echo UNSAFE_SHARED_LOCK; exit 65; }
exec 8>"$SHARED_LOCK"
flock -n 8 || { echo AUTOMATIC_DEPLOY_IN_PROGRESS; exit 75; }
for record in "$ROOT"/state/*.prod; do
 [[ -e "$record" || -L "$record" ]] || continue
 [[ -f "$record" && ! -L "$record" && "$(stat -c %u "$record")" == 0 && "$(stat -c %a "$record")" == 600 ]] || { echo UNSAFE_RELEASE_RECORD; exit 65; }
done
 declared_previous=$(get PREVIOUS_LOT)
 if [[ -n "$declared_previous" ]]; then
   [[ "$PREVIOUS_PUBLISHED_RECORD" == "$ROOT/state/$declared_previous.prod" ]] || { echo DECLARED_PREDECESSOR_MISMATCH; exit 65; }
 fi
assert_consistent || { log "DENIED_INCONSISTENT_RELEASE_STATE"; exit 65; }
[[ "$(docker inspect "$CURRENT" --format '{{.State.Running}}')" == true ]] || { echo ACTIVE_PRODUCTION_NOT_RUNNING; exit 65; }
check_predecessor
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
 PREVIOUS_LOT=$(sed -n 's/^PREVIOUS_LOT=//p' "$STATE" | head -1)
 PREVIOUS_RECORD=""
 if [[ -n "$PREVIOUS_LOT" ]]; then
   [[ "$PREVIOUS_LOT" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ && "$PREVIOUS_LOT" != "$LOT" ]] || { echo INVALID_PREVIOUS_LOT; exit 65; }
   PREVIOUS_RECORD="$ROOT/state/$PREVIOUS_LOT.prod"
   [[ -f "$PREVIOUS_RECORD" ]] && grep -Fxq STATUS=SUPERSEDED "$PREVIOUS_RECORD" || { echo PREDECESSOR_STATE_MISMATCH; exit 65; }
   prior_image=$(sed -n 's/^IMAGE=//p' "$PREVIOUS_RECORD" | head -1)
   prior_backup=$(sed -n 's/^BACKUP=//p' "$PREVIOUS_RECORD" | head -1)
   [[ "$(docker inspect "$SAVED" --format '{{.Config.Image}}')" == "$prior_image" ]] && docker inspect "$prior_backup" >/dev/null 2>&1 || { echo PREDECESSOR_BACKUP_MISMATCH; exit 65; }
 fi
 REPLACED="${CURRENT}-failed-$(date -u +%s)"
 docker inspect "$REPLACED" >/dev/null 2>&1 && { echo ROLLBACK_TEMP_NAME_ALREADY_EXISTS; exit 65; }
 ROLLBACK_ORIGINAL=$(mktemp "$ROOT/state/.rollback-original.XXXXXXXX")
 cp -p "$STATE" "$ROLLBACK_ORIGINAL"
 rollback_done=0
 rollback_exit(){
   rc=$?
   trap - EXIT
   if [[ "$rollback_done" != 1 ]]; then
     recovery_state=$(mktemp "$ROOT/state/.rollback-recovery.XXXXXXXX")
     if [[ "$(docker inspect "$CURRENT" --format '{{.Config.Image}}' 2>/dev/null || true)" == "$RECORDED_IMAGE" ]] && check; then
       cat "$ROLLBACK_ORIGINAL" > "$recovery_state"
     else
       sed 's/^STATUS=.*/STATUS=INCONSISTENT_ROLLBACK/' "$ROLLBACK_ORIGINAL" > "$recovery_state"
     fi
     chmod 600 "$recovery_state"; mv -f "$recovery_state" "$STATE"
   fi
   rm -f "$ROLLBACK_ORIGINAL"
   exit "$rc"
 }
 trap rollback_exit EXIT
 sed 's/^STATUS=PUBLISHED$/STATUS=INCONSISTENT_ROLLBACK/' "$ROLLBACK_ORIGINAL" > "$STATE"
 docker stop "$CURRENT" >/dev/null
 if ! docker rename "$CURRENT" "$REPLACED"; then
   docker start "$CURRENT" >/dev/null || true
   echo ROLLBACK_ORIGINAL_RENAME_FAILED; exit 1
 fi
 if ! docker rename "$SAVED" "$CURRENT"; then
   docker rename "$REPLACED" "$CURRENT"
   docker start "$CURRENT" >/dev/null || true
   echo ROLLBACK_RENAME_FAILED; exit 1
 fi
 if ! docker start "$CURRENT" >/dev/null; then
   docker rename "$CURRENT" "$SAVED"
   docker rename "$REPLACED" "$CURRENT"
   docker start "$CURRENT" >/dev/null || true
   if check; then echo ROLLBACK_START_FAILED_ORIGINAL_RESTORED;
   else echo ROLLBACK_START_FAILED_MANUAL_RECOVERY_REQUIRED; fi
   exit 1
 fi
 for _ in $(seq 1 30); do
   if check; then
     tmpstate=$(mktemp "$ROOT/state/.rollback.XXXXXXXX")
     sed 's/^STATUS=PUBLISHED$/STATUS=ROLLED_BACK/' "$ROLLBACK_ORIGINAL" > "$tmpstate"
     docker inspect "$CURRENT" --format 'RESTORED_IMAGE_ID={{.Image}}' >> "$tmpstate"
     chmod 600 "$tmpstate"; mv -f "$tmpstate" "$STATE"
     if [[ -n "$PREVIOUS_RECORD" ]]; then
       tmpprior=$(mktemp "$ROOT/state/.reactivate.XXXXXXXX")
       sed -e 's/^STATUS=SUPERSEDED$/STATUS=PUBLISHED/' -e '/^SUPERSEDED_BY=/d' "$PREVIOUS_RECORD" > "$tmpprior"
       chmod 600 "$tmpprior"; mv -f "$tmpprior" "$PREVIOUS_RECORD"
     fi
     rollback_done=1
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
TEST_PROOF="$ROOT/state/$LOT.tests"
[[ -f "$TEST_PROOF" && ! -L "$TEST_PROOF" && "$(stat -c %u "$TEST_PROOF")" == 0 && "$(stat -c %a "$TEST_PROOF")" == 600 ]] || { echo TECHNICAL_TEST_RECEIPT_REQUIRED; exit 65; }
grep -Fxq "LOT=$LOT" "$TEST_PROOF" && grep -Fxq "SHA=$SHA" "$TEST_PROOF" &&
grep -Fxq 'STATUS=PASSED' "$TEST_PROOF" && grep -Fxq 'SUITE=api,mcp,operator,rollback,migrations' "$TEST_PROOF" || { echo TECHNICAL_TEST_RECEIPT_MISMATCH; exit 65; }
BUILDSTATE="$ROOT/state/$LOT"
[[ -f "$BUILDSTATE" ]] || { echo BUILD_NOT_RECORDED;exit 65; }
grep -Fxq "SHA=$SHA" "$BUILDSTATE" || { echo SHA_MISMATCH;exit 65; }
grep -Fxq "IMAGE=$IMAGE" "$BUILDSTATE" || { echo IMAGE_MISMATCH;exit 65; }
grep -Fxq "STATUS=BUILT_NOT_DEPLOYED" "$BUILDSTATE" || { echo BUILD_NOT_APPROVED;exit 65; }
docker image inspect "$IMAGE" >/dev/null
BUILD_IMAGE_ID=$(sed -n 's/^IMAGE_ID=//p' "$BUILDSTATE" | head -1)
[[ "$BUILD_IMAGE_ID" == "$(docker image inspect "$IMAGE" --format '{{.Id}}')" ]] || { echo BUILD_DIGEST_MISMATCH; exit 65; }
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
# Creating from a tag is safe only if the resulting container uses the verified digest.
if [[ "$(docker inspect "$NEXT" --format '{{.Image}}')" != "$ACTUAL_IMAGE_ID" ]]; then
 docker rm "$NEXT" >/dev/null
 echo CANDIDATE_DIGEST_CHANGED; exit 65
fi
swapped=0;success=0;prior_superseded=0
restore(){
 if [[ "$success" != 1 ]]; then
   log "ROLLING_BACK_FAILED_PUBLISH"
   if [[ "$swapped" == 1 ]]; then
     docker rm -f "$CURRENT" >/dev/null 2>&1 || true
     docker rename "$BACK" "$CURRENT" || log "FAILED_TO_RESTORE_BACKUP_NAME"
   fi
   # Includes failure after stopping the original but before its rename.
   docker start "$CURRENT" >/dev/null 2>&1 || log "FAILED_TO_RESTART_ORIGINAL"
   recovered=0
   for _ in $(seq 1 30); do
     if [[ "$(docker inspect "$CURRENT" --format '{{.Config.Image}}' 2>/dev/null || true)" == "$BASE_IMAGE" ]] && check; then recovered=1; break; fi
     sleep 2
   done
   if [[ "$recovered" != 1 ]]; then
     log "INCONSISTENT_PUBLISH_RECOVERY_FAILED"
     return 1
   fi
   rm -f "$STATE"
   if [[ "$prior_superseded" == 1 && -n "$PREVIOUS_PUBLISHED_RECORD" ]]; then
     restore_tmp=$(mktemp "$ROOT/state/.restore-prior.XXXXXXXX")
     sed -e 's/^STATUS=SUPERSEDED$/STATUS=PUBLISHED/' -e '/^SUPERSEDED_BY=/d' "$PREVIOUS_PUBLISHED_RECORD" > "$restore_tmp"
     chmod 600 "$restore_tmp"
     mv -f "$restore_tmp" "$PREVIOUS_PUBLISHED_RECORD" || log "PRIOR_RECORD_RECONCILIATION_REQUIRED"
   fi
 fi
 docker rm -f "$NEXT" >/dev/null 2>&1 || true
}
trap 'rc=$?; trap - EXIT; restore || true; cleanup; exit "$rc"' EXIT
umask 077
printf 'LOT=%s\nSHA=%s\nIMAGE=%s\nBACKUP=%s\nSTATUS=INCONSISTENT_PUBLISHING\n' "$LOT" "$SHA" "$IMAGE" "$BACK" > "$STATE"
docker stop "$CURRENT" >/dev/null
docker rename "$CURRENT" "$BACK"
swapped=1
docker rename "$NEXT" "$CURRENT"
docker start "$CURRENT" >/dev/null
ok=0
for _ in $(seq 1 45); do if check; then ok=1;break;fi;sleep 2;done
[[ "$ok" == 1 ]] || { echo RELEASE_HEALTH_FAILED;log "HEALTH_FAILED";exit 1; }
# Commit the supersession record only after the new image is healthy.
# If the subsequent new-state write fails, the EXIT trap restores both records.
if [[ -n "$PREVIOUS_PUBLISHED_RECORD" ]]; then
 prior_tmp=$(mktemp "$ROOT/state/.supersede.XXXXXXXX")
 sed 's/^STATUS=PUBLISHED$/STATUS=SUPERSEDED/' "$PREVIOUS_PUBLISHED_RECORD" > "$prior_tmp"
 printf 'SUPERSEDED_BY=%s\n' "$LOT" >> "$prior_tmp"
 chmod 600 "$prior_tmp"
 mv -f "$prior_tmp" "$PREVIOUS_PUBLISHED_RECORD"
 prior_superseded=1
fi
umask 077
previous_lot=""
if [[ -n "$PREVIOUS_PUBLISHED_RECORD" ]]; then
 previous_lot="${PREVIOUS_PUBLISHED_RECORD##*/}"; previous_lot="${previous_lot%.prod}"
fi
newstate=$(mktemp "$ROOT/state/.publish.XXXXXXXX")
printf 'LOT=%s\nSHA=%s\nIMAGE=%s\nIMAGE_ID=%s\nBACKUP=%s\nPREVIOUS_LOT=%s\nSTATUS=PUBLISHED\n' "$LOT" "$SHA" "$IMAGE" "$ACTUAL_IMAGE_ID" "$BACK" "$previous_lot" > "$newstate"
chmod 600 "$newstate"; mv -f "$newstate" "$STATE"
success=1
log "PUBLISHED sha=$SHA backup=$BACK"
echo "VENDI04_PRODUCTION_HEALTH_200_BACKUP_PRESERVED"
