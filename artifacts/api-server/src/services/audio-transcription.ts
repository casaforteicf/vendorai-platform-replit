/**
 * Audio Transcription Service
 *
 * Downloads audio files from Z-API and transcribes them using OpenAI Whisper.
 * The transcribed text is then treated as a normal text message in the pipeline.
 */

import { mkdtemp, writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Logger } from "pino";
import { transcribeAudio as gatewayTranscribeAudio } from "../lib/ai-gateway.js";


export async function transcribeAudioBuffer(buffer: Buffer, tenantId: string, log?: Logger): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), "audio-"));
  const tmpPath = join(tmpDir, `audio_${Date.now()}.ogg`);
  await writeFile(tmpPath, buffer);
  try {
    const { text } = await gatewayTranscribeAudio(tenantId, "audio_transcription", buffer, {
      mimeType: "audio/ogg",
      language: "pt",
      log,
    });
    log?.info({ text: text.slice(0, 100) }, "audio: transcribed from buffer");
    return text;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

export async function transcribeAudio(audioUrl: string, tenantId: string, log?: Logger): Promise<string> {
  log?.info({ audioUrl: audioUrl.slice(0, 60) }, "audio: downloading");

  // 1. Download audio file
  const response = await fetch(audioUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  // 2. Save to temp file (for cleanup purposes)
  const tmpDir = await mkdtemp(join(tmpdir(), "audio-"));
  const tmpPath = join(tmpDir, `audio_${Date.now()}.ogg`);
  await writeFile(tmpPath, buffer);

  try {
    // 3. Transcribe via gateway (BYOK + quota + logging)
    const { text } = await gatewayTranscribeAudio(tenantId, "audio_transcription", buffer, {
      mimeType: "audio/ogg",
      language: "pt",
      log,
    });
    log?.info({ text: text.slice(0, 100) }, "audio: transcribed");
    return text;
  } finally {
    // 4. Clean up temp file
    await unlink(tmpPath).catch(() => {});
  }
}
