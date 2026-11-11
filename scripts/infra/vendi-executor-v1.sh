#!/usr/bin/env bash
# Vendi Executor v1: fixed read-only probes; no shell strings from the model.
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
ACTION="${1:-}"
[[ "$#" -eq 1 ]] || { echo INVALID_ARGUMENTS; exit 64; }
case "$ACTION" in
  identity)
    /usr/bin/id -un
    /usr/bin/hostname
    ;;
  homolog-health)
    /usr/bin/curl --fail --silent --show-error --max-time 8 http://127.0.0.1:5000/api/auth/healthz
    ;;
  production-health)
    /usr/bin/curl --fail --silent --show-error --max-time 8 http://127.0.0.1:5001/api/auth/healthz
    ;;
  *)
    echo ACTION_NOT_ALLOWED
    exit 64
    ;;
esac
