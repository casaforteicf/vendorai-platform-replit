from __future__ import annotations

import asyncio
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

import torch
import torchaudio
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

APP_NAME = "VendorAI Media Worker"
MODEL_NAME = os.getenv("VENDORAI_VOICE_MODEL", "chatterbox-multilingual")
DEFAULT_LANGUAGE = "pt"
MAX_TEXT_LENGTH = 5000
MAX_CHUNK_LENGTH = 320
MAX_REFERENCE_BYTES = 25 * 1024 * 1024

app = FastAPI(title=APP_NAME, version="1.0.0")
_generation_lock = asyncio.Semaphore(max(1, int(os.getenv("VENDORAI_VOICE_CONCURRENCY", "1"))))
_model: ChatterboxMultilingualTTS | None = None
_model_lock = asyncio.Lock()


def _worker_secret_is_valid(provided: str | None) -> bool:
    expected = os.getenv("VENDORAI_MEDIA_WORKER_SECRET")
    if not expected:
        return True
    return bool(provided) and provided == expected


def _normalize_language(language: str) -> str:
    value = (language or DEFAULT_LANGUAGE).strip().lower().replace("_", "-")
    aliases = {
        "pt-br": "pt",
        "pt-pt": "pt",
        "por": "pt",
        "portuguese": "pt",
        "en-us": "en",
        "en-gb": "en",
    }
    return aliases.get(value, value.split("-", 1)[0])


def _clamp_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, parsed))


def _parse_model_config(raw: str) -> dict[str, float]:
    try:
        data = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="model_config precisa ser JSON válido") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="model_config precisa ser um objeto JSON")
    return {
        "exaggeration": _clamp_float(data.get("exaggeration"), 0.5, 0.0, 1.0),
        "cfg_weight": _clamp_float(data.get("cfg_weight"), 0.5, 0.0, 1.0),
        "temperature": _clamp_float(data.get("temperature"), 0.8, 0.1, 1.5),
    }


def _split_text(text: str, limit: int = MAX_CHUNK_LENGTH) -> list[str]:
    compact = re.sub(r"\s+", " ", text).strip()
    if not compact:
        return []

    sentences = re.split(r"(?<=[.!?;:])\s+", compact)
    chunks: list[str] = []
    current = ""

    def flush() -> None:
        nonlocal current
        if current.strip():
            chunks.append(current.strip())
        current = ""

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) <= limit:
            candidate = f"{current} {sentence}".strip()
            if len(candidate) <= limit:
                current = candidate
            else:
                flush()
                current = sentence
            continue

        flush()
        words = sentence.split(" ")
        piece = ""
        for word in words:
            if len(word) > limit:
                if piece:
                    chunks.append(piece)
                    piece = ""
                for start in range(0, len(word), limit):
                    chunks.append(word[start : start + limit])
                continue
            candidate = f"{piece} {word}".strip()
            if len(candidate) > limit:
                if piece:
                    chunks.append(piece)
                piece = word
            else:
                piece = candidate
        if piece:
            chunks.append(piece)
    flush()
    return chunks


async def _get_model() -> ChatterboxMultilingualTTS:
    global _model
    if _model is not None:
        return _model
    async with _model_lock:
        if _model is not None:
            return _model
        device = "cuda" if torch.cuda.is_available() else os.getenv("VENDORAI_MEDIA_DEVICE", "cpu")
        if device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA solicitado, mas GPU não está disponível")

        def load() -> ChatterboxMultilingualTTS:
            return ChatterboxMultilingualTTS.from_pretrained(device=device, t3_model="v3")

        _model = await asyncio.to_thread(load)
        return _model


def _to_audio_tensor(value: Any) -> torch.Tensor:
    if isinstance(value, tuple):
        value = value[0]
    if not isinstance(value, torch.Tensor):
        raise RuntimeError("Modelo retornou um formato de áudio inesperado")
    audio = value.detach().float().cpu()
    if audio.ndim == 1:
        audio = audio.unsqueeze(0)
    elif audio.ndim > 2:
        audio = audio.reshape(1, -1)
    return audio


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": "vendorai",
        "model": MODEL_NAME,
        "voice": "chatterbox-multilingual",
        "cudaAvailable": torch.cuda.is_available(),
        "device": "cuda" if torch.cuda.is_available() else os.getenv("VENDORAI_MEDIA_DEVICE", "cpu"),
        "modelLoaded": _model is not None,
        "watermarking": "provider-default-preserved",
    }


@app.post("/v1/voice/synthesize")
async def synthesize_voice(
    job_id: str = Form(...),
    text: str = Form(...),
    language: str = Form(DEFAULT_LANGUAGE),
    model_config: str = Form("{}"),
    reference_audio: UploadFile = File(...),
    x_vendorai_worker_secret: str | None = Header(default=None),
) -> Response:
    if not _worker_secret_is_valid(x_vendorai_worker_secret):
        raise HTTPException(status_code=401, detail="Worker secret inválido")

    text = text.strip()
    if not text or len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=422, detail=f"text deve conter entre 1 e {MAX_TEXT_LENGTH} caracteres")

    config = _parse_model_config(model_config)
    chunks = _split_text(text)
    if not chunks:
        raise HTTPException(status_code=422, detail="Texto vazio após normalização")

    reference_bytes = await reference_audio.read(MAX_REFERENCE_BYTES + 1)
    if not reference_bytes or len(reference_bytes) > MAX_REFERENCE_BYTES:
        raise HTTPException(status_code=422, detail="Áudio de referência vazio ou maior que 25 MB")

    suffix = Path(reference_audio.filename or "reference.wav").suffix or ".wav"
    reference_path: str | None = None
    output_path: str | None = None

    try:
        with tempfile.NamedTemporaryFile(prefix=f"vendorai-{job_id}-ref-", suffix=suffix, delete=False) as ref_file:
            ref_file.write(reference_bytes)
            reference_path = ref_file.name

        model = await _get_model()
        sample_rate = int(model.sr)
        generated: list[torch.Tensor] = []
        silence = torch.zeros((1, max(1, int(sample_rate * 0.16))), dtype=torch.float32)
        normalized_language = _normalize_language(language)

        async with _generation_lock:
            for index, chunk in enumerate(chunks):
                def generate() -> Any:
                    return model.generate(
                        chunk,
                        language_id=normalized_language,
                        audio_prompt_path=reference_path,
                        exaggeration=config["exaggeration"],
                        cfg_weight=config["cfg_weight"],
                        temperature=config["temperature"],
                    )

                piece = _to_audio_tensor(await asyncio.to_thread(generate))
                generated.append(piece)
                if index < len(chunks) - 1:
                    generated.append(silence)

        audio = torch.cat(generated, dim=-1)
        with tempfile.NamedTemporaryFile(prefix=f"vendorai-{job_id}-out-", suffix=".wav", delete=False) as out_file:
            output_path = out_file.name
        torchaudio.save(output_path, audio, sample_rate)
        wav_bytes = Path(output_path).read_bytes()
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "x-vendorai-engine": "voice",
                "x-vendorai-job-id": job_id,
                "x-vendorai-language": normalized_language,
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha na síntese de voz: {str(exc)[:300]}") from exc
    finally:
        for path in (reference_path, output_path):
            if path:
                try:
                    Path(path).unlink(missing_ok=True)
                except OSError:
                    pass
