#!/usr/bin/env bash
# One-shot bootstrap: existing MCP -> Contabo over dedicated SSH.
# Keep current API and MCP configuration. A failure restores the MCP bundle.
set -Eeuo pipefail
MCP=vendorai-mcp-contabo-fixed
SRC=/home/vendorai/vendorai-api-auth-test/artifacts/cloudflare-mcp/src/index.ts
CFG=/app/.vendi-ssh
WORK=/app/.vendi03-build
BACK=$(mktemp -d /tmp/vendi03-XXXXXX)
chmod 700 "$BACK"
SWAPPED=0
OK=0
cleanup() {
  if [[ "$SWAPPED" == 1 && "$OK" != 1 ]]; then
    echo "RESTAURANDO_EXECUTAVEL_MCP"
    docker cp "$BACK/index.js" "$MCP":/app/dist/index.js >/dev/null 2>&1 || true
    docker restart "$MCP" >/dev/null 2>&1 || true
  fi
  docker exec "$MCP" rm -rf "$WORK" >/dev/null 2>&1 || true
  rm -rf "$BACK"
}
trap cleanup EXIT
test -s "$SRC"
docker inspect "$MCP" >/dev/null
echo "=== IDENTIDADE EXCLUSIVA DO VENDI ==="
install -d -m 700 /root/.vendi-mcp-ssh
if [[ ! -s /root/.vendi-mcp-ssh/id_ed25519 ]]; then
  ssh-keygen -q -t ed25519 -N "" -C "vendi-mcp-contabo" -f /root/.vendi-mcp-ssh/id_ed25519
fi
# Host key is copied locally from sshd, not accepted from an untrusted network scan.
test -s /etc/ssh/ssh_host_ed25519_key.pub
echo "=== PREPARANDO SSH DENTRO DO MCP ==="
docker exec "$MCP" sh -lc 'command -v ssh >/dev/null || (command -v apt-get >/dev/null && apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends openssh-client >/dev/null)'
docker exec "$MCP" sh -lc "install -d -m 700 '$CFG'"
docker cp /root/.vendi-mcp-ssh/id_ed25519 "$MCP":$CFG/id_ed25519 >/dev/null
docker exec "$MCP" chmod 600 "$CFG/id_ed25519"
# Discover the actual gateway of the MCP container without depending on extra OS utilities.
GW=$(docker exec "$MCP" node -e 'const fs=require("fs");const lines=fs.readFileSync("/proc/net/route","utf8").trim().split("\n").slice(1);const row=lines.map(x=>x.trim().split(/\s+/)).find(x=>x[1]==="00000000");if(!row)process.exit(1);const h=row[2];console.log([6,4,2,0].map(i=>parseInt(h.slice(i,i+2),16)).join("."))')
[[ "$GW" =~ ^[0-9.]+$ ]] || exit 1
printf '%s\n' "$GW" > "$BACK/host"
printf '%s ' "$GW" > "$BACK/known_hosts"
cat /etc/ssh/ssh_host_ed25519_key.pub >> "$BACK/known_hosts"
docker cp "$BACK/host" "$MCP":$CFG/host >/dev/null
docker cp "$BACK/known_hosts" "$MCP":$CFG/known_hosts >/dev/null
docker exec "$MCP" chmod 600 "$CFG/host" "$CFG/known_hosts"
echo "=== AUTORIZANDO CHAVE APENAS PARA O USUARIO EXISTENTE ==="
USER_HOME=/home/vendorai
install -d -m 700 -o vendorai -g vendorai "$USER_HOME/.ssh"
PUB=$(cat /root/.vendi-mcp-ssh/id_ed25519.pub)
AUTH="$USER_HOME/.ssh/authorized_keys"
touch "$AUTH"
chown vendorai:vendorai "$AUTH"
chmod 600 "$AUTH"
if ! grep -Fqx "$PUB" "$AUTH"; then printf '%s\n' "$PUB" >> "$AUTH"; fi
echo "=== TESTE REAL SSH MCP->CONTABO ==="
docker exec "$MCP" ssh -i "$CFG/id_ed25519" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$CFG/known_hosts" -o ConnectTimeout=8 vendorai@"$GW" 'printf "VENDI_CONTABO_SSH_OK\n"; sudo -n docker ps --format "{{.Names}}" | head -5'
echo "=== VALIDANDO E COMPILANDO MCP ATUAL ==="
docker cp "$MCP":/app/dist/index.js "$BACK/index.js" >/dev/null
docker exec "$MCP" sh -lc "mkdir -p '$WORK'; cp -a /app/src '$WORK/'; cp /app/tsconfig.json /app/package.json '$WORK/'; ln -sfn /app/node_modules '$WORK/node_modules'"
docker cp "$SRC" "$MCP":$WORK/src/index.ts >/dev/null
docker exec "$MCP" /app/node_modules/.bin/tsc -p "$WORK/tsconfig.json"
docker exec "$MCP" test -s "$WORK/dist/index.js"
echo "=== ATUALIZANDO SOMENTE MCP EXISTENTE ==="
docker cp "$MCP":$WORK/dist/index.js "$BACK/index.new.js" >/dev/null
docker cp "$BACK/index.new.js" "$MCP":/app/dist/index.js >/dev/null
SWAPPED=1
docker restart "$MCP" >/dev/null
ready=0
for i in $(seq 1 30); do
  if docker exec "$MCP" node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||8788)+"/health",{signal:AbortSignal.timeout(1800)}).then(r=>{if(r.status!==200)process.exitCode=1}).catch(()=>process.exitCode=1)' >/dev/null 2>&1; then
    ready=1;break
  fi
  sleep 2
done
if [[ "$ready" != 1 ]]; then echo "MCP_NAO_RESPONDEU";exit 1; fi
OK=1
echo "VENDI03_CONTABO_SSH_E_MCP_ATIVOS"
echo "AÇÕES_DISPONIVEIS=STATUS,HOMOLOG_HEALTH,PROD_HEALTH,STORAGE"
echo "SEM_NOVO_CONTAINER_E_SEM_PUBLICACAO_DA_API"
