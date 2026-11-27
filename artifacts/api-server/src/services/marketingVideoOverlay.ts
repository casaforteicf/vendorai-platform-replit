import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ensureFfmpegOnPath } from "../lib/ffmpeg.js";

const execFileAsync = promisify(execFile);

/**
 * Grava a camada de marca (PNG transparente 1080x1920/1080x1080) por cima do
 * vídeo final. É a versão "queimada" do design: o que aparece na revisão
 * também aparece no MP4 publicado.
 */
export async function burnOverlayOnVideo(video: Buffer, overlay: Buffer): Promise<Buffer> {
  ensureFfmpegOnPath();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `video-overlay-${id}-in.mp4`);
  const overlayPath = join(tmpdir(), `video-overlay-${id}.png`);
  const outputPath = join(tmpdir(), `video-overlay-${id}-out.mp4`);
  try {
    await writeFile(inputPath, video);
    await writeFile(overlayPath, overlay);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-i", overlayPath,
      "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-c:a", "copy",
      "-movflags", "+faststart",
      outputPath,
    ], { maxBuffer: 16 * 1024 * 1024 });
    const output = await readFile(outputPath);
    if (!output.length) throw new Error("FFmpeg retornou vídeo vazio ao aplicar o texto.");
    return output;
  } finally {
    await Promise.all([
      unlink(inputPath).catch(() => undefined),
      unlink(overlayPath).catch(() => undefined),
      unlink(outputPath).catch(() => undefined),
    ]);
  }
}
