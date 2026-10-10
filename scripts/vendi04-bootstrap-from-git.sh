#!/usr/bin/env bash
# Explicit one-shot installer invoked on Contabo by authorized operator.
set -Eeuo pipefail
ROOT=/home/vendorai/vendorai-api-auth-test
BRANCH=feature/vendi-native-crm-read-20261009
REMOTE=git@github.com:casaforteicf/vendorai-platform-replit.git
[[ -d "$ROOT/.git" ]] || { echo REPOSITORY_NOT_FOUND;exit 65; }
git -c safe.directory="$ROOT" -C "$ROOT" fetch --no-tags "$REMOTE" "$BRANCH"
SHA=$(git -c safe.directory="$ROOT" -C "$ROOT" rev-parse FETCH_HEAD)
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 65
STAGING=$(mktemp -d /tmp/vendi04-bootstrap.XXXXXXXX)
trap 'rm -rf "$STAGING"' EXIT
for p in scripts/vendi-contabo-operator scripts/vendi04-release-runner.sh scripts/vendi04-release-preflight.sh scripts/vendi04-controlled-release.sh scripts/install-vendi04-release-runner.sh artifacts/cloudflare-mcp/src/index.ts; do
 mkdir -p "$STAGING/$(dirname "$p")"
 git -c safe.directory="$ROOT" -C "$ROOT" show "$SHA:$p" > "$STAGING/$p"
done
for p in scripts/*.sh;do :;done
for p in scripts/vendi-contabo-operator scripts/vendi04-release-runner.sh scripts/vendi04-release-preflight.sh scripts/vendi04-controlled-release.sh scripts/install-vendi04-release-runner.sh;do bash -n "$STAGING/$p";done
echo "SOURCE_SHA=$SHA"
echo "VALIDATED_STAGE=$STAGING"
echo "The installer must use validated stage, not a developer checkout."
# Preserve tracked working-tree contents. Only copy to authorized temporary integration root.
install -d -m 0700 /home/vendorai/.vendi04-staging
cp -a "$STAGING/scripts" "$STAGING/artifacts" /home/vendorai/.vendi04-staging/
echo "VENDI04_SOURCES_STAGED_NO_PRODUCTION_CHANGE"
echo "INSTALL_BLOCKED_PENDING_REVIEW_OF_MCP_BUILD_AND_HOST_RELEASE_TOPOLOGY"
