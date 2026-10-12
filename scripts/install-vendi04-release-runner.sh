#!/usr/bin/env bash
# Installs VENDI04 structured runner into existing Contabo host + MCP.
# Installation only. Does not build images, merge Git, or deploy production.
set -Eeuo pipefail
ROOT=${VENDI04_SOURCE_ROOT:-/home/vendorai/vendorai-api-auth-test}
MCP=vendorai-mcp-contabo-fixed
TMP=$(mktemp -d /tmp/vendi04-install.XXXXXX)
chmod 700 "$TMP"
WORK=/app/.vendi04-release-install
OK=0;SWAPPED=0
FILES=(vendi-contabo-operator vendi04-release-runner.sh vendi04-release-preflight.sh vendi04-controlled-release.sh)
rollback(){
 if [[ "$OK" != 1 ]]; then
   if [[ "$SWAPPED" == 1 ]]; then
     docker cp "$TMP/mcp-index.js" "$MCP":/app/dist/index.js >/dev/null 2>&1 || true
     docker restart "$MCP" >/dev/null 2>&1 || true
   fi
   for F in "${FILES[@]}"; do
     TARGET=/usr/local/sbin/${F%.sh}
     if [[ -f "$TMP/$F" ]]; then install -o root -g root -m 0750 "$TMP/$F" "$TARGET"; else rm -f "$TARGET"; fi
   done
 fi
 docker exec "$MCP" rm -rf "$WORK" >/dev/null 2>&1 || true
 rm -rf "$TMP"
}
trap rollback EXIT
for F in "${FILES[@]}"; do
 test -s "$ROOT/scripts/$F" || { echo "SOURCE_MISSING:$F";exit 65; }
 bash -n "$ROOT/scripts/$F" || { echo "SYNTAX_INVALID:$F";exit 65; }
 [[ ! -f "/usr/local/sbin/${F%.sh}" ]] || cp "/usr/local/sbin/${F%.sh}" "$TMP/$F"
done
test -s "$ROOT/artifacts/cloudflare-mcp/src/index.ts"
docker cp "$MCP":/app/dist/index.js "$TMP/mcp-index.js" >/dev/null
echo "=== MCP TYPECHECK AND BUILD IN ISOLATION ==="
docker exec "$MCP" sh -lc "mkdir -p '$WORK'; cp -a /app/src '$WORK/'; cp /app/tsconfig.json /app/package.json '$WORK/'; ln -sfn /app/node_modules '$WORK/node_modules'"
docker cp "$ROOT/artifacts/cloudflare-mcp/src/index.ts" "$MCP":$WORK/src/index.ts >/dev/null
docker exec "$MCP" /app/node_modules/.bin/tsc -p "$WORK/tsconfig.json"
docker cp "$MCP":$WORK/dist/index.js "$TMP/new-index.js" >/dev/null
echo "=== INSTALL HOST OPERATORS, NO RELEASE ==="
for F in "${FILES[@]}"; do install -o root -g root -m 0750 "$ROOT/scripts/$F" "/usr/local/sbin/${F%.sh}"; done
install -d -o root -g root -m 0700 /var/lib/vendi-release/manifests /var/lib/vendi-release/state /var/lib/vendi-release/work
docker cp "$TMP/new-index.js" "$MCP":/app/dist/index.js >/dev/null
SWAPPED=1
docker restart "$MCP" >/dev/null
ready=0
for I in $(seq 1 30);do
 if docker exec "$MCP" node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||8788)+"/health",{signal:AbortSignal.timeout(1500)}).then(r=>{if(r.status!==200)process.exitCode=1}).catch(()=>process.exitCode=1)' >/dev/null 2>&1;then ready=1;break;fi
 sleep 2
done
[[ "$ready" == 1 ]] || { echo MCP_HEALTH_FAILED;exit 1; }
echo "=== PRESERVE EXISTING VENDI02 OPERATIONS ==="
/usr/local/sbin/vendi-contabo-operator releaseStatus VENDI-02
OK=1
echo "VENDI04_RELEASE_OPERATOR_INSTALLED_NO_PRODUCTION_CHANGE"
echo "NEXT=REGISTER_IMMUTABLE_SOURCE_AND_BUILD_A_TEST_LOT"
