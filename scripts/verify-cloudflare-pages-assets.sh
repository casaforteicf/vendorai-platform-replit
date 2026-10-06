#!/usr/bin/env bash
set -euo pipefail

root="${1:?build root is required}"
public_base="${2:?public base is required}"

if [ ! -d "$root/assets" ]; then
  echo "::error::Assets directory not found: $root/assets"
  exit 1
fi

echo "Verifying every published JS/CSS asset with propagation retries."
export public_base

find "$root/assets" -maxdepth 1 -type f \( -name '*.js' -o -name '*.css' \) -printf '%f\n' \
  | sort \
  | xargs -r -P 20 -n 1 bash -c '
      set -euo pipefail
      file="$1"
      base="$public_base"
      for attempt in {1..12}; do
        if curl -fsS --connect-timeout 5 --max-time 20 -o /dev/null "$base/assets/$file"; then
          exit 0
        fi
        if [ "$attempt" -lt 12 ]; then
          sleep 5
        fi
      done
      echo "::error::Published bundle is missing asset after propagation retries: $file"
      exit 1
    ' bash

echo "Production bundle integrity verified."
