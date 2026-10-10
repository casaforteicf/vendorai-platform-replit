#!/usr/bin/env bash
set -Eeuo pipefail
MCP=vendorai-mcp-contabo-fixed
ROOT=/home/vendorai/vendorai-api-auth-test
SRC="$ROOT/artifacts/cloudflare-mcp/src/index.ts"
HOSTSCRIPT="$ROOT/scripts/vendi-contabo-operator"
WORK=/app/.vendi03-operate-build
BACK=$(mktemp -d /tmp/vendi03-install.XXXXXX)
chmod 700 "$BACK"
SWAPPED=0; OK=0
cleanup(){
 if [[ "$SWAPPED" == 1 && "$OK" != 1 ]]; then
  docker cp "$BACK/index.js" "$MCP":/app/dist/index.js >/dev/null 2>&1 || true
  docker restart "$MCP" >/dev/null 2>&1 || true
 fi
 docker exec "$MCP" rm -rf "$WORK" >/dev/null 2>&1 || true
 rm -rf "$BACK"
}
trap cleanup EXIT
test -s "$SRC"
test -s "$HOSTSCRIPT"
docker inspect "$MCP" >/dev/null
echo "=== INSTALANDO OPERADOR NO HOST ==="
install -o root -g root -m 0750 "$HOSTSCRIPT" /usr/local/sbin/vendi-contabo-operator
# Validate the operator before touching MCP.
echo "=== VALIDACAO LOCAL ==="
if ! /usr/local/sbin/vendi-contabo-operator releaseStatus VENDI-02; then
 echo "HOST_OPERATOR_VALIDATION_FAILED"; exit 1
fi
echo "=== VALIDANDO E COMPILANDO MCP ==="
docker cp "$MCP":/app/dist/index.js "$BACK/index.js" >/dev/null
docker exec "$MCP" sh -lc "mkdir -p '$WORK'; cp -a /app/src '$WORK/'; cp /app/tsconfig.json /app/package.json '$WORK/'; ln -sfn /app/node_modules '$WORK/node_modules'"
docker cp "$SRC" "$MCP":$WORK/src/index.ts >/dev/null
docker exec "$MCP" /app/node_modules/.bin/tsc -p "$WORK/tsconfig.json"
docker exec "$MCP" test -s "$WORK/dist/index.js"
docker cp "$MCP":$WORK/dist/index.js "$BACK/index.new.js" >/dev/null
docker cp "$BACK/index.new.js" "$MCP":/app/dist/index.js >/dev/null
SWAPPED=1
docker restart "$MCP" >/dev/null
echo "=== AGUARDANDO MCP ==="
READY=0
for i in $(seq 1 30); do
 if docker exec "$MCP" node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||8788)+"/health",{signal:AbortSignal.timeout(1500)}).then(r=>{if(r.status!==200)process.exitCode=1}).catch(()=>process.exitCode=1)' >/dev/null 2>&1; then READY=1; break; fi
 sleep 2
done
if [[ "$READY" != 1 ]]; then echo "MCP_UNHEALTHY"; exit 1; fi
echo "=== TESTANDO OPERACAO PELO SSH MCP ==="
docker exec "$MCP" node -e '
import("node:child_process").then(({execFileSync})=>{
 const fs=require("node:fs");
 const host=fs.readFileSync("/app/.vendi-ssh/host","utf8").trim();
 const out=execFileSync("ssh",["-i","/app/.vendi-ssh/id_ed25519","-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","StrictHostKeyChecking=yes","-o","UserKnownHostsFile=/app/.vendi-ssh/known_hosts","-o","ConnectTimeout=8","vendorai@"+host,"sudo -n /usr/local/sbin/vendi-contabo-operator releaseStatus VENDI-02"],{timeout:15000,encoding:"utf8"});
 console.log(out.slice(0,1200));
}).catch(e=>{console.log(e.message);process.exitCode=1});
'
OK=1
echo "VENDI03_OPERADOR_MCP_HOST_ATIVO"
echo "VENDI03_LOTE_HABILITADO=VENDI-02"
echo "AÇÕES=build,homologate,rollback,releaseStatus"
echo "SEM_DEPLOY_DE_PRODUCAO"
