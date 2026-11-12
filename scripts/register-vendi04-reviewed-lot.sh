#!/usr/bin/env bash
# Register reviewed immutable VENDI-04 lot. Registration ONLY: no build or deploy.
set -Eeuo pipefail
[[ $# -eq 2 ]] || { echo 'USAGE: register-vendi04-reviewed-lot LOT COMMIT_SHA'; exit 64; }
LOT=$1; SHA=$2
[[ "$LOT" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]] || { echo INVALID_LOT; exit 64; }
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo INVALID_SHA; exit 64; }
[[ $(id -u) -eq 0 ]] || { echo ROOT_REQUIRED; exit 77; }
REPO=/home/vendorai/vendorai-api-auth-test
BASE=/var/lib/vendi-release/manifests
[[ -d "$REPO/.git" ]] || { echo REPO_NOT_FOUND; exit 65; }
git -c safe.directory="$REPO" -C "$REPO" cat-file -e "$SHA^{commit}" || { echo COMMIT_NOT_PRESENT_FETCH_REQUIRED; exit 65; }
git -c safe.directory="$REPO" -C "$REPO" cat-file -e "$SHA:backend/Dockerfile" || { echo BACKEND_DOCKERFILE_MISSING; exit 65; }
install -d -o root -g root -m 0700 "$BASE"
target="$BASE/$LOT.env"
[[ ! -e "$target" ]] || { echo LOT_ALREADY_REGISTERED_NO_OVERWRITE; exit 65; }
umask 077
tmp=$(mktemp "$BASE/.lot.XXXXXX")
trap 'rm -f "$tmp"' EXIT
printf 'SHA=%s\nDOCKERFILE=backend/Dockerfile\nCONTEXT=.\n' "$SHA" > "$tmp"
chown root:root "$tmp"; chmod 0600 "$tmp"
ln "$tmp" "$target" || { echo REGISTRATION_COLLISION; exit 65; }
echo "LOT_REGISTERED=$LOT"
echo "SHA=$SHA"
echo BUILD_AND_PRODUCTION_UNTOUCHED=true
