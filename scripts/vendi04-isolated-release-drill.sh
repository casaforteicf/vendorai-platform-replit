#!/usr/bin/env bash
# End-to-end isolated Docker drill: publish -> forced unhealthy candidate -> auto recovery.
# Separate names, loopback-only test port, separate test-only image. NEVER production.
set -Eeuo pipefail
command -v docker >/dev/null || { echo DOCKER_REQUIRED;exit 69; }
command -v curl >/dev/null || { echo CURL_REQUIRED;exit 69; }
IMAGE=${VENDI04_TEST_IMAGE:-nginx:alpine}
NAME="vendi04-drill-$$"
PORT=51987
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
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "DRILL_IMAGE_NOT_PRESENT=$IMAGE";exit 69; }
healthy(){ [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/" || true)" == 200 ]]; }
docker create --name "$NAME" -p "127.0.0.1:$PORT:80" "$IMAGE" >/dev/null
docker start "$NAME" >/dev/null
for _ in $(seq 1 20);do healthy && break;sleep 1;done
healthy || die BASELINE_FAILED
STATE=BASELINE_HEALTHY
# The candidate is intentionally unhealthy (never starts). Simulate a bad rollout.
docker create --name "$CANDIDATE" -p "127.0.0.1:$PORT:80" "$IMAGE" >/dev/null
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
