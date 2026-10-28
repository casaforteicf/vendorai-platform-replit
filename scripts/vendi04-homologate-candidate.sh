#!/usr/bin/env bash
# Candidate-only homologation. Private network and DB, no production changes.
set -Eeuo pipefail
LOT="${1:-}"
[[ "$#" == 1 && "$LOT" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]] || { echo INVALID_LOT; exit 64; }
# Stage and builds serialize globally to protect the constrained VPS.
exec 7>/run/lock/vendi-release-global-build.lock
flock -n 7 || { echo BUILD_OR_STAGE_IN_PROGRESS; exit 75; }
ROOT=/var/lib/vendi-release
MANIFEST="$ROOT/manifests/$LOT.env"
BUILD="$ROOT/state/$LOT"
PROOF="$ROOT/state/$LOT.homolog"
[[ -f "$MANIFEST" && "$(stat -c %u "$MANIFEST")" == 0 ]] || { echo MANIFEST_NOT_ROOT_OWNED; exit 65; }
[[ ! -e "$PROOF" ]] || { echo HOMOLOG_EVIDENCE_ALREADY_EXISTS; exit 65; }
SHA=$(sed -n 's/^SHA=//p' "$MANIFEST" | head -1)
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo INVALID_SHA; exit 65; }
IMAGE="vendorai-release:${LOT,,}-${SHA:0:12}"
[[ -f "$BUILD" ]] || { echo BUILD_STATE_MISSING; exit 65; }
grep -Fxq "SHA=$SHA" "$BUILD" &&
grep -Fxq "IMAGE=$IMAGE" "$BUILD" &&
grep -Fxq 'STATUS=BUILT_NOT_DEPLOYED' "$BUILD" || { echo BUILD_NOT_READY; exit 65; }
IMAGE_ID=$(docker image inspect "$IMAGE" --format '{{.Id}}')
[[ "$IMAGE_ID" == sha256:* ]] || { echo INVALID_IMAGE_ID; exit 65; }
docker inspect vendorai-homolog-api vendorai-prod-api-candidate vendorai-mcp-novo >/dev/null
[[ "$(docker inspect vendorai-homolog-api -f '{{.State.Running}}')" == true ]] || exit 69
[[ "$(docker inspect vendorai-prod-api-candidate -f '{{.State.Running}}')" == true ]] || exit 69
[[ "$(docker inspect vendorai-homolog-api -f '{{.HostConfig.NetworkMode}}')" == vendorai-homolog ]] || { echo HOMOLOG_NETWORK_MISMATCH; exit 65; }
[[ "$(docker inspect vendorai-homolog-api -f '{{len .Mounts}}')" == 0 ]] || { echo HOMOLOG_MOUNTS_UNSUPPORTED; exit 65; }
# Even with container memory limits, never start tests under host pressure.
MEM_KB=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
SWAP_TOTAL_KB=$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)
SWAP_FREE_KB=$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)
FREE_KB=$(df -Pk / | awk 'NR==2 {print $4}')
[[ "$MEM_KB" =~ ^[0-9]+$ && "$SWAP_TOTAL_KB" =~ ^[0-9]+$ &&
   "$SWAP_FREE_KB" =~ ^[0-9]+$ && "$FREE_KB" =~ ^[0-9]+$ ]] || {
  echo RESOURCE_METRICS_UNAVAILABLE; exit 75;
}
if (( MEM_KB < 2097152 || FREE_KB < 3145728 ||
      (SWAP_TOTAL_KB > 0 && (SWAP_TOTAL_KB - SWAP_FREE_KB) * 100 / SWAP_TOTAL_KB > 75) )); then
  echo HOMOLOG_BLOCKED_RESOURCE_PRESSURE
  exit 75
fi
TMPDIR=$(mktemp -d /root/vendi-homolog.XXXXXXXX)
chmod 700 "$TMPDIR"
STAGE="vendi-homolog-${LOT,,}-${SHA:0:12}"
[[ -z "$(docker ps -aq --filter "name=^/$STAGE$")" ]] || { rmdir "$TMPDIR"; echo STAGE_ALREADY_EXISTS; exit 75; }
PASSED=0
cleanup(){
  local rc="$?"
  if [[ "$PASSED" != 1 ]]; then
    umask 077
    printf 'LOT=%s\nSHA=%s\nSTATUS=HOMOLOG_FAILED\nEXIT_CODE=%s\n' \
      "$LOT" "$SHA" "$rc" > "$ROOT/state/$LOT.homolog-failed" || true
  fi
  docker rm -f "$STAGE" >/dev/null 2>&1 || true
  rm -rf "$TMPDIR"
}
trap cleanup EXIT
python3 - "$TMPDIR/env" <<'PY'
import json, os, subprocess, sys
from urllib.parse import urlsplit
def envmap(name):
    obj=json.loads(subprocess.check_output(["docker","inspect",name],text=True))[0]
    return dict(entry.split("=",1) for entry in obj["Config"]["Env"] if "=" in entry)
homolog=envmap("vendorai-homolog-api")
prod=envmap("vendorai-prod-api-candidate")
mcp=envmap("vendorai-mcp-novo")
def identity(url):
    v=urlsplit(url)
    return ((v.hostname or "").lower(),v.port or 5432,v.path.rstrip("/").lower())
def runtime_url(env):
    # Same precedence as lib/db/src/index.ts; never test a fallback while the
    # application actually connects using a higher-priority production URL.
    return env.get('APP_DATABASE_URL') or env.get('SUPABASE_DATABASE_URL') or env.get('DATABASE_URL')
homolog_url=runtime_url(homolog)
prod_url=runtime_url(prod)
if not homolog_url or not prod_url:
    raise SystemExit("DATABASE_IDENTITY_UNVERIFIED")
