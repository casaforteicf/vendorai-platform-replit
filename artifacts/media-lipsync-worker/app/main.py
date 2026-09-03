from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response

APP_NAME = "VendorAI LipSync Worker"
ENGINE = "vendorai"
MODEL = "musetalk-1.5"
MAX_FACE_BYTES = 30 * 1024 * 1024
MAX_AUDIO_BYTES = 80 * 1024 * 1024
DEFAULT_TIMEOUT_SECONDS = 840

app = FastAPI(title=APP_NAME, version="1.0.0")
_generation_lock = asyncio.Semaphore(max(1, int(os.getenv("VENDORAI_LIPSYNC_CONCURRENCY", "1"))))


def _secret_is_valid(provided: str | None) -> bool:
    expected = os.getenv("VENDORAI_LIPSYNC_WORKER_SECRET") or os.getenv("VENDORAI_MEDIA_WORKER_SECRET")
    if not expected:
        return True
    return bool(provided) and provided == expected


def _musetalk_root() -> Path:
    root = Path(os.getenv("MUSETALK_ROOT", "/opt/MuseTalk")).resolve()
    if not (root / "scripts" / "inference.py").exists():
        raise RuntimeError(f"MuseTalk não encontrado em {root}")
    return root


def _clamp_bbox_shift(raw: int) -> int:
    return max(-20, min(20, int(raw)))


async def _read_limited(upload: UploadFile, limit: int, label: str) -> bytes:
    payload = await upload.read(limit + 1)
    if not payload:
        raise HTTPException(status_code=422, detail=f"{label} vazio")
    if len(payload) > limit:
        raise HTTPException(status_code=422, detail=f"{label} excede o limite permitido")
    return payload


def _safe_suffix(filename: str | None, fallback: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    if not suffix or len(suffix) > 8 or not suffix.replace(".", "").isalnum():
        return fallback
    return suffix


def _find_output_mp4(result_dir: Path) -> Path:
    candidates = [path for path in result_dir.rglob("*.mp4") if path.is_file()]
    if not candidates:
        raise RuntimeError("MuseTalk concluiu sem produzir MP4")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def _run_musetalk(root: Path, config_path: Path, result_dir: Path, timeout_seconds: int) -> Path:
    command = [
        sys.executable,
        "-m",
        "scripts.inference",
        "--inference_config",
        str(config_path),
        "--result_dir",
        str(result_dir),
        "--unet_model_path",
        str(root / "models" / "musetalkV15" / "unet.pth"),
        "--unet_config",
        str(root / "models" / "musetalkV15" / "musetalk.json"),
        "--version",
        "v15",
        "--ffmpeg_path",
        os.getenv("FFMPEG_PATH", "/usr/bin"),
    ]
    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")
    completed = subprocess.run(
        command,
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "erro desconhecido")[-2000:]
        raise RuntimeError(f"MuseTalk falhou ({completed.returncode}): {detail}")
    return _find_output_mp4(result_dir)


@app.get("/health")
async def health() -> dict[str, Any]:
    root = Path(os.getenv("MUSETALK_ROOT", "/opt/MuseTalk"))
    model_ready = (root / "models" / "musetalkV15" / "unet.pth").exists()
    return {
        "status": "ok" if model_ready else "warming",
        "engine": ENGINE,
        "capability": "avatar_lipsync",
        "model": MODEL,
        "modelReady": model_ready,
        "cudaVisible": bool(os.getenv("NVIDIA_VISIBLE_DEVICES", "")),
        "concurrency": max(1, int(os.getenv("VENDORAI_LIPSYNC_CONCURRENCY", "1"))),
    }


@app.post("/v1/lipsync/generate")
async def generate_lipsync(
    job_id: str = Form(...),
    bbox_shift: int = Form(0),
    source_face: UploadFile = File(...),
    audio: UploadFile = File(...),
    x_vendorai_worker_secret: str | None = Header(default=None),
) -> Response:
    if not _secret_is_valid(x_vendorai_worker_secret):
        raise HTTPException(status_code=401, detail="Worker secret inválido")
    if not job_id.strip() or len(job_id) > 100:
        raise HTTPException(status_code=422, detail="job_id inválido")

    face_type = (source_face.content_type or "").lower()
    audio_type = (audio.content_type or "").lower()
    if face_type and not (face_type.startswith("image/") or face_type.startswith("video/")):
        raise HTTPException(status_code=422, detail="source_face precisa ser imagem ou vídeo")
    if audio_type and not audio_type.startswith("audio/"):
        raise HTTPException(status_code=422, detail="audio precisa ser um arquivo de áudio")

    face_bytes, audio_bytes = await asyncio.gather(
        _read_limited(source_face, MAX_FACE_BYTES, "source_face"),
        _read_limited(audio, MAX_AUDIO_BYTES, "audio"),
    )
    bbox = _clamp_bbox_shift(bbox_shift)
    timeout_seconds = max(60, min(1800, int(os.getenv("VENDORAI_LIPSYNC_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)))))

    workspace: Path | None = None
    try:
        root = _musetalk_root()
        workspace = Path(tempfile.mkdtemp(prefix=f"vendorai-lipsync-{job_id[:36]}-"))
        input_dir = workspace / "input"
        result_dir = workspace / "result"
        input_dir.mkdir(parents=True)
        result_dir.mkdir(parents=True)

        face_path = input_dir / f"face{_safe_suffix(source_face.filename, '.jpg')}"
        audio_path = input_dir / f"audio{_safe_suffix(audio.filename, '.wav')}"
        face_path.write_bytes(face_bytes)
        audio_path.write_bytes(audio_bytes)

        config_path = workspace / "inference.yaml"
        config_path.write_text(
            yaml.safe_dump(
                {
                    "vendorai_job": {
                        "video_path": str(face_path),
                        "audio_path": str(audio_path),
                        "bbox_shift": bbox,
                    }
                },
                sort_keys=False,
            ),
            encoding="utf-8",
        )

        async with _generation_lock:
            output_path = await asyncio.to_thread(_run_musetalk, root, config_path, result_dir, timeout_seconds)
        video = output_path.read_bytes()
        if not video:
            raise RuntimeError("MP4 de saída vazio")
        return Response(
            content=video,
            media_type="video/mp4",
            headers={
                "x-vendorai-engine": "lipsync",
                "x-vendorai-model": MODEL,
                "x-vendorai-job-id": job_id,
            },
        )
    except HTTPException:
        raise
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Lip-sync excedeu o tempo máximo de processamento") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha no lip-sync: {str(exc)[:500]}") from exc
    finally:
        if workspace is not None:
            shutil.rmtree(workspace, ignore_errors=True)
