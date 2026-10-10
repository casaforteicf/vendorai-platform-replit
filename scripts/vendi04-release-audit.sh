#!/usr/bin/env bash
# VENDI-04 non-mutating live topology and rollback audit.
set -Eeuo pipefail
OUT=/dev/stdout
printf 'VENDI04_AUDIT_AT=%s\n' "$(date -u +%FT%TZ)"
for c in vendorai-homolog-api vendorai-prod-api-candidate vendorai-mcp-contabo-fixed; do
  if ! docker inspect "$c" >/dev/null 2>&1; then
    echo "MISSING_CONTAINER=$c"; continue
  fi
  # Never print environment variables, tokens or full mount source paths.
  docker inspect "$c" --format 'CONTAINER={{.Name}} STATUS={{.State.Status}} IMAGE={{.Config.Image}} NETWORK={{.HostConfig.NetworkMode}} MOUNT_COUNT={{len .Mounts}} RESTART={{.HostConfig.RestartPolicy.Name}}'
  docker inspect "$c" --format '{{range .HostConfig.PortBindings}}{{range .}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}' | sed "s/^/PUBLISHED_PORTS_$c=/"
done
for port in 5000 5001; do
  status=$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' "http://127.0.0.1:$port/api/auth/healthz" || true)
  echo "HEALTH_$port=$status"
done
df -Pk / | awk 'NR==2{print "DISK_FREE_KB="$4}'
for tool in vendi04-release-preflight vendi04-release-runner vendi04-controlled-release; do
  if [[ -x "/usr/local/sbin/$tool" ]];then echo "INSTALLED_$tool=yes";else echo "INSTALLED_$tool=no";fi
done
for dir in /var/lib/vendi-release/manifests /var/lib/vendi-release/state;do
  [[ -d "$dir" ]] && echo "PRESENT_DIR=$dir" || echo "MISSING_DIR=$dir"
done
# No permissions, secrets or filename enumeration beyond expected known-safe state.
if docker inspect vendorai-homolog-pre-vendi02 >/dev/null 2>&1;then echo VENDI02_ROLLBACK_BACKUP=present;else echo VENDI02_ROLLBACK_BACKUP=missing;fi
echo VENDI04_AUDIT_COMPLETE_NO_CHANGES