if identity(homolog_url)==identity(prod_url):
    raise SystemExit("HOMOLOG_USES_PRODUCTION_DATABASE")
# This host uses the existing local homolog DB. Fail closed on external aliases
# (including alternate Supabase pooler/direct hosts) until independently reviewed.
db=json.loads(subprocess.check_output(['docker','inspect','vendorai-homolog-db'],text=True))[0]
network=db.get('NetworkSettings',{}).get('Networks',{}).get('vendorai-homolog',{})
aliases=set(network.get('Aliases') or []) | {'vendorai-homolog-db'}
target=urlsplit(homolog_url)
if not db['State']['Running'] or not network or target.hostname not in aliases or (target.port or 5432)!=5432:
    raise SystemExit('HOMOLOG_DATABASE_NOT_LOCAL_ISOLATED')
if any(identity(value)==identity(homolog_url) for key,value in prod.items() if key in ('APP_DATABASE_URL','SUPABASE_DATABASE_URL','DATABASE_URL') and value):
    raise SystemExit('HOMOLOG_USES_PRODUCTION_DATABASE')
# Prevent alternate URL selection and prohibit writes at the PostgreSQL session.
from urllib.parse import parse_qsl, urlencode, urlunsplit
query=dict(parse_qsl(target.query,keep_blank_values=True))
query['options']='-c default_transaction_read_only=on'
homolog_url=urlunsplit(target._replace(query=urlencode(query)))
for key in ('APP_DATABASE_URL','SUPABASE_DATABASE_URL','DATABASE_URL'):
    homolog[key]=homolog_url
if not mcp.get("BROWSER_MCP_ACCESS_TOKEN"):
    raise SystemExit("HOMOLOG_MCP_TOKEN_MISSING")
homolog["BROWSER_MCP_ACCESS_TOKEN"]=mcp["BROWSER_MCP_ACCESS_TOKEN"]
homolog.update(VENDORAI_DISABLE_BACKGROUND_JOBS="true",
              VENDORAI_HOMOLOGATION_SEED="true",NODE_ENV="production",PORT="5000")
if any("\n" in k or "\r" in k or "\n" in v or "\r" in v for k,v in homolog.items()):
    raise SystemExit("MULTILINE_ENV_UNSUPPORTED")
with open(sys.argv[1],"w") as out:
    for k,v in homolog.items(): out.write(k+"="+v+"\n")
os.chmod(sys.argv[1],0o600)
print("HOMOLOG_DATABASE_ISOLATED=YES")
print("HOMOLOG_BACKGROUND_JOBS_DISABLED=YES")
print("HOMOLOG_STARTUP_MIGRATIONS_DISABLED=YES")
PY
# Docker --rm also removes a stopped candidate if the orchestrator dies.
# This avoids accumulating failed/stopped test containers across releases.
docker run --rm --detach --name "$STAGE" --network vendorai-homolog \
 --memory=3g --memory-swap=4g --cpus=1 \
 --env-file "$TMPDIR/env" "$IMAGE" >/dev/null
HEALTHY=0
for i in $(seq 1 45); do
  if docker exec "$STAGE" node -e 'fetch("http://127.0.0.1:5000/api/auth/healthz",{signal:AbortSignal.timeout(1500)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
    HEALTHY=1; break
  fi
  sleep 2
done
[[ "$HEALTHY" == 1 ]] || { echo HOMOLOG_CANDIDATE_HEALTH_FAILED; exit 69; }
docker exec -i "$STAGE" node - <<'JS'
const u="http://127.0.0.1:5000/api/internal/browser-mcp/crm-summary";
async function call(tenant,token){
 const r=await fetch(u,{method:"POST",headers:{"content-type":"application/json",...(token?{authorization:"Bearer "+process.env.BROWSER_MCP_ACCESS_TOKEN}:{})},body:JSON.stringify({tenantKey:tenant}),signal:AbortSignal.timeout(10000)});
 return {status:r.status,body:await r.json().catch(()=>({}))};
}
(async()=>{
 const bad=await call("krafht-homolog",false);
 const unknown=await call("vendi-no-tenant-000000",true);
 const good=await call("krafht-homolog",true);
 console.log("UNAUTH_HTTP="+bad.status,"UNKNOWN_HTTP="+unknown.status,"HOMOLOG_CRM_HTTP="+good.status);
 if(bad.status!==401||unknown.status!==404||good.status!==200||!Number.isInteger(good.body?.crm?.activeLeads))process.exitCode=1;
})().catch(()=>{console.error("HOMOLOG_SMOKE_FAILED");process.exitCode=1});
JS
test "$(docker image inspect "$IMAGE" --format '{{.Id}}')" = "$IMAGE_ID"
umask 077
tmp=$(mktemp "$ROOT/state/.homolog-$LOT.XXXXXXXX")
printf 'LOT=%s\nSHA=%s\nIMAGE=%s\nIMAGE_ID=%s\nSTATUS=HOMOLOGATED\nAT_EPOCH=%s\nMODE=ISOLATED_READONLY\n' \
 "$LOT" "$SHA" "$IMAGE" "$IMAGE_ID" "$(date +%s)" > "$tmp"
chmod 600 "$tmp"
ln "$tmp" "$PROOF" || { rm -f "$tmp"; echo HOMOLOG_EVIDENCE_COLLISION; exit 65; }
rm -f "$tmp" "$ROOT/state/$LOT.homolog-failed"
PASSED=1
echo "HOMOLOG_CANDIDATE_VERIFIED=$LOT"
echo "HOMOLOG_RECEIPT=$PROOF"
echo "PRODUCTION=untouched"
