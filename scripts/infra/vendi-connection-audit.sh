#!/usr/bin/env bash
# VENDI-EXEC-01: read-only batch audit for the EXISTING Contabo VPS.
# It prints no credentials, changes no configuration, and never deploys.
set -u
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
passed=0; failed=0; warned=0
report() {
  printf '%s|%s|%s\n' "$1" "$2" "$3"
  case "$1" in
    PASS) ((passed+=1));;
    FAIL) ((failed+=1));;
    WARN) ((warned+=1));;
  esac
}
if command -v docker >/dev/null 2>&1; then report PASS docker_binary found; else report FAIL docker_binary missing; fi
for container in vendorai-mcp-contabo-fixed vendorai-homolog-api vendorai-prod-api-candidate; do
  if command -v docker >/dev/null 2>&1 && [[ "$(docker inspect "$container" --format '{{.State.Running}}' 2>/dev/null)" == "true" ]]; then
    report PASS "container_$container" running
  else
    report FAIL "container_$container" unavailable
  fi
done
for entry in "homolog:5000" "production:5001"; do
  name="${entry%%:*}"; port="${entry##*:}"
  if curl -fsS --max-time 8 "http://127.0.0.1:$port/api/auth/healthz" 2>/dev/null | grep -q '"status":"ok"'; then
    report PASS "${name}_health" ok
  else
    report FAIL "${name}_health" unavailable
  fi
done
if [[ -x /usr/local/sbin/vendi-contabo-operator ]]; then report PASS operator_file executable; else report FAIL operator_file missing_or_not_executable; fi
if [[ -x /usr/local/sbin/vendi-executor-v1 ]]; then report PASS executor_file executable; else report WARN executor_file not_installed; fi
for check in "mcp_ssh_key:/app/.vendi-ssh/id_ed25519" "mcp_known_hosts:/app/.vendi-ssh/known_hosts" "mcp_compiled:/app/dist/index.js"; do
  name="${check%%:*}"; path="${check#*:}"
  if command -v docker >/dev/null 2>&1 && docker exec vendorai-mcp-contabo-fixed test -s "$path" >/dev/null 2>&1; then
    report PASS "$name" present
  else
    report FAIL "$name" missing
  fi
done
if command -v docker >/dev/null 2>&1 && docker exec vendorai-mcp-contabo-fixed grep -q 'vendi_executor_probe' /app/dist/index.js >/dev/null 2>&1; then
  report PASS executor_registered_compiled found
else
  report WARN executor_registered_compiled not_installed
fi
if command -v docker >/dev/null 2>&1 && docker exec vendorai-mcp-contabo-fixed grep -q 'vendi_contabo_status' /app/dist/index.js >/dev/null 2>&1; then
  report PASS existing_contabo_tool present
else
  report FAIL existing_contabo_tool missing
fi
printf 'SUMMARY|PASS=%d|FAIL=%d|WARN=%d\n' "$passed" "$failed" "$warned"
if (( failed > 0 )); then exit 1; fi
exit 0
