#!/usr/bin/env bash
# Explicit one-shot installer invoked on Contabo by authorized operator.
set -Eeuo pipefail
ROOT=/home/vendorai/vendorai-api-auth-test
BRANCH=feature/vendi-native-crm-read-20261009
REMOTE=git@github.com:casaforteicf/vendorai-platform-replit.git
[[ -d "$ROOT/.git" ]] || { echo REPOSITORY_NOT_FOUND;exit 65; }
if [[ -n "${VENDI04_SOURCE_SHA:-}" ]]; then
 SHA="$VENDI04_SOURCE_SHA"
else
 git -c safe.directory="$ROOT" -C "$ROOT" fetch --no-tags "$REMOTE" "$BRANCH"
 SHA=$(git -c safe.directory="$ROOT" -C "$ROOT" rev-parse FETCH_HEAD)
fi
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 65
git -c safe.directory="$ROOT" -C "$ROOT" cat-file -e "$SHA^{commit}" || { echo SOURCE_COMMIT_NOT_FOUND;exit 65; }
STAGING=$(mktemp -d /tmp/vendi04-bootstrap.XXXXXXXX)
trap 'rm -rf "$STAGING"' EXIT
for p in scripts/vendi-contabo-operator scripts/vendi04-release-runner.sh scripts/vendi04-release-preflight.sh scripts/vendi04-controlled-release.sh scripts/install-vendi04-release-runner.sh artifacts/cloudflare-mcp/src/index.ts; do
 mkdir -p "$STAGING/$(dirname "$p")"
 git -c safe.directory="$ROOT" -C "$ROOT" show "$SHA:$p" > "$STAGING/$p"
done
for p in scripts/vendi-contabo-operator scripts/vendi04-release-runner.sh scripts/vendi04-release-preflight.sh scripts/vendi04-controlled-release.sh scripts/install-vendi04-release-runner.sh;do bash -n "$STAGING/$p";done
echo "SOURCE_SHA=$SHA"
echo "VALIDATED_STAGE=$STAGING"
# Operator install is enabled only when explicitly called with install.
if [[ "${1:-audit}" == "install" ]]; then
  VENDI04_SOURCE_ROOT="$STAGING" bash "$STAGING/scripts/install-vendi04-release-runner.sh"
else
  echo "VENDI04_SOURCE_AUDIT_PASSED_NO_PRODUCTION_CHANGE"
fi
