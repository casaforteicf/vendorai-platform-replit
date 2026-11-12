#!/usr/bin/env bash
# Compare two Browser MCP operations against the SAME backend origin and token.
# Read-only calls, no credential output, no mutation.
set -euo pipefail
: "${BROWSER_MCP_BASE_URL:?Set backend origin (for example, http://127.0.0.1:3000)}"
: "${BROWSER_MCP_ACCESS_TOKEN:?Provide token through environment/secret manager}"
: "${TENANT_KEY:?Provide existing HOMOLOGATION tenant slug or id}"
base="${BROWSER_MCP_BASE_URL%/}"
case "$base" in https://*|http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing non-HTTPS remote origin" >&2; exit 2;; esac
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }
payload="$(jq -nc --arg k "$TENANT_KEY" '{tenantKey:$k}')"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
for endpoint in crm-summary connections; do
  status="$(curl --silent --show-error --max-time 20 -o "$tmpdir/$endpoint.json" -w '%{http_code}' \
    -H "Authorization: Bearer ${BROWSER_MCP_ACCESS_TOKEN}" \
    -H 'Content-Type: application/json' --data "$payload" \
    "$base/api/internal/browser-mcp/$endpoint")"
  result="$(jq -r '.error // (if .tenantId then "tenant_resolved" else "unexpected_response" end)' "$tmpdir/$endpoint.json" 2>/dev/null || echo invalid_json)"
  printf '%s HTTP=%s RESULT=%s\n' "$endpoint" "$status" "$result"
done
echo "Both requests targeted identical origin, credentials, and tenant key. Investigate routing, deployment and DB if results disagree."
