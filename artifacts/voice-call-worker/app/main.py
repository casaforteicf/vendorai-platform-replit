from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import time
import wave
from dataclasses import dataclass, field
from typing import Any

import av
import httpx
import numpy as np
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription
from av.audio.resampler import AudioResampler
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

app = FastAPI(title="VendorAI Voice Call Worker", version="1.0.0")
sessions: dict[str, "CallSession"] = {}


def _secret_ok(value: str | None) -> bool:
    expected = os.getenv("VENDORAI_CALL_WORKER_SECRET")
    if not expected:
        return True
    return bool(value) and value == expected


def _api_url() -> str:
    value = os.getenv("VENDORAI_API_INTERNAL_URL", "").rstrip("/")
    if not value:
        raise RuntimeError("VENDORAI_API_INTERNAL_URL não configurada")
    return value


def _bridge_secret() -> str:
    value = os.getenv("VENDORAI_VOICE_BRIDGE_SECRET", "")
    if not value:
        raise RuntimeError("VENDORAI_VOICE_BRIDGE_SECRET não configurado")
    return value


class CallCreate(BaseModel):
    call_key: str
    tenant_id: str
    lead_id: str
    session_id: str


class InboundAnswer(CallCreate):
    remote_sdp: str


class RemoteAnswer(BaseModel):
    sdp: str


class OutboundAudioTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self) -> None:
        super().__init__()
        self._queue: asyncio.Queue[bytes] = asyncio.Queue()
        self._buffer = bytearray()
        self._pts = 0
        self._sample_rate = 48000
        self._frame_samples = 960
        self._closed = False

    def clear(self) -> None:
        self._buffer.clear()
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    async def enqueue_wav(self, wav_bytes: bytes) -> None:
        if self._closed:
            return
        container = av.open(io.BytesIO(wav_bytes), format="wav")
        stream = container.streams.audio[0]
        resampler = AudioResampler(format="s16", layout="mono", rate=self._sample_rate)
        chunks: list[bytes] = []
        for frame in container.decode(stream):
            for converted in resampler.resample(frame):
                array = converted.to_ndarray()
                chunks.append(array.astype(np.int16, copy=False).tobytes())
        container.close()
        if chunks:
            await self._queue.put(b"".join(chunks))

    async def recv(self) -> av.AudioFrame:
        if self._closed:
            raise asyncio.CancelledError()

        needed = self._frame_samples * 2
        while len(self._buffer) < needed:
            try:
                chunk = await asyncio.wait_for(self._queue.get(), timeout=0.02)
                self._buffer.extend(chunk)
            except asyncio.TimeoutError:
                break

        if len(self._buffer) >= needed:
            pcm = bytes(self._buffer[:needed])
            del self._buffer[:needed]
        else:
            pcm = bytes(self._buffer)
            self._buffer.clear()
            pcm += b"\x00" * (needed - len(pcm))

        samples = np.frombuffer(pcm, dtype=np.int16).reshape(1, -1)
        frame = av.AudioFrame.from_ndarray(samples, format="s16", layout="mono")
        frame.sample_rate = self._sample_rate
        frame.pts = self._pts
        frame.time_base = av.Rational(1, self._sample_rate)
        self._pts += self._frame_samples
        await asyncio.sleep(self._frame_samples / self._sample_rate)
        return frame

    async def stop(self) -> None:
        self._closed = True
        self.clear()
        await super().stop()


@dataclass
class CallSession:
    call_key: str
    tenant_id: str
    lead_id: str
    session_id: str
    pc: RTCPeerConnection
    outbound: OutboundAudioTrack
    tasks: set[asyncio.Task[Any]] = field(default_factory=set)
    closed: bool = False

    def track_task(self, task: asyncio.Task[Any]) -> None:
        self.tasks.add(task)
        task.add_done_callback(lambda t: self.tasks.discard(t))

    async def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        for task in list(self.tasks):
            task.cancel()
        self.outbound.clear()
        await self.pc.close()


async def _post_audio_turn(session: CallSession, wav_bytes: bytes) -> None:
    payload = {
        "tenantId": session.tenant_id,
        "leadId": session.lead_id,
        "sessionId": session.session_id,
        "audioBase64": base64.b64encode(wav_bytes).decode("ascii"),
        "mimeType": "audio/wav",
        "language": "pt-br",
    }
    headers = {"x-vendorai-voice-bridge-secret": _bridge_secret()}

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{_api_url()}/api/webhooks/voice/call-turn",
            headers=headers,
            json=payload,
        ) as response:
            if response.status_code == 204:
                return
            response.raise_for_status()

            async for line in response.aiter_lines():
                if session.closed or not line:
                    continue
                data = json.loads(line)
                if data.get("type") != "audio_chunk":
                    continue
                encoded = data.get("audioBase64")
                if isinstance(encoded, str) and encoded:
                    await session.outbound.enqueue_wav(base64.b64decode(encoded))


def _wav_from_pcm16(pcm: bytes, sample_rate: int = 16000) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm)
    return output.getvalue()


