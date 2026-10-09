#!/usr/bin/env bash
set -Eeuo pipefail
C=vendorai-mcp-contabo-fixed
NET=vendorai-homolog
API=vendorai-homolog-api
SRC=/home/vendorai/vendorai-api-auth-test/artifacts/cloudflare-mcp/src/index.ts
WORK=/app/.vendi02-activation
TMP=$(mktemp -d /tmp/vendi02-mcp-XXXXXX)
chmod 700 "$TMP"
swapped=0; done_ok=0; network_added=0
cleanup() {
 if [[ "$swapped" == 1 && "$done_ok" != 1 ]]; then
   echo "ROLLBACK_MCP"
   docker cp "$TMP/index.js" "$C":/app/dist/index.js >/dev/null || true
   docker restart "$C" >/dev/null || true
 fi
 if [[ "$network_added" == 1 && "$done_ok" != 1 ]]; then
   docker network disconnect "$NET" "$C" >/dev/null 2>&1 || true
 fi
 docker exec "$C" rm -rf "$WORK" >/dev/null 2>&1 || true
 rm -rf "$TMP"
}
trap cleanup EXIT
echo "=== PRECHECK ==="
test -s "$SRC"
docker inspect "$C" "$API" >/dev/null
docker exec "$C" test -s /app/dist/index.js
docker cp "$C":/app/dist/index.js "$TMP/index.js" >/dev/null
if ! docker inspect "$C" -f '{{json .NetworkSettings.Networks}}' | grep -q '"vendorai-homolog"'; then
  docker network connect "$NET" "$C"
  network_added=1
fi
echo "=== TESTANDO REDE ISOLADA ==="
docker exec "$C" node -e '
const url="http://vendorai-homolog-api:5000/api/internal/browser-mcp/status";
fetch(url,{headers:{authorization:"Bearer "+process.env.BROWSER_MCP_ACCESS_TOKEN},signal:AbortSignal.timeout(7000)})
.then(r=>{console.log("API_HOMOLOG_HTTP="+r.status);if(r.status!==200)process.exitCode=1})
.catch(e=>{console.log("API_HOMOLOG_REDE_ERRO="+e.message);process.exitCode=1});
'
echo "=== COMPILANDO MCP EM COPIA ISOLADA ==="
docker exec "$C" sh -lc "mkdir -p '$WORK'; cp -a /app/src '$WORK/'; cp /app/tsconfig.json /app/package.json '$WORK/'; ln -sfn /app/node_modules '$WORK/node_modules'"
docker cp "$SRC" "$C":$WORK/src/index.ts >/dev/null
docker exec "$C" /app/node_modules/.bin/tsc -p "$WORK/tsconfig.json"
docker exec "$C" test -s "$WORK/dist/index.js"
echo "=== ATIVANDO MCP EXISTENTE ==="
cp "$TMP/index.js" "$TMP/index.rollback.js"
docker cp "$C":$WORK/dist/index.js "$TMP/index.new.js" >/dev/null
docker cp "$TMP/index.new.js" "$C":/app/dist/index.js >/dev/null
swapped=1
docker restart "$C" >/dev/null
echo "=== VALIDANDO MCP ==="
docker exec "$C" node -e '
const port=Number(process.env.PORT||8788);
fetch("http://127.0.0.1:"+port+"/health",{signal:AbortSignal.timeout(10000)})
.then(async r=>{console.log("MCP_HEALTH_HTTP="+r.status);if(r.status!==200)process.exitCode=1})
.catch(e=>{console.log("MCP_HEALTH_ERROR="+e.message);process.exitCode=1});
'
echo "=== VALIDANDO CRM HOMOLOG VIA MCP ==="
docker exec "$C" node -e '
const url="http://vendorai-homolog-api:5000/api/internal/browser-mcp/crm-summary";
fetch(url,{method:"POST",headers:{authorization:"Bearer "+process.env.BROWSER_MCP_ACCESS_TOKEN,"content-type":"application/json"},body:JSON.stringify({tenantKey:"krafht-homolog"}),signal:AbortSignal.timeout(12000)})
.then(async r=>{const d=await r.json().catch(()=>({}));console.log("CRM_HOMOLOG_HTTP="+r.status);console.log("CRM_LEADS_ATIVOS="+String(d.crm?.activeLeads));if(r.status!==200||!Number.isInteger(d.crm?.activeLeads))process.exitCode=1})
.catch(e=>{console.log("CRM_HOMOLOG_ERRO="+e.message);process.exitCode=1});
'
done_ok=1
echo "VENDI02_MCP_ATIVADO_E_API_HOMOLOG_200"
echo "OUTRAS_FERRAMENTAS_PRODUCAO_INALTERADAS"
