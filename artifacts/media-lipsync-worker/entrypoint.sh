#!/usr/bin/env bash
set -euo pipefail

ROOT="${MUSETALK_ROOT:-/opt/MuseTalk}"
MODEL_FILE="$ROOT/models/musetalkV15/unet.pth"

if [[ "${VENDORAI_LIPSYNC_AUTO_DOWNLOAD_WEIGHTS:-0}" == "1" && ! -s "$MODEL_FILE" ]]; then
  echo "[vendorai-lipsync] provisionando pesos oficiais do MuseTalk 1.5..."
  cd "$ROOT"
  bash ./download_weights.sh
fi

cd /srv/vendorai-lipsync
exec python -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers 1
