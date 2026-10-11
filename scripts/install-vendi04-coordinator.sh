#!/usr/bin/env bash
# VENDI-04 controlled integration: stage tested source, preserve live operator.
# No deploy, no container restart, no GitHub merge.
set -Eeuo pipefail
SOURCE=${1:-/home/vendorai/vendorai-api-auth-test}
[[ -d "$SOURCE/.git" ]] || { echo SOURCE_REPOSITORY_NOT_FOUND;exit 65; }
REF=${VENDI04_REF:-FETCH_HEAD}
LIVE=/usr/local/sbin/vendi04-controlled-release
DEST=/usr/local/lib/vendi04
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$DEST" "$DEST/backup-$STAMP"
[[ -f "$LIVE" ]] || { echo LIVE_OPERATOR_MISSING;exit 65; }
cp -a "$LIVE" "$DEST/backup-$STAMP/controlled-release.live"
git_show(){ git -C "$SOURCE" -c safe.directory="$SOURCE" show "$REF:scripts/$1"; }
for file in vendi04-controlled-release.sh vendi04-merge-gate.sh vendi04-merge-approved-pr.sh vendi04-release-reconcile.sh vendi04-operator-compare.sh;do
 git_show "$file" > "$DEST/$file.tmp"
 bash -n "$DEST/$file.tmp"
 chmod 700 "$DEST/$file.tmp"
 mv "$DEST/$file.tmp" "$DEST/$file"
done
bash -n "$LIVE"
echo "LIVE_SHA256=$(sha256sum "$LIVE" | cut -d' ' -f1)"
echo "GITHUB_SHA256=$(sha256sum "$DEST/vendi04-controlled-release.sh" | cut -d' ' -f1)"
if cmp -s "$LIVE" "$DEST/vendi04-controlled-release.sh";then
 echo "OPERATOR_MATCH=YES"
else
 echo "OPERATOR_MATCH=NO_RECONCILIATION_REQUIRED"
fi
echo "MERGE_GATE_INSTALLED=STAGED_ONLY"
echo "BACKUP=$DEST/backup-$STAMP/controlled-release.live"
echo "ACTIVE_OPERATOR_UNCHANGED=YES"
echo "PRODUCTION_UNTOUCHED=YES"
