#!/usr/bin/env bash
# Runs one small real Cycles render and fails unless the requested GPU backend is used.
set -euo pipefail

BLENDER_BIN="${BLENDER_PATH:-/opt/blender/blender}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCENE_FILE="$(mktemp /tmp/arqdor-gpu-scene.XXXXXX.json)"
OUTPUT_FILE="/tmp/arqdor-gpu-smoke.png"
LOG_FILE="/tmp/arqdor-gpu-smoke.log"
BACKEND="${ARQDOR_CYCLES_GPU_BACKEND:-OPTIX}"

cleanup() {
  rm -f "$SCENE_FILE"
}
trap cleanup EXIT

if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "FAIL: nvidia-smi não está disponível no container." >&2
  exit 2
fi
nvidia-smi

cat > "$SCENE_FILE" <<'JSON'
{
  "qualityPreset": "preview",
  "resolution": [960, 540],
  "samples": 16,
  "hdri": "natural",
  "hdriStrength": 0.8,
  "room": {
    "width": 4.0,
    "depth": 4.0,
    "height": 2.8,
    "wallColor": [0.85, 0.85, 0.82],
    "floorColor": [0.45, 0.42, 0.38],
    "floorRoughness": 0.7,
    "floorMetallic": 0.0
  },
  "camera": {
    "location": [0, -4.5, 1.5],
    "target": [0, 0, 1.1],
    "fov": 55
  },
  "objects": [
    {
      "type": "mesa",
      "name": "GPU Smoke Test Table",
      "location": [0, 0, 0],
      "scale": [0.8, 0.8, 0.8],
      "color": [0.3, 0.45, 0.55],
      "metallic": 0.0,
      "roughness": 0.4
    }
  ]
}
JSON

rm -f "$OUTPUT_FILE" "$LOG_FILE"
SCENE_CONFIG_PATH="$SCENE_FILE" OUTPUT_PATH="$OUTPUT_FILE" \
  timeout 180 "$BLENDER_BIN" --background --python "$SCRIPT_DIR/blender_render.py" \
  >"$LOG_FILE" 2>&1 || {
    tail -n 100 "$LOG_FILE" >&2
    echo "FAIL: Blender retornou erro." >&2
    exit 3
  }

if ! grep -F "Cycles GPU habilitada: $BACKEND" "$LOG_FILE" >/dev/null; then
  tail -n 100 "$LOG_FILE" >&2
  echo "FAIL: render terminou sem confirmar o backend GPU $BACKEND; não aceitar fallback CPU como teste aprovado." >&2
  exit 4
fi
if [ ! -s "$OUTPUT_FILE" ] || [ "$(head -c 8 "$OUTPUT_FILE" | od -An -tx1 | tr -d ' \n')" != "89504e470d0a1a0a" ]; then
  tail -n 100 "$LOG_FILE" >&2
  echo "FAIL: arquivo PNG ausente ou inválido." >&2
  exit 5
fi

echo "PASS: backend=$BACKEND output=$OUTPUT_FILE size=$(stat -c '%s' "$OUTPUT_FILE") bytes"
grep -F "Cycles GPU habilitada:" "$LOG_FILE" | tail -n 1
