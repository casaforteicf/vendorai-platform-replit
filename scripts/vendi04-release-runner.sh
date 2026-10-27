#!/usr/bin/env bash
# VENDI-04 immutable-source release builder; never changes production.
set -Eeuo pipefail
ACTION="${1:-}"; LOT="${2:-}"
[[ "$#" == 2 && "$LOT" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]] || { echo INVALID_ARGUMENTS;exit 64; }
case "$ACTION" in build|status|rollback|reuse) ;; *) echo INVALID_ACTION;exit 64;; esac
BASE=/var/lib/vendi-release
REPO=/home/vendorai/vendorai-api-auth-test
MANIFEST="$BASE/manifests/$LOT.env"
STATE="$BASE/state/$LOT"
mkdir -p "$BASE/state" "$BASE/work"
exec 8>"/run/lock/vendi-release-$LOT.lock"
flock -n 8 || { echo RELEASE_BUSY; exit 75; }
[[ -f "$MANIFEST" ]] || { echo "MANIFEST_NOT_REGISTERED";exit 65; }
# Manifests are root-owned and must not be writable by the MCP SSH user.
[[ "$(stat -c %u "$MANIFEST")" == 0 ]] || { echo MANIFEST_OWNER_INVALID;exit 65; }
# Only exact keys are accepted; manifest values are data, never shell code.
get(){ sed -n "s/^$1=//p" "$MANIFEST" | head -1; }
SHA=$(get SHA); DOCKERFILE=$(get DOCKERFILE); CONTEXT=$(get CONTEXT)
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo INVALID_SHA;exit 64; }
[[ "$DOCKERFILE" =~ ^[A-Za-z0-9_./-]+$ && "$DOCKERFILE" != /* && "$DOCKERFILE" != *..* ]] || { echo INVALID_DOCKERFILE;exit 64; }
[[ "$CONTEXT" =~ ^[A-Za-z0-9_./-]+$ && "$CONTEXT" != /* && "$CONTEXT" != *..* ]] || { echo INVALID_CONTEXT;exit 64; }
IMAGE="vendorai-release:${LOT,,}-${SHA:0:12}"
record(){ printf '%s %s\n' "$(date -u +%FT%TZ)" "$1" | tee -a "$BASE/state/$LOT.log"; }
reuse_existing_sha_image() {
  # Reuse the exact Docker image ID from another registered lot. A new tag
  # does not copy layers or start a container. Never reuse a different
  # Dockerfile/context or an unverified build state.
  local other file prefix other_sha other_df other_ctx oldtag oldstate oldid
  for file in "$BASE"/manifests/*.env; do
    [[ -f "$file" && ! -L "$file" ]] || continue
    [[ "$(stat -c %u "$file")" == 0 ]] || continue
    other="${file##*/}"; other="${other%.env}"
    [[ "$other" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]] || continue
    [[ "$other" != "$LOT" ]] || continue
    other_sha=$(sed -n 's/^SHA=//p' "$file" | head -1)
    other_df=$(sed -n 's/^DOCKERFILE=//p' "$file" | head -1)
    other_ctx=$(sed -n 's/^CONTEXT=//p' "$file" | head -1)
    [[ "$other_sha" == "$SHA" && "$other_df" == "$DOCKERFILE" && "$other_ctx" == "$CONTEXT" ]] || continue
    oldtag="vendorai-release:${other,,}-${SHA:0:12}"
    oldstate="$BASE/state/$other"
    [[ -f "$oldstate" && ! -L "$oldstate" && "$(stat -c %u "$oldstate")" == 0 ]] || continue
    grep -Fxq "SHA=$SHA" "$oldstate" &&
    grep -Fxq "IMAGE=$oldtag" "$oldstate" &&
    grep -Fxq 'STATUS=BUILT_NOT_DEPLOYED' "$oldstate" || continue
    oldid=$(docker image inspect "$oldtag" --format '{{.Id}}' 2>/dev/null) || continue
    [[ "$oldid" == sha256:* ]] || continue
    docker tag "$oldtag" "$IMAGE"
    [[ "$(docker image inspect "$IMAGE" --format '{{.Id}}')" == "$oldid" ]] || return 70
    umask 077
    { printf 'LOT=%s\nSHA=%s\nIMAGE=%s\nSTATUS=BUILT_NOT_DEPLOYED\nREUSED_FROM=%s\nIMAGE_ID=%s\n' "$LOT" "$SHA" "$IMAGE" "$other" "$oldid"; } > "$STATE.tmp"
    mv -f "$STATE.tmp" "$STATE"
    record "IMAGE_REUSED_EXISTING_SHA from=$other"
    echo "IMAGE_REUSED_EXISTING_SHA"
    return 0
  done
  return 74
}
case "$ACTION" in
 reuse)
   exec 7>/run/lock/vendi-release-global-build.lock
   flock -n 7 || { echo BUILD_BUSY_OTHER_LOT; exit 75; }
   if reuse_existing_sha_image; then exit 0; fi
   echo IMAGE_REUSE_NOT_AVAILABLE
   exit 74
   ;;
 status)
   echo "LOT=$LOT SHA=$SHA IMAGE=$IMAGE"
   docker image inspect "$IMAGE" --format 'IMAGE_PRESENT={{.Id}}' 2>/dev/null || echo IMAGE_NOT_BUILT
   [[ -f "$STATE" ]] && cat "$STATE" || true
   ;;
 rollback)
   # No cross-environment rollback until validated container topology exists.
   echo "ROLLBACK_REQUIRES_SIGNED_DEPLOYMENT_RECORD_AND_RESTORABLE_PREVIOUS_CONTAINER"
   record "ROLLBACK_DENIED_NO_SAFE_DEPLOYMENT_RECORD"
   exit 65
   ;;
 build)
   # System-wide exclusive build gate: per-lot locking alone permits two
   # concurrent Docker builds on the constrained production VPS.
   exec 7>/run/lock/vendi-release-global-build.lock
   flock -n 7 || { echo BUILD_BUSY_OTHER_LOT; exit 75; }
   /usr/local/sbin/vendi04-release-preflight "$LOT" || exit $?
   [[ -d "$REPO/.git" ]] || { echo REPOSITORY_MISSING;exit 65; }
   work="$BASE/work/$LOT"
   [[ ! -e "$work" ]] || { echo EXISTING_WORKTREE_REQUIRES_REVIEW;exit 75; }
   git -c safe.directory="$REPO" -C "$REPO" cat-file -e "$SHA^{commit}" || { echo COMMIT_MISSING_FETCH_REQUIRED;exit 65; }
   if reuse_existing_sha_image; then
     echo BUILD_SKIPPED_REUSED_IMAGE
     exit 0
   fi
   # No new image layers may be created if production resource reserves
   # are low. Even a manually invoked runner must obey these gates.
   FREE_KB=$(df -Pk / | awk 'NR==2 {print $4}')
   MEM_KB=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
   SWAP_TOTAL_KB=$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)
   SWAP_FREE_KB=$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)
   [[ "$FREE_KB" =~ ^[0-9]+$ && "$MEM_KB" =~ ^[0-9]+$ &&
      "$SWAP_TOTAL_KB" =~ ^[0-9]+$ && "$SWAP_FREE_KB" =~ ^[0-9]+$ ]] || {
     echo RESOURCE_METRICS_UNAVAILABLE; exit 75;
   }
   if (( FREE_KB < 14680064 || MEM_KB < 2097152 ||
         (SWAP_TOTAL_KB > 0 && (SWAP_TOTAL_KB - SWAP_FREE_KB) * 100 / SWAP_TOTAL_KB > 75) )); then
     echo BUILD_BLOCKED_RESOURCE_PRESSURE
     echo "FREE_KB=$FREE_KB MEM_AVAILABLE_KB=$MEM_KB"
     exit 75
   fi
   DISTINCT_IMAGES=$(docker image ls -q --no-trunc | sort -u | wc -l)
   [[ "$DISTINCT_IMAGES" =~ ^[0-9]+$ ]] || { echo IMAGE_INVENTORY_UNAVAILABLE; exit 75; }
   if (( DISTINCT_IMAGES >= 20 )); then
     echo BUILD_BLOCKED_IMAGE_RETENTION_REVIEW
     echo "DISTINCT_IMAGES=$DISTINCT_IMAGES"
     exit 75
   fi
   # At most two unpromoted candidate images may be retained across all lots.
   # Historical states without an actual Docker image do not count. Never
   # delete these images automatically; an operator must reconcile/retain.
   PENDING_IMAGES=0
   for pending_state in "$BASE"/state/*; do
     [[ -f "$pending_state" && ! -L "$pending_state" ]] || continue
     pending_lot="${pending_state##*/}"
     [[ "$pending_lot" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]] || continue
     [[ "$pending_lot" != "$LOT" ]] || continue
     grep -Fxq 'STATUS=BUILT_NOT_DEPLOYED' "$pending_state" || continue
     pending_image=$(sed -n 's/^IMAGE=//p' "$pending_state" | head -1)
     [[ "$pending_image" =~ ^vendorai-release:vendi-[a-z0-9-]+-[0-9a-f]{12}$ ]] || continue
     if docker image inspect "$pending_image" >/dev/null 2>&1; then
       PENDING_IMAGES=$((PENDING_IMAGES + 1))
     fi
   done
   if (( PENDING_IMAGES >= 2 )); then
     echo BUILD_BLOCKED_UNPROMOTED_IMAGE_BACKLOG
     echo "PENDING_IMAGES=$PENDING_IMAGES"
     exit 75
   fi
   mkdir -p "$work"
   cleanup(){ rm -rf "$work"; }
   trap cleanup EXIT
   # Git archive avoids altering any developer's checked-out working tree.
   git -c safe.directory="$REPO" -C "$REPO" archive "$SHA" | tar -xf - -C "$work"
   [[ -f "$work/$DOCKERFILE" && -d "$work/$CONTEXT" ]] || { echo BUILD_CONTEXT_INVALID;exit 65; }
   record "BUILD_START sha=$SHA"
   # The MCP queues this long-running build as a host-local systemd unit.
   # Persist a terminal failure record even if the initiating SSH call closes.
   build_failed(){
     local rc="$?"
     { printf 'LOT=%s\nSHA=%s\nIMAGE=%s\nSTATUS=BUILD_FAILED\nEXIT_CODE=%s\n' "$LOT" "$SHA" "$IMAGE" "$rc"; } > "$STATE.tmp" || true
     [[ -f "$STATE.tmp" ]] && mv "$STATE.tmp" "$STATE" || true
     record "BUILD_FAILED rc=$rc" || true
     exit "$rc"
   }
   trap build_failed ERR
   docker build --pull=false -f "$work/$DOCKERFILE" -t "$IMAGE" "$work/$CONTEXT"
   docker image inspect "$IMAGE" --format 'BUILD_IMAGE_ID={{.Id}}'
   { echo "LOT=$LOT";echo "SHA=$SHA";echo "IMAGE=$IMAGE";echo "STATUS=BUILT_NOT_DEPLOYED"; } > "$STATE.tmp"
   mv "$STATE.tmp" "$STATE"
   record "BUILD_DONE image=$IMAGE"
   echo "VENDI04_BUILD_SUCCEEDED_NO_DEPLOY"
   ;;
esac
