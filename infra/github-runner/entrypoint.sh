#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_PERSONAL_ACCESS_TOKEN:?GITHUB_PERSONAL_ACCESS_TOKEN is required}"

RUNNER_LABELS="${RUNNER_LABELS:-vendorai-release}"
RUNNER_GROUP="${RUNNER_GROUP:-Default}"
RUNNER_NAME="${RUNNER_NAME:-vendorai-release-${RAILWAY_REPLICA_ID:-${HOSTNAME:-runner}}}"
WORK_DIR="${RUNNER_WORK_DIR:-_work}"

api="https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runners"
auth=(-H "Authorization: Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")

registration_token() {
  curl -fsSL -X POST "${auth[@]}" "${api}/registration-token" | jq -r '.token // empty'
}

remove_token() {
  curl -fsSL -X POST "${auth[@]}" "${api}/remove-token" | jq -r '.token // empty'
}

cleanup() {
  set +e
  token="$(remove_token)"
  if [ -n "${token:-}" ]; then
    ./config.sh remove --unattended --token "$token" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

token="$(registration_token)"
if [ -z "$token" ]; then
  echo "Could not obtain GitHub runner registration token."
  exit 1
fi

./config.sh \
  --unattended \
  --replace \
  --url "https://github.com/${GITHUB_REPOSITORY}" \
  --token "$token" \
  --name "$RUNNER_NAME" \
  --labels "$RUNNER_LABELS" \
  --runnergroup "$RUNNER_GROUP" \
  --work "$WORK_DIR"

echo "VendorAI release runner registered as $RUNNER_NAME with labels $RUNNER_LABELS"
exec ./run.sh
