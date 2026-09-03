#!/usr/bin/env bash
set -euo pipefail

export PYTHONPATH="${ACESTEP_ROOT:-/opt/ACE-Step}:${PYTHONPATH:-}"
mkdir -p "${ACESTEP_CHECKPOINT_DIR:-/models/ace-step}"

if [[ "${VENDORAI_MUSIC_AUTO_DOWNLOAD_WEIGHTS:-false}" == "true" ]]; then
  python3.10 - <<'PY'
import os
from acestep.pipeline_ace_step import ACEStepPipeline
root = os.environ.get("ACESTEP_CHECKPOINT_DIR", "/models/ace-step")
ACEStepPipeline(
    checkpoint_dir=root,
    dtype=os.environ.get("ACESTEP_DTYPE", "bfloat16"),
    torch_compile=False,
    cpu_offload=os.environ.get("ACESTEP_CPU_OFFLOAD", "false").lower() == "true",
    overlapped_decode=False,
)
print("ACE-Step checkpoints ready")
PY
fi

exec python3.10 -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
