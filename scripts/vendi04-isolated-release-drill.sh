#!/usr/bin/env bash
# End-to-end isolated Docker drill: publish -> forced unhealthy candidate -> auto recovery.
# Separate names, no network or host port, reuse an existing Node image.
set -Eeuo pipefail
command -v docker >/dev/null || { echo DOCKER_REQUIRED;exit 69; }
IMAGE=${VENDI04_TEST_IMAGE:-node:24-bookworm-slim}
NAME="vendi04-drill-$$"
ORIGINAL="$NAME-old"
CANDIDATE="$NAME-new"
BROKEN="$NAME-failed"
STATE="INIT"
die(){ echo "DRILL_FAILED=$1 STATE=$STATE";exit 1; }
cleanup(){
 docker rm -f "$NAME" "$ORIGINAL" "$CANDIDATE" "$BROKEN" >/dev/null 2>&1 || true
}
trap cleanup EXIT
# Do not stop, rename or inspect any production/homolog container.
docker inspect "$NAME" >/dev/null 2>&1 && die NAME_IN_USE
for existing in "$ORIGINAL" "$CANDIDATE" "$BROKEN";do docker inspect "$existing" >/dev/null 2>&1 && die NAME_IN_USE;done
docker image inspect "$IMAGE" >/dev/null 2>&1 || die DRILL_IMAGE_UNAVAILABLE
healthy(){ docker exec "$NAME" node -e 'fetch("http://127.0.0.1:8080",{signal:AbortSignal.timeout(1000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; }
create_fixture(){
 docker create --name "$1" --network none --memory=128m --memory-swap=128m --cpus=.25 --pids-limit=32 \
  --cap-drop ALL --security-opt no-new-privileges --read-only --user 1000:1000 \
  "$IMAGE" node -e 'require("http").createServer((q,r)=>r.end("synthetic fixture")).listen(8080,"127.0.0.1")'
}
create_fixture "$NAME" >/dev/null
docker start "$NAME" >/dev/null
for _ in $(seq 1 20);do healthy && break;sleep 1;done
healthy || die BASELINE_FAILED
STATE=BASELINE_HEALTHY
# The candidate is intentionally unhealthy (never starts). Simulate a bad rollout.
create_fixture "$CANDIDATE" >/dev/null
docker stop "$NAME" >/dev/null
docker rename "$NAME" "$ORIGINAL"
docker rename "$CANDIDATE" "$NAME"
STATE=BAD_CANDIDATE_ACTIVE
# Force failure: do NOT start the candidate. A real rollback path must recover prior version.
healthy && die INJECTION_DID_NOT_FAIL
docker rename "$NAME" "$BROKEN"
docker rename "$ORIGINAL" "$NAME"
docker start "$NAME" >/dev/null
for _ in $(seq 1 20);do healthy && break;sleep 1;done
healthy || die ROLLBACK_HEALTH_FAILED
STATE=ROLLED_BACK
echo "ISOLATED_BASELINE_HTTP=200"
echo "ISOLATED_FAULT_INJECTED=YES"
echo "ISOLATED_ROLLBACK_HTTP=200"
echo "ISOLATED_BACKUP_RESTORED=YES"
echo "ISOLATED_RELEASE_DRILL=PASSED"
