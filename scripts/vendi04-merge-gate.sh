#!/usr/bin/env bash
# VENDI-04 merge gate: validates an exact PR head SHA before any GitHub merge.
# No merge is performed by this script. It emits an auditable decision.
set -Eeuo pipefail
[[ $# == 3 ]] || { echo "USAGE: $0 owner/repo pr_number expected_40_character_head_sha";exit 64; }
REPO=$1 PR=$2 EXPECTED=$3
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ && "$PR" =~ ^[0-9]+$ && "$EXPECTED" =~ ^[a-f0-9]{40}$ ]] || { echo INVALID_PARAMETERS;exit 64; }
command -v gh >/dev/null || { echo GH_CLI_REQUIRED;exit 69; }
json=$(gh api "repos/$REPO/pulls/$PR" --jq '[.state, .draft, .head.sha, .mergeable, .base.ref, .html_url] | @tsv')
IFS=$'\t' read -r STATE DRAFT SHA MERGEABLE BASE URL <<< "$json"
echo "PR=$URL"
echo "EXPECTED_SHA=$EXPECTED"
echo "ACTUAL_SHA=$SHA"
echo "BASE=$BASE"
[[ "$STATE" == open && "$DRAFT" == false && "$SHA" == "$EXPECTED" && "$MERGEABLE" == true && "$BASE" == main ]] || { echo MERGE_GATE_BLOCKED;exit 65; }
echo MERGE_GATE_ELIGIBLE_MANUAL_OR_OPERATOR_MERGE