async def _consume_inbound(session: CallSession, track: MediaStreamTrack) -> None:
    resampler = AudioResampler(format="s16", layout="mono", rate=16000)
    pcm = bytearray()
    speaking = False
    last_voice_at = 0.0
    speech_started_at = 0.0
    threshold = int(os.getenv("VENDORAI_CALL_VAD_THRESHOLD", "420"))
    silence_ms = int(os.getenv("VENDORAI_CALL_SILENCE_MS", "700"))
    min_speech_ms = int(os.getenv("VENDORAI_CALL_MIN_SPEECH_MS", "350"))

    while not session.closed:
        frame = await track.recv()
        converted_frames = resampler.resample(frame)
        for converted in converted_frames:
            raw = converted.to_ndarray().astype(np.int16, copy=False).tobytes()
            values = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
            rms = int(np.sqrt(np.mean(values * values))) if values.size else 0
            now = time.monotonic()

            if rms >= threshold:
                if not speaking:
                    speaking = True
                    speech_started_at = now
                    pcm.clear()
                    session.outbound.clear()
                last_voice_at = now
                pcm.extend(raw)
                continue

            if speaking:
                pcm.extend(raw)
                silence_elapsed = (now - last_voice_at) * 1000
                speech_elapsed = (now - speech_started_at) * 1000
                if silence_elapsed >= silence_ms:
                    speaking = False
                    if speech_elapsed >= min_speech_ms and pcm:
                        segment = _wav_from_pcm16(bytes(pcm))
                        pcm.clear()
                        task = asyncio.create_task(_post_audio_turn(session, segment))
                        session.track_task(task)
                    else:
                        pcm.clear()


async def _attach_handlers(session: CallSession) -> None:
    @session.pc.on("track")
    def on_track(track: MediaStreamTrack) -> None:
        if track.kind == "audio":
            task = asyncio.create_task(_consume_inbound(session, track))
            session.track_task(task)

    @session.pc.on("connectionstatechange")
    async def on_connectionstatechange() -> None:
        if session.pc.connectionState in {"failed", "closed", "disconnected"}:
            await session.close()
            sessions.pop(session.call_key, None)


def _new_session(data: CallCreate) -> CallSession:
    if data.call_key in sessions:
        raise HTTPException(status_code=409, detail="call_key já existe")
    pc = RTCPeerConnection()
    outbound = OutboundAudioTrack()
    pc.addTrack(outbound)
    session = CallSession(
        call_key=data.call_key,
        tenant_id=data.tenant_id,
        lead_id=data.lead_id,
        session_id=data.session_id,
        pc=pc,
        outbound=outbound,
    )
    sessions[data.call_key] = session
    return session


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": "vendorai-webrtc",
        "activeCalls": len(sessions),
    }


@app.post("/v1/calls/outbound-offer")
async def outbound_offer(
    data: CallCreate,
    x_vendorai_call_worker_secret: str | None = Header(default=None),
) -> dict[str, str]:
    if not _secret_ok(x_vendorai_call_worker_secret):
        raise HTTPException(status_code=401, detail="Worker secret inválido")

    session = _new_session(data)
    await _attach_handlers(session)
    offer = await session.pc.createOffer()
    await session.pc.setLocalDescription(offer)
    local = session.pc.localDescription
    if local is None:
        raise HTTPException(status_code=500, detail="Falha ao gerar SDP offer")
    return {"callKey": data.call_key, "sdpType": local.type, "sdp": local.sdp}


@app.post("/v1/calls/inbound-answer")
async def inbound_answer(
    data: InboundAnswer,
    x_vendorai_call_worker_secret: str | None = Header(default=None),
) -> dict[str, str]:
    if not _secret_ok(x_vendorai_call_worker_secret):
        raise HTTPException(status_code=401, detail="Worker secret inválido")

    session = _new_session(data)
    await _attach_handlers(session)
    await session.pc.setRemoteDescription(RTCSessionDescription(sdp=data.remote_sdp, type="offer"))
    answer = await session.pc.createAnswer()
    await session.pc.setLocalDescription(answer)
    local = session.pc.localDescription
    if local is None:
        raise HTTPException(status_code=500, detail="Falha ao gerar SDP answer")
    return {"callKey": data.call_key, "sdpType": local.type, "sdp": local.sdp}


@app.post("/v1/calls/{call_key}/remote-answer")
async def remote_answer(
    call_key: str,
    data: RemoteAnswer,
    x_vendorai_call_worker_secret: str | None = Header(default=None),
) -> dict[str, bool]:
    if not _secret_ok(x_vendorai_call_worker_secret):
        raise HTTPException(status_code=401, detail="Worker secret inválido")
    session = sessions.get(call_key)
    if not session:
        raise HTTPException(status_code=404, detail="Chamada não encontrada")
    await session.pc.setRemoteDescription(RTCSessionDescription(sdp=data.sdp, type="answer"))
    return {"ok": True}


@app.post("/v1/calls/{call_key}/terminate")
async def terminate(
    call_key: str,
    x_vendorai_call_worker_secret: str | None = Header(default=None),
) -> dict[str, bool]:
    if not _secret_ok(x_vendorai_call_worker_secret):
        raise HTTPException(status_code=401, detail="Worker secret inválido")
    session = sessions.pop(call_key, None)
    if session:
        await session.close()
    return {"ok": True}
