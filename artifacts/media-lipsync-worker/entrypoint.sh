#!/usr/bin/env bash
set -euo pipefail

MODEL_FILE="${MUSETALK_DIR:-/opt/MuseTalk}/models/musetalkV15/unet.pth"

if [[ "${VENDORAI_LIPSYNC_AUTO_DOWNLOAD_WEIGHTS:-0}" == "1" && ! -s "$MODEL_FILE" ]]; then
  echo "[vendorai-lipsync] provisioning MuseTalk 1.5 weights..."
  cd "${MUSETALK_DIR:-/opt/MuseTalk}"
  bash ./download_weights.sh
  cd /srv/vendorai-lipsync
fi

exec python3 -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers 1
