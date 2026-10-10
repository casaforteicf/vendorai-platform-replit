#!/usr/bin/env bash
set -Eeuo pipefail
REPO=/home/vendorai/vendorai-api-auth-test
MCP=vendorai-mcp-contabo-fixed
WORK=/app/.vendi04-build
TMP=$(mktemp -d /tmp/vendi04.XXXXXXXX)
chmod 700 "$TMP"
swapped=0;success=0
cleanup(){
 if [[ "$success" != 1 ]]; then
   if [[ "$swapped" == 1 ]]; then
     docker cp "$TMP/mcp-index.js" "$MCP":/app/dist/index.js >/dev/null 2>&1 || true
     docker restart "$MCP" >/dev/null 2>&1 || true
   fi
   if [[ -s "$TMP/operator" ]]; then install -o root -g root -m 0750 "$TMP/operator" /usr/local/sbin/vendi-contabo-operator; fi
   if [[ -s "$TMP/preflight" ]]; then install -o root -g root -m 0750 "$TMP/preflight" /usr/local/sbin/vendi04-release-preflight; else rm -f /usr/local/sbin/vendi04-release-preflight; fi
 fi
 docker exec "$MCP" rm -rf "$WORK" >/dev/null 2>&1 || true
 rm -rf "$TMP"
}
trap cleanup EXIT
test -s "$REPO/scripts/vendi-contabo-operator"
test -s "$REPO/scripts/vendi04-release-preflight.sh"
test -s "$REPO/artifacts/cloudflare-mcp/src/index.ts"
docker cp "$MCP":/app/dist/index.js "$TMP/mcp-index.js" >/dev/null
cp /usr/local/sbin/vendi-contabo-operator "$TMP/operator"
if [[ -f /usr/local/sbin/vendi04-release-preflight ]]; then cp /usr/local/sbin/vendi04-release-preflight "$TMP/preflight"; fi
bash -n "$REPO/scripts/vendi-contabo-operator" "$REPO/scripts/vendi04-release-preflight.sh"
echo "=== INSTALANDO PREFLIGHT RESTRITO ==="
install -o root -g root -m 0750 "$REPO/scripts/vendi04-release-preflight.sh" /usr/local/sbin/vendi04-release-preflight
install -o root -g root -m 0750 "$REPO/scripts/vendi-contabo-operator" /usr/local/sbin/vendi-contabo-operator
echo "=== TESTE PREFLIGHT NO HOST ==="
sudo -n /usr/local/sbin/vendi-contabo-operator preflight VENDI-02
echo "=== COMPILANDO MCP NO CONTAINER EXISTENTE ==="
docker exec "$MCP" sh -lc "mkdir -p '$WORK'; cp -a /app/src '$WORK/'; cp /app/tsconfig.json /app/package.json '$WORK/'; ln -sfn /app/node_modules '$WORK/node_modules'"
docker cp "$REPO/artifacts/cloudflare-mcp/src/index.ts" "$MCP":$WORK/src/index.ts >/dev/null
docker exec "$MCP" /app/node_modules/.bin/tsc -p "$WORK/tsconfig.json"
docker cp "$MCP":$WORK/dist/index.js "$TMP/index.new.js" >/dev/null
docker cp "$TMP/index.new.js" "$MCP":/app/dist/index.js >/dev/null
swapped=1
docker restart "$MCP" >/dev/null
echo "=== AGUARDANDO HEALTH ==="
ready=0
for i in $(seq 1 30); do
  if docker exec "$MCP" node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||8788)+"/health",{signal:AbortSignal.timeout(1800)}).then(r=>{if(r.status!==200)process.exitCode=1}).catch(()=>process.exitCode=1)' >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]] || { echo "MCP_UNHEALTHY"; exit 1; }
echo "=== VALIDACAO SSH DO MCP ==="
docker exec "$MCP" node -e '
const {execFileSync}=require("node:child_process");
const fs=require("node:fs");
const host=fs.readFileSync("/app/.vendi-ssh/host","utf8").trim();
const out=execFileSync("ssh",["-i","/app/.vendi-ssh/id_ed25519","-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","StrictHostKeyChecking=yes","-o","UserKnownHostsFile=/app/.vendi-ssh/known_hosts","-o","ConnectTimeout=8","vendorai@"+host,"sudo -n /usr/local/sbin/vendi-contabo-operator preflight VENDI-02"],{timeout:25000,encoding:"utf8"});
console.log(out.slice(-1500));
if(!out.includes("VENDI04_RELEASE_PREFLIGHT_PASSED"))process.exit(1);
'
success=1
echo "VENDI04_PREFLIGHT_OPERACIONAL_NO_MCP"
echo "PRODUCTION_UNTOUCHED"
