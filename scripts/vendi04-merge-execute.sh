#!/usr/bin/env bash
# Merge VENDI-04 via GitHub REST only, with immutable SHA and independently verified evidence.
set -Eeuo pipefail
[[ "$#" == 3 ]] || { echo "USAGE: $0 PR SHA EVIDENCE_FILE"; exit 64; }
PR="$1"; HEAD="$2"; EVIDENCE="$3"; REPO=casaforteicf/vendorai-platform-replit
[[ "$PR" =~ ^[1-9][0-9]*$ && "$HEAD" =~ ^[a-f0-9]{40}$ ]] || exit 64
[[ -f "$EVIDENCE" ]] || { echo EVIDENCE_MISSING; exit 65; }
command -v gh >/dev/null && command -v jq >/dev/null || exit 69
for gate in BUILD_OK HOMOLOG_OK FUNCTIONAL_OK SECURITY_OK ROLLBACK_TEST_OK; do
  [[ "$(grep -c "^$gate=true$" "$EVIDENCE" || true)" == 1 ]] || { echo "UNAPPROVED_$gate";exit 65; }
done
grep -Fxq "HEAD_SHA=$HEAD" "$EVIDENCE" || { echo EVIDENCE_SHA_MISMATCH;exit 65; }
p=$(gh api "repos/$REPO/pulls/$PR")
jq -e --arg sha "$HEAD" '.state=="open" and .draft==false and .base.ref=="main" and .mergeable==true and .head.sha==$sha' <<<"$p" >/dev/null || { echo PR_GATE_BLOCKED;exit 65; }
# Never silently accept missing or pending checks.
checks=$(gh api "repos/$REPO/commits/$HEAD/check-runs?per_page=100")
jq -e '(.check_runs|length)>0 and all(.check_runs[]; .status=="completed" and (.conclusion=="success" or .conclusion=="skipped"))' <<<"$checks" >/dev/null || { echo CHECKS_NOT_GREEN;exit 65; }
# Check all explicitly reported legacy statuses; do not require a status if repository doesn't publish any.
st=$(gh api "repos/$REPO/commits/$HEAD/status")
jq -e '([.statuses[] | select(.state!="success")] | length)==0' <<<"$st" >/dev/null || { echo COMMIT_STATUS_NOT_GREEN;exit 65; }
reviews=$(gh api "repos/$REPO/pulls/$PR/reviews?per_page=100")
jq -e '[.[] | select(.state=="APPROVED")] | length > 0' <<<"$reviews" >/dev/null || { echo APPROVAL_MISSING;exit 65; }
result=$(gh api --method PUT "repos/$REPO/pulls/$PR/merge" -f merge_method=squash -f sha="$HEAD" -f commit_title="VENDI-04 validated PR #$PR")
jq -e '.merged==true and (.sha|type=="string")' <<<"$result" >/dev/null
printf 'MERGED_PR=%s\nMERGED_HEAD=%s\nMERGE_SHA=%s\n' "$PR" "$HEAD" "$(jq -r '.sha' <<<"$result")"
