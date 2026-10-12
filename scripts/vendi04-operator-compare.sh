#!/usr/bin/env bash
# Read-only audit: compare deployed Contabo release operator with versioned source.
set -Eeuo pipefail
installed=/usr/local/sbin/vendi04-controlled-release
candidate="${1:-}"
[[ -n "$candidate" && -f "$candidate" && -f "$installed" ]] || { echo "USAGE: vendi04-operator-compare.sh PATH_TO_CANDIDATE";exit 64; }
bash -n "$candidate"
sudo bash -n "$installed"
echo "CANDIDATE_SHA256=$(sha256sum "$candidate" | cut -d' ' -f1)"
echo "INSTALLED_SHA256=$(sudo sha256sum "$installed" | cut -d' ' -f1)"
echo "=== PROTECTION CHECK ==="
for marker in ROLLBACK_BLOCKED_PRODUCTION_VERSION_MISMATCH RELEASE_RECORD_EXISTS_REQUIRES_RECONCILIATION;do
 if sudo grep -Fq "$marker" "$installed";then echo "INSTALLED_$marker=YES";else echo "INSTALLED_$marker=NO";fi
done
echo "=== DIFF WITHOUT SECRETS ==="
# This script might contain host-specific configuration: do not print full diff automatically.
if sudo cmp -s "$candidate" "$installed";then echo "OPERATOR_MATCH=YES";else echo "OPERATOR_MATCH=NO_REVIEW_REQUIRED";fi
echo "NO_PRODUCTION_CHANGES"
