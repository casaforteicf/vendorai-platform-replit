#!/usr/bin/env bash
# Read-only production release drift check. Safe to run on Contabo, never triggers deploy.
set -Eeuo pipefail
REPO="${VENDORAI_RELEASE_REPO:-/home/vendorai/vendorai-api-auth-test}"
HOMOLOG_CONTAINER="${VENDORAI_HOMOLOG_CONTAINER:-vendorai-homolog-api}"
PRODUCTION_CONTAINER="${VENDORAI_PRODUCTION_CONTAINER:-vendorai-prod-api-candidate}"
fail=0
if [[ ! -d "$REPO/.git" ]]; then
  echo "REPO_UNAVAILABLE"; exit 2
fi
echo "SOURCE_HEAD=$(git -c safe.directory="$REPO" -C "$REPO" rev-parse HEAD)"
for pair in "HOMOLOG:$HOMOLOG_CONTAINER" "PRODUCTION_CANDIDATE:$PRODUCTION_CONTAINER"; do
  label="${pair%%:*}"; container="${pair#*:}"
  if ! docker inspect "$container" >/dev/null 2>&1; then
    echo "${label}_CONTAINER_MISSING"; fail=1; continue
  fi
  image=$(docker inspect "$container" --format '{{.Config.Image}}')
  status=$(docker inspect "$container" --format '{{.State.Status}}')
  echo "${label}_IMAGE=$image"
  echo "${label}_STATUS=$status"
  [[ "$status" == "running" ]] || fail=1
done
if [[ ! -d /var/lib/vendi-release/manifests ]]; then
  echo "MANIFEST_DIRECTORY_MISSING"
  fail=1
else
  shopt -s nullglob
  for manifest in /var/lib/vendi-release/manifests/*.env; do
    lot="${manifest##*/}"; lot="${lot%.env}"
    if [[ ! "$lot" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]]; then continue; fi
    owner=$(stat -c %u "$manifest")
    if [[ "$owner" != 0 ]]; then echo "MANIFEST_OWNER_INVALID lot=$lot"; fail=1; continue; fi
    sha=$(sed -n 's/^SHA=//p' "$manifest" | head -1)
    if [[ ! "$sha" =~ ^[a-f0-9]{40}$ ]]; then echo "MANIFEST_SHA_INVALID lot=$lot"; fail=1; continue; fi
    echo "MANIFEST lot=$lot sha=$sha"
    state="/var/lib/vendi-release/state/$lot.prod"
    if [[ -f "$state" ]]; then
      published=$(sed -n 's/^STATUS=//p' "$state" | head -1)
      backup=$(sed -n 's/^BACKUP=//p' "$state" | head -1)
      echo "RELEASE_RECORD lot=$lot status=$published"
      if [[ "$published" == PUBLISHED ]] && [[ -z "$backup" || ! "$(docker inspect "$backup" --format '{{.Name}}' 2>/dev/null || true)" ]]; then
        echo "RELEASE_ROLLBACK_BACKUP_MISSING lot=$lot"; fail=1
      fi
    fi
  done
fi
echo "CLOUDFLARE_FRONTEND_VERSION=NOT_VERIFIED_BY_THIS_HOST_CHECK"
if (( fail )); then echo "RELEASE_DRIFT_CHECK=BLOCKED"; exit 1; fi
echo "RELEASE_DRIFT_CHECK=HOST_INVENTORY_OK_MANUAL_SHA_RECONCILIATION_REQUIRED"
