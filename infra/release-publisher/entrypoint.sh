#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ZONE_ID:?CLOUDFLARE_ZONE_ID is required}"

API="https://api.cloudflare.com/client/v4"
REVISION="${RAILWAY_GIT_COMMIT_SHA:-${GIT_COMMIT_SHA:-unknown}}"

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
    echo "Revision $REVISION is already live. Fallback publisher will not duplicate deployment."
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
    echo "VendorAI publication validated for revision $REVISION"
    exec tail -f /dev/null
  fi
  sleep 10
done

echo "Publication verification failed for revision $REVISION"
exit 1
