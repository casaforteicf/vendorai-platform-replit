#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ZONE_ID:?CLOUDFLARE_ZONE_ID is required}"

GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-casaforteicf/vendorai-platform-replit}"

API="https://api.cloudflare.com/client/v4"
REVISION="${RAILWAY_GIT_COMMIT_SHA:-${GIT_COMMIT_SHA:-unknown}}"

github_status() {
  local state="$1"
  local description="$2"
  if [ "$REVISION" = "unknown" ] || [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
    return 0
  fi
  curl -fsSL -X POST \
    -H "Authorization: Bearer $GITHUB_PERSONAL_ACCESS_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$GITHUB_REPOSITORY/statuses/$REVISION" \
    -d "$(jq -nc --arg state "$state" --arg desc "$description" '{state:$state,context:"vendorai/merge-publish",description:$desc}')" \
    >/dev/null || true
}

fail_release() {
  local message="${1:-Publicação não validada em produção}"
  echo "❌ FALHOU — $message"
  github_status failure "FALHOU — publicação não validada"
  exit 1
}

trap 'code=$?; if [ "$code" -ne 0 ]; then github_status failure "FALHOU — publicação não validada"; fi' EXIT

github_status pending "EM EXECUÇÃO — publicação e validação em andamento"

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  zone="$(curl -fsSL -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" "$API/zones/$CLOUDFLARE_ZONE_ID")"
  CLOUDFLARE_ACCOUNT_ID="$(jq -r '.result.account.id // empty' <<<"$zone")"
  export CLOUDFLARE_ACCOUNT_ID
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Could not determine CLOUDFLARE_ACCOUNT_ID from zone."
  exit 1
fi

echo "Publishing VendorAI revision $REVISION via Railway release publisher"

# Idempotency guard: if the primary route already published this exact revision
# and the public site is healthy, do not create a duplicate production deploy.
if [ "$REVISION" != "unknown" ]; then
  prefix="${REVISION:0:12}"
  current_app="$(curl -fsSL --connect-timeout 5 --max-time 15 "https://app.appvendorai.com/?__vendorai_probe=$RANDOM" || true)"
  site_healthy=false
  if curl -fsSL --connect-timeout 5 --max-time 15 "https://appvendorai.com/?__vendorai_probe=$RANDOM" >/dev/null; then
    site_healthy=true
  fi
  if grep -F -- "-$prefix-" <<<"$current_app" >/dev/null && [ "$site_healthy" = true ]; then
    echo "✅ CONCLUÍDO — revisão $REVISION já publicada e validada em produção."
    github_status success "CONCLUÍDO — publicado e validado em produção"
    trap - EXIT
    exec tail -f /dev/null
  fi
fi

export VENDOR_BUILD_ID="$REVISION"

pnpm --filter @workspace/frontend build
pnpm --filter @workspace/website build

test -f artifacts/frontend/dist/public/index.html
test -f artifacts/frontend/dist/public/_worker.js
test -f artifacts/website/dist/public/index.html
test -f artifacts/website/dist/public/_worker.js

pnpm dlx wrangler@3.90.0 pages project create vendorai --production-branch main || true
pnpm dlx wrangler@3.90.0 pages deploy artifacts/frontend/dist/public --project-name vendorai --branch main

pnpm dlx wrangler@3.90.0 pages project create vendorai-website --production-branch main || true
pnpm dlx wrangler@3.90.0 pages deploy artifacts/website/dist/public --project-name vendorai-website --branch main

prefix="${REVISION:0:12}"
for attempt in {1..24}; do
  app_html="$(curl -fsSL --connect-timeout 5 --max-time 15 "https://app.appvendorai.com/?__vendorai_release=$RANDOM" || true)"
  app_ok=false
  site_ok=false

  if [ "$REVISION" = "unknown" ] || grep -F -- "-$prefix-" <<<"$app_html" >/dev/null; then
    app_ok=true
  fi

  if curl -fsSL --connect-timeout 5 --max-time 15 "https://appvendorai.com/?__vendorai_release=$RANDOM" >/dev/null; then
    site_ok=true
  fi

  echo "verify attempt=$attempt app=$app_ok website=$site_ok revision=$prefix"
  if [ "$app_ok" = true ] && [ "$site_ok" = true ]; then
    echo "✅ CONCLUÍDO — revisão $REVISION publicada e validada em produção."
    github_status success "CONCLUÍDO — publicado e validado em produção"
    trap - EXIT
    exec tail -f /dev/null
  fi
  sleep 10
done

fail_release "revisão $REVISION não foi validada em produção"
