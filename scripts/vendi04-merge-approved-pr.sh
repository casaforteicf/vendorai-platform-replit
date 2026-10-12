#!/usr/bin/env bash
# VENDI-04 traceable merge of an approved PR, pinning exact SHA.
# Explicit release approval is represented by a ROOT-OWNED file, never CLI free text.
set -Eeuo pipefail
[[ $# == 3 ]] || { echo "USAGE: $0 owner/repo pr_number sha40";exit 64; }
REPO=$1 PR=$2 SHA=$3
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ && "$PR" =~ ^[1-9][0-9]*$ && "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo INVALID_INPUT;exit 64; }
command -v gh >/dev/null || { echo GH_CLI_REQUIRED;exit 69; }
ROOT=/var/lib/vendi-release
APPROVAL="$ROOT/approvals/pr-$PR-$SHA.approved"
[[ -f "$APPROVAL" && "$(stat -c %u "$APPROVAL")" == 0 && "$(stat -c %a "$APPROVAL")" == 600 ]] || { echo ROOT_OWNED_APPROVAL_REQUIRED;exit 65; }
[[ "$(cat "$APPROVAL")" == "APPROVED_PR=$PR SHA=$SHA REPO=$REPO" ]] || { echo INVALID_APPROVAL_CONTENT;exit 65; }
LOCK=/run/lock/vendi-github-merge.lock
exec 9>"$LOCK";flock -n 9 || { echo MERGE_BUSY;exit 75; }
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
"$SCRIPT_DIR/vendi04-merge-gate.sh" "$REPO" "$PR" "$SHA"
# GitHub Actions and external CI are intentionally not merge gates.
# Homologation evidence and authorization are supplied by the Vendi release coordinator.
# The API rejects if SHA has changed. Squash merge has a different resulting SHA.
result=$(gh api --method PUT "repos/$REPO/pulls/$PR/merge" -f sha="$SHA" -f merge_method=squash)
merged=$(printf '%s' "$result" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("merged",False))')
merge_sha=$(printf '%s' "$result" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("sha",""))')
[[ "$merged" == True && "$merge_sha" =~ ^[a-f0-9]{40}$ ]] || { echo MERGE_NOT_CONFIRMED;exit 65; }
install -d -m 700 "$ROOT/merges"
printf 'REPO=%s\nPR=%s\nHEAD_SHA=%s\nMERGE_SHA=%s\nMERGED_UTC=%s\n' "$REPO" "$PR" "$SHA" "$merge_sha" "$(date -u +%FT%TZ)" | tee "$ROOT/merges/pr-$PR-$SHA.env"
echo "MERGE_RECORDED=$merge_sha"
