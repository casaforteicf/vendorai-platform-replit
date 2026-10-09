#!/usr/bin/env bash
# VENDI-04 immutable-source release builder; never changes production.
set -Eeuo pipefail
ACTION="${1:-}"; LOT="${2:-}"
[[ "$#" == 2 && "$LOT" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]] || { echo INVALID_ARGUMENTS;exit 64; }
case "$ACTION" in build|status|rollback) ;; *) echo INVALID_ACTION;exit 64;; esac
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
case "$ACTION" in
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
   /usr/local/sbin/vendi04-release-preflight "$LOT" || exit $?
   [[ -d "$REPO/.git" ]] || { echo REPOSITORY_MISSING;exit 65; }
   work="$BASE/work/$LOT"
   [[ ! -e "$work" ]] || { echo EXISTING_WORKTREE_REQUIRES_REVIEW;exit 75; }
   git -c safe.directory="$REPO" -C "$REPO" cat-file -e "$SHA^{commit}" || { echo COMMIT_MISSING_FETCH_REQUIRED;exit 65; }
   mkdir -p "$work"
   cleanup(){ rm -rf "$work"; }
   trap cleanup EXIT
   # Git archive avoids altering any developer's checked-out working tree.
   git -c safe.directory="$REPO" -C "$REPO" archive "$SHA" | tar -xf - -C "$work"
   [[ -f "$work/$DOCKERFILE" && -d "$work/$CONTEXT" ]] || { echo BUILD_CONTEXT_INVALID;exit 65; }
   record "BUILD_START sha=$SHA"
   docker build --pull=false -f "$work/$DOCKERFILE" -t "$IMAGE" "$work/$CONTEXT"
   docker image inspect "$IMAGE" --format 'BUILD_IMAGE_ID={{.Id}}'
   { echo "LOT=$LOT";echo "SHA=$SHA";echo "IMAGE=$IMAGE";echo "STATUS=BUILT_NOT_DEPLOYED"; } > "$STATE.tmp"
   mv "$STATE.tmp" "$STATE"
   record "BUILD_DONE image=$IMAGE"
   echo "VENDI04_BUILD_SUCCEEDED_NO_DEPLOY"
   ;;
esac
