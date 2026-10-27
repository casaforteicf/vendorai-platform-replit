#!/usr/bin/env bash
# Fixed allowlist, approved-SHA, backup/restore upgrade of the host-side Vendi operator.
# First installation of this updater + MCP action requires an administrative bootstrap.
set -Eeuo pipefail
LOT="${1:-}"
[[ "$#" == 1 && "$LOT" =~ ^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$ ]] || { echo INVALID_LOT; exit 64; }
ROOT=/var/lib/vendi-release
REPO=/home/vendorai/vendorai-api-auth-test
MANIFEST="$ROOT/manifests/$LOT.env"
APPROVAL="$ROOT/state/$LOT.operator-upgrade-approved"
[[ -f "$MANIFEST" && "$(stat -c %u "$MANIFEST")" == 0 ]] || { echo ROOT_MANIFEST_REQUIRED; exit 65; }
[[ -f "$APPROVAL" && "$(stat -c %u "$APPROVAL")" == 0 &&
   "$(stat -c %a "$APPROVAL")" == 600 ]] || { echo EXPLICIT_OPERATOR_UPGRADE_APPROVAL_REQUIRED; exit 65; }
SHA=$(sed -n 's/^SHA=//p' "$MANIFEST" | head -1)
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo INVALID_SHA; exit 65; }
grep -Fxq "LOT=$LOT" "$APPROVAL" &&
grep -Fxq "SHA=$SHA" "$APPROVAL" &&
grep -Fxq 'STATUS=APPROVED' "$APPROVAL" || { echo UPGRADE_APPROVAL_MISMATCH; exit 65; }
GIT=(git -c "safe.directory=$REPO" -C "$REPO")
"${GIT[@]}" cat-file -e "$SHA^{commit}" || { echo COMMIT_MISSING; exit 65; }
exec 7>/run/lock/vendi-release-global-build.lock
flock -n 7 || { echo BUILD_IN_PROGRESS; exit 75; }
exec 8>/run/lock/vendi-production-release.lock
flock -n 8 || { echo PRODUCTION_RELEASE_IN_PROGRESS; exit 75; }
FILES=(
  vendi-contabo-operator
  vendi04-release-runner
  vendi04-release-preflight
  vendi04-controlled-release
  vendi04-homologate-candidate
  vendi04-controlled-upgrade
  vendi04-audit-readiness
)
# Paths to archive are constant and NOT taken from model text or repository data.
SOURCES=(
  scripts/vendi-contabo-operator
  scripts/vendi04-release-runner.sh
  scripts/vendi04-release-preflight.sh
  scripts/vendi04-controlled-release.sh
  scripts/vendi04-homologate-candidate.sh
  scripts/vendi04-controlled-upgrade.sh
  scripts/vendi04-audit-readiness.sh
)
WORK=$(mktemp -d /root/vendi-operator-upgrade.XXXXXXXX)
chmod 700 "$WORK"
BACK="$ROOT/upgrades/$LOT-$SHA"
[[ ! -e "$BACK" ]] || { echo UPGRADE_ALREADY_ATTEMPTED; rm -rf "$WORK"; exit 75; }
install -d -o root -g root -m 700 "$ROOT/upgrades"
cleanup(){ rm -rf "$WORK"; }
trap cleanup EXIT
"${GIT[@]}" archive "$SHA" -- "${SOURCES[@]}" | tar -xf - -C "$WORK"
for i in "${!FILES[@]}"; do
  src="$WORK/${SOURCES[i]}"
  dst="/usr/local/sbin/${FILES[i]}"
  [[ -f "$src" && ! -L "$src" ]] || { echo UPGRADE_SOURCE_MISSING; exit 65; }
  bash -n "$src" || { echo UPGRADE_SYNTAX_INVALID; exit 65; }
  if [[ -e "$dst" ]]; then
    [[ -f "$dst" && ! -L "$dst" && "$(stat -c %u "$dst")" == 0 ]] || { echo UNSAFE_INSTALLED_OPERATOR; exit 65; }
  fi
done
# Copy old state BEFORE modifications; preserve modes and binaries for reversal.
mkdir -m 700 "$BACK"
for i in "${!FILES[@]}"; do
  dst="/usr/local/sbin/${FILES[i]}"
  if [[ -e "$dst" ]]; then
    cp -p "$dst" "$BACK/${FILES[i]}"
  else
    touch "$BACK/${FILES[i]}.absent"
  fi
done
printf 'LOT=%s\nSHA=%s\nSTATE=INSTALLING\n' "$LOT" "$SHA" > "$BACK/receipt"
chmod 600 "$BACK/receipt"
updated=0
restore(){
  if (( updated > 0 )); then
    for i in "${!FILES[@]}"; do
      dst="/usr/local/sbin/${FILES[i]}"
      if [[ -f "$BACK/${FILES[i]}.absent" ]]; then
        rm -f "$dst"
      elif [[ -f "$BACK/${FILES[i]}" ]]; then
        cp -p "$BACK/${FILES[i]}" "$dst"
      fi
    done
    printf 'LOT=%s\nSHA=%s\nSTATE=ROLLED_BACK\n' "$LOT" "$SHA" > "$BACK/receipt"
    echo OPERATOR_UPGRADE_ROLLED_BACK
  fi
}
trap 'rc=$?; trap - EXIT; restore; cleanup; exit "$rc"' EXIT
for i in "${!FILES[@]}"; do
  src="$WORK/${SOURCES[i]}"
  dst="/usr/local/sbin/${FILES[i]}"
  temp=$(mktemp "/usr/local/sbin/.vendi-install.XXXXXXXX")
  install -m 0755 -o root -g root "$src" "$temp"
  mv -f "$temp" "$dst"
  updated=$((updated+1))
done
for i in "${!FILES[@]}"; do bash -n "/usr/local/sbin/${FILES[i]}"; done
# Read-only proof that exact manifest can still be resolved after swap.
"/usr/local/sbin/vendi04-release-runner" status "$LOT" >/dev/null
updated=0
printf 'LOT=%s\nSHA=%s\nSTATE=INSTALLED\n' "$LOT" "$SHA" > "$BACK/receipt"
echo "OPERATOR_UPGRADE_INSTALLED=$SHA"
echo "OPERATOR_BACKUP=$BACK"
echo "PRODUCTION=untouched"
