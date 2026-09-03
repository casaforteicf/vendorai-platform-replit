from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

APP_NAME = "VendorAI Music Worker"
ENGINE = "vendorai"
MODEL = "ace-step"
MODEL_COMMIT = "1bee4c9f5b43e30995f8d4d33b3919197ce1bd68"

app = FastAPI(title=APP_NAME, version="1.0.0")
_generation_lock = asyncio.Semaphore(max(1, int(os.getenv("VENDORAI_MUSIC_CONCURRENCY", "1"))))
_pipeline = None
_pipeline_lock = asyncio.Lock()


class MusicRequest(BaseModel):
    jobId: str = Field(min_length=1, max_length=100)
    prompt: str = Field(min_length=1, max_length=1500)
    durationSeconds: int = Field(default=30, ge=5, le=90)
    style: str | None = Field(default=None, max_length=200)
    mood: str | None = Field(default=None, max_length=120)
    energy: str | None = Field(default=None, max_length=120)
    instrumental: bool = True


def _secret_is_valid(provided: str | None) -> bool:
    expected = os.getenv("VENDORAI_MUSIC_WORKER_SECRET")
    return not expected or provided == expected


def _cuda_ready() -> bool:
    try:
        import torch
        return bool(torch.cuda.is_available())
    except Exception:
        return False


def _checkpoint_dir() -> Path:
    return Path(os.getenv("ACESTEP_CHECKPOINT_DIR", "/models/ace-step")).resolve()


def _checkpoints_ready() -> bool:
    root = _checkpoint_dir()
    return root.exists() and any(path.is_file() for path in root.rglob("*"))


async def _get_pipeline():
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    async with _pipeline_lock:
        if _pipeline is not None:
            return _pipeline
        if not _cuda_ready():
            raise RuntimeError("GPU NVIDIA/CUDA não está disponível")
        from acestep.pipeline_ace_step import ACEStepPipeline
        root = _checkpoint_dir()
        root.mkdir(parents=True, exist_ok=True)
        _pipeline = await asyncio.to_thread(
            ACEStepPipeline,
            checkpoint_dir=str(root),
            dtype=os.getenv("ACESTEP_DTYPE", "bfloat16"),
            torch_compile=False,
            cpu_offload=os.getenv("ACESTEP_CPU_OFFLOAD", "false").lower() == "true",
            overlapped_decode=False,
        )
        return _pipeline


def _prompt(request: MusicRequest) -> str:
    parts = [request.prompt.strip()]
    if request.style:
        parts.append(f"Style: {request.style.strip()}")
    if request.mood:
        parts.append(f"Mood: {request.mood.strip()}")
    if request.energy:
        parts.append(f"Energy: {request.energy.strip()}")
    if request.instrumental:
        parts.append("Instrumental background music")
    return ". ".join(parts)


def _generate_sync(pipeline, request: MusicRequest, output_path: Path) -> None:
    from acestep.data_sampler import DataSampler
    defaults = DataSampler().sample()
    pipeline(
        audio_duration=float(request.durationSeconds),
        prompt=_prompt(request),
        lyrics="[Instrumental]" if request.instrumental else str(defaults.get("lyrics", "")),
        infer_step=defaults["infer_step"],
        guidance_scale=defaults["guidance_scale"],
        scheduler_type=defaults["scheduler_type"],
        cfg_type=defaults["cfg_type"],
        omega_scale=defaults["omega_scale"],
        manual_seeds=", ".join(map(str, defaults.get("actual_seeds", [0]))),
        guidance_interval=defaults["guidance_interval"],
        guidance_interval_decay=defaults["guidance_interval_decay"],
        min_guidance_scale=defaults["min_guidance_scale"],
        use_erg_tag=defaults["use_erg_tag"],
        use_erg_lyric=defaults["use_erg_lyric"],
        use_erg_diffusion=defaults["use_erg_diffusion"],
        oss_steps=", ".join(map(str, defaults.get("oss_steps", []))),
        guidance_scale_text=defaults.get("guidance_scale_text", 0.0),
        guidance_scale_lyric=defaults.get("guidance_scale_lyric", 0.0),
        save_path=str(output_path),
    )


@app.get("/health")
async def health() -> dict[str, Any]:
    cuda_ready = _cuda_ready()
    model_ready = _checkpoints_ready()
    return {
        "status": "ok" if cuda_ready and model_ready else "warming",
        "engine": ENGINE,
        "capability": "music_generate",
        "model": MODEL,
        "modelCommit": MODEL_COMMIT,
        "cudaAvailable": cuda_ready,
        "modelReady": model_ready,
        "ready": cuda_ready and model_ready,
    }


@app.post("/v1/music/generate")
async def generate_music(request: MusicRequest, x_vendorai_worker_secret: str | None = Header(default=None)) -> Response:
    if not _secret_is_valid(x_vendorai_worker_secret):
        raise HTTPException(status_code=401, detail="Worker secret inválido")
    output_path: Path | None = None
    try:
        pipeline = await _get_pipeline()
        with tempfile.NamedTemporaryFile(prefix="vendorai-music-", suffix=".wav", delete=False) as temp:
            output_path = Path(temp.name)
        async with _generation_lock:
            await asyncio.wait_for(
                asyncio.to_thread(_generate_sync, pipeline, request, output_path),
                timeout=max(60, min(900, int(os.getenv("VENDORAI_MUSIC_TIMEOUT_SECONDS", "300")))),
            )
        audio = output_path.read_bytes()
        if not audio:
            raise RuntimeError("Geração concluída sem produzir WAV")
        return Response(content=audio, media_type="audio/wav", headers={"x-vendorai-model": MODEL})
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Geração musical excedeu o tempo máximo") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha na geração musical: {str(exc)[:500]}") from exc
    finally:
        if output_path is not None:
            output_path.unlink(missing_ok=True)
