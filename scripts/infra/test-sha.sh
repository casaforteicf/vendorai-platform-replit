#!/usr/bin/env bash
set -Eeuo pipefail
# Usage: test-sha.sh PR BRANCH SHA api|frontend|full
if [ "$#" -ne 4 ] || ! [[ "$1" =~ ^[1-9][0-9]*$ && "$2" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/-]*$ && "$3" =~ ^[a-fA-F0-9]{40}$ && "$4" =~ ^(api|frontend|full)$ ]]; then
  echo "Usage: test-sha.sh PR BRANCH FULL_SHA api|frontend|full" >&2; exit 64
fi
PR="$1"; BRANCH="$2"; SHA="$3"; SUITE="$4"
case "$BRANCH" in *..*|/*|*/|*'//'*) echo "Invalid branch" >&2; exit 64;; esac
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
if ! git remote get-url origin | grep -Eq '^(git@github.com:|https://github.com/)casaforteicf/vendorai-platform-replit(\.git)?$'; then
  echo "Unexpected Git remote" >&2; exit 65
fi
IMAGE="vendorai-test-node24:local"
STORE="$(printenv VENDORAI_OFFLINE_STORE || true)"

[ -n "$STORE" ] && [ -d "$STORE" ] || { echo "VENDORAI_OFFLINE_STORE required" >&2; exit 69; }
# Accept either the pnpm store root or the existing v10 directory.
if [ "$(basename "$STORE")" = "v10" ]; then STORE="$(dirname "$STORE")"; fi
[ -d "$STORE/v10" ] || { echo "pnpm v10 store missing at $STORE" >&2; exit 69; }
STORE="$(cd "$STORE" && pwd -P)"
# Keep Git, cache snapshots and evidence owned by the invoking user.
# Elevate ONLY Docker CLI operations when the daemon socket requires it.
if docker info >/dev/null 2>&1; then
  DOCKER_CMD=(docker)
elif sudo -n docker info >/dev/null 2>&1; then
  DOCKER_CMD=(sudo -n docker)
else
  echo "Docker unavailable: grant narrowly scoped Docker access to the operator" >&2
  exit 69
fi
"${DOCKER_CMD[@]}" image inspect "$IMAGE" >/dev/null || { echo "Build $IMAGE first" >&2; exit 69; }
OUT="$(pwd)/.test-evidence"
mkdir -p "$OUT"
RUN="$(mktemp -d "$OUT/pr-$PR-XXXXXXXX")"
mkdir -p "$RUN/work" "$RUN/logs" "$RUN/store"
# A private writable store keeps pnpm metadata writes off the shared source cache.
# Copy-on-write reflink is attempted; fallback copies the store (check host disk budget).
if ! cp -a --reflink=auto "$STORE/." "$RUN/store/"; then
  echo "Could not snapshot offline store safely (check free space)" >&2; exit 69
fi
chmod -R u+rwX "$RUN/store"
printf 'pr=%s\nbranch=%s\nsha=%s\nsuite=%s\nstarted=%s\n' "$PR" "$BRANCH" "$SHA" "$SUITE" "$(date -u +%FT%TZ)" >"$RUN/manifest.txt"
git fetch --no-tags origin "refs/pull/$PR/head" >"$RUN/logs/fetch-pr.log" 2>&1
PR_SHA="$(git rev-parse FETCH_HEAD)"
git fetch --no-tags origin "refs/heads/$BRANCH" >"$RUN/logs/fetch-branch.log" 2>&1
BRANCH_SHA="$(git rev-parse FETCH_HEAD)"
if [ "$PR_SHA" != "$SHA" ] || [ "$BRANCH_SHA" != "$SHA" ]; then
  echo "PR/branch/SHA mismatch; refusing execution" >&2; exit 65
fi
git archive "$SHA" | tar -x -C "$RUN/work"
chmod -R a+rwX "$RUN/work"
run() {
  name="$1"; shift
  set +e
  "${DOCKER_CMD[@]}" run --rm --network none --cap-drop ALL --security-opt no-new-privileges --pids-limit 256 --memory 4g --cpus 2     --user "$(id -u):$(id -g)" --tmpfs /tmp:rw,nosuid,size=256m     --mount "type=bind,src=$RUN/work,dst=/workspace"     --mount "type=bind,src=$RUN/store,dst=/pnpm/store"     -w /workspace -e CI=true -e HOME=/tmp -e PNPM_STORE_DIR=/pnpm/store "$IMAGE"     sh -c "$*" >"$RUN/logs/$name.log" 2>&1
  code=$?
  set -e
  printf '%s exit=%s\n' "$name" "$code" | tee -a "$RUN/results.txt"
}
# Optional, one-time networked cache fill, scoped to this disposable snapshot only.
# No secrets, Docker socket, shared writable store, lifecycle scripts, or official DB.
# The actual test phase continues with --network none.
if [ "${VENDORAI_PREPARE_OFFLINE:-0}" = "1" ]; then
  set +e
  "${DOCKER_CMD[@]}" run --rm --network bridge --cap-drop ALL --security-opt no-new-privileges --pids-limit 256 --memory 4g --cpus 2 \
    --user "$(id -u):$(id -g)" --tmpfs /tmp:rw,nosuid,size=256m \
    --mount "type=bind,src=$RUN/work,dst=/workspace" \
    --mount "type=bind,src=$RUN/store,dst=/pnpm/store" \
    -w /workspace -e CI=true -e HOME=/tmp -e PNPM_STORE_DIR=/pnpm/store \
    "$IMAGE" sh -c 'pnpm fetch --frozen-lockfile --ignore-scripts --store-dir /pnpm/store' >"$RUN/logs/cache-fetch.log" 2>&1
  fetch_code=$?
  set -e
  printf 'cache-fetch exit=%s\n' "$fetch_code" | tee -a "$RUN/results.txt"
  if [ "$fetch_code" -ne 0 ]; then
    echo "Cache fill failed; no offline tests attempted" >&2
    exit "$fetch_code"
  fi
fi
run install "pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir /pnpm/store"
if ! grep -qx 'install exit=0' "$RUN/results.txt"; then echo "Install failed; downstream tests skipped"; exit 1; fi
if [ "$SUITE" = api ] || [ "$SUITE" = full ]; then
  run api-ts "pnpm --filter @workspace/api-server typecheck"
  run api-vitest "pnpm --filter @workspace/api-server test"
  run api-build "pnpm --filter @workspace/api-server build"
fi
if [ "$SUITE" = frontend ] || [ "$SUITE" = full ]; then
  run frontend-ts "pnpm --filter @workspace/frontend typecheck"
  run frontend-build "pnpm --filter @workspace/frontend build"
fi
printf 'finished=%s\n' "$(date -u +%FT%TZ)" >>"$RUN/manifest.txt"
echo "Evidence: $RUN"
if grep -qE 'exit=[1-9][0-9]*' "$RUN/results.txt"; then exit 1; fi
