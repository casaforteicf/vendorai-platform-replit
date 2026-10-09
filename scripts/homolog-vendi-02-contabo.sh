#!/usr/bin/env bash
# VENDI-02: deploy isolated homolog using existing build container and MCP token.
# No new Docker image; no action on production.
set -Eeuo pipefail
OLD=vendorai-homolog-api
BACK=vendorai-homolog-pre-vendi02
BUILD=vendorai-vendi-build-3427
MCP=vendorai-mcp-contabo-fixed
STAGE=vendorai-homolog-vendi02-stage
ROOT=$(mktemp -d /tmp/vendi02.XXXXXXXX)
chmod 700 "$ROOT"
swapped=0
ok=0
cleanup() { rm -rf "$ROOT"; }
rollback() {
  if [[ "$swapped" == 1 && "$ok" != 1 ]]; then
    echo "ROLLBACK_VENDI02"
    docker rm -f "$OLD" >/dev/null 2>&1 || true
    if docker inspect "$BACK" >/dev/null 2>&1; then
      docker rename "$BACK" "$OLD"
      docker start "$OLD" >/dev/null
    fi
  fi
  docker rm -f "$STAGE" >/dev/null 2>&1 || true
  cleanup
}
trap rollback EXIT
echo "=== PRECHECK ==="
docker inspect "$OLD" "$BUILD" "$MCP" >/dev/null
if docker inspect "$BACK" >/dev/null 2>&1 || docker inspect "$STAGE" >/dev/null 2>&1; then
  echo "BLOQUEIO: nome de rollback ou stage ja ocupado. Nenhuma alteracao."; exit 1
fi
[[ "$(docker inspect "$OLD" -f '{{.HostConfig.NetworkMode}}')" == "vendorai-homolog" ]] || { echo "REDE_HOMOLOG_INESPERADA"; exit 1; }
[[ "$(docker inspect "$OLD" -f '{{.Config.Image}}')" != "" ]] || exit 1
[[ "$(docker inspect "$BUILD" -f '{{.State.Status}}')" == "exited" ]] || { echo "BUILD_DEVE_ESTAR_PARADO"; exit 1; }
BASE=$(docker inspect "$BUILD" -f '{{.Config.Image}}')
docker image inspect "$BASE" >/dev/null
docker cp "$BUILD":/app/artifacts/api-server/dist "$ROOT/dist" >/dev/null
test -s "$ROOT/dist/index.mjs"
# Temporary envfile only readable by root. Secrets never printed.
python3 - "$OLD" "$MCP" "$ROOT/env" <<'PY'
import json,subprocess,sys,os
def inspect(name):
  return json.loads(subprocess.check_output(["docker","inspect",name]))[0]
old,mcp=inspect(sys.argv[1]),inspect(sys.argv[2])
def envmap(container):
  out={}
  for entry in container["Config"]["Env"]:
    k,sep,v=entry.partition("=")
    if sep: out[k]=v
  return out
env=envmap(old)
token=envmap(mcp).get("BROWSER_MCP_ACCESS_TOKEN","").strip()
if not token or "\n" in token or "\r" in token:
  raise SystemExit("TOKEN_MCP_INDISPONIVEL")
env["BROWSER_MCP_ACCESS_TOKEN"]=token
if any("\n" in v or "\r" in v for v in env.values()):
  raise SystemExit("AMBIENTE_MULTILINHA_NAO_SUPORTADO")
with open(sys.argv[3],"w") as f:
  for k,v in env.items():f.write(k+"="+v+"\n")
os.chmod(sys.argv[3],0o600)
PY
echo "=== PREPARANDO CONTAINER SEM CRIAR IMAGEM ==="
docker create --name "$STAGE" --network vendorai-homolog --restart unless-stopped \
  --env-file "$ROOT/env" -p 127.0.0.1:5000:5000 \
  --entrypoint docker-entrypoint.sh "$BASE" \
  pnpm --filter @workspace/api-server run start >/dev/null
docker cp "$ROOT/dist/." "$STAGE":/app/artifacts/api-server/dist/ >/dev/null
echo "=== TROCANDO SOMENTE HOMOLOGACAO ==="
docker stop "$OLD" >/dev/null
docker rename "$OLD" "$BACK"
swapped=1
docker rename "$STAGE" "$OLD"
docker start "$OLD" >/dev/null
echo "=== ESPERANDO SAUDE ==="
health=0
for i in $(seq 1 45); do
  if curl -fsS --max-time 2 http://127.0.0.1:5000/api/auth/healthz >/dev/null 2>&1; then health=1; break; fi
  sleep 2
done
if [[ "$health" != 1 ]]; then
  echo "FALHA_HEALTH"; docker logs --tail 50 "$OLD" 2>&1; exit 1
fi
echo "=== CONSULTA REAL CRM / AUTENTICACAO ==="
# Run inside homolog; do not expose token.
if ! docker exec -i "$OLD" node - <<'JS'
const base="http://127.0.0.1:5000/api/internal/browser-mcp/crm-summary";
async function call(tenant,auth=true){
 const response=await fetch(base,{method:"POST",headers:{"content-type":"application/json",...(auth?{"authorization":"Bearer "+process.env.BROWSER_MCP_ACCESS_TOKEN}:{})},body:JSON.stringify({tenantKey:tenant}),signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({}));
 return {status:response.status,data};
}
const main=async()=>{
 const missing=await call("vendorai-e2e",false);
 console.log("SEM_TOKEN_HTTP="+missing.status);
 if(missing.status!==401) throw Error("AUTH_TEST_FAILED");
 const invalid=await call("vendi-02-tenant-inexistente-xxxxxxxx");
 console.log("TENANT_INEXISTENTE_HTTP="+invalid.status);
 if(invalid.status!==404) throw Error("TENANT_TEST_FAILED");
 const valid=await call("vendorai-e2e");
 console.log("TENANT_TESTE_HTTP="+valid.status);
 if(valid.status!==200 || !valid.data?.ok || !Number.isInteger(valid.data.crm?.activeLeads)) throw Error("CRM_TEST_FAILED:"+JSON.stringify(valid.data).slice(0,250));
 console.log("CRM_LEADS_ATIVOS="+valid.data.crm.activeLeads);
};
main().catch(err=>{console.error(String(err));process.exitCode=1});
JS
then
  echo "FALHA_TESTE_CRM"
  docker logs --tail 25 "$OLD" 2>&1
  exit 1
fi
ok=1
echo "VENDI_02_API_HOMOLOGADA_CONSULTA_REAL_200"
echo "BACKUP_PRESERVADO=$BACK"
docker ps --filter "name=^/$OLD$" --format 'STATUS={{.Status}} IMAGEM={{.Image}}'
