/**
 * Audio Transcription Service
 *
 * Downloads audio files from Z-API and transcribes them using OpenAI Whisper.
 * The transcribed text is then treated as a normal text message in the pipeline.
 */

import OpenAI from "openai";
import { mkdtemp, writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Logger } from "pino";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeAudio(audioUrl: string, log?: Logger): Promise<string> {
  log?.info({ audioUrl: audioUrl.slice(0, 60) }, "audio: downloading");

  // 1. Download audio file
  const response = await fetch(audioUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  // 2. Save to temp file (Whisper requires a file path)
  const tmpDir = await mkdtemp(join(tmpdir(), "audio-"));
  const tmpPath = join(tmpDir, `audio_${Date.now()}.ogg`);
  await writeFile(tmpPath, buffer);

  try {
    // 3. Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: new File([buffer], "audio.ogg", { type: "audio/ogg" }),
      model: "whisper-1",
      language: "pt",
      response_format: "text",
    });

    const text = (typeof transcription === "string" ? transcription : transcription.text ?? "").trim();
    log?.info({ text: text.slice(0, 100) }, "audio: transcribed");
    return text;
  } finally {
    // 4. Clean up temp file
    await unlink(tmpPath).catch(() => {});
  }
}
