import { Router, type IRouter } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { createMediaJob, updateMediaJob } from "../services/media-jobs.js";
import {
  createProcessingMediaProject,
  registerGeneratedMediaOutput,
  setMediaProjectStatus,
} from "../services/media-library.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
const execFileAsync = promisify(execFile);
const objectStorage = new ObjectStorageService();

router.use("/tenants/:tenantId/content-studio/video", requireSameTenanOrSuperAdmin());

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  return fallback;
}

async function hasAudioStream(path: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=index",
      "-of", "csv=p=0",
      path,
    ]);
    return Boolean(stdout.trim());
  } catch {
    return false;
  }
}

async function mediaDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Não foi possível determinar a duração do vídeo");
  return duration;
}

router.post(
  "/tenants/:tenantId/content-studio/video/compose",
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "music", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const video = files["video"]?.[0];
    const music = files["music"]?.[0];
    if (!video || !music) {
      res.status(422).json({ error: "video e music são obrigatórios" });
      return;
    }
    if (!video.mimetype.startsWith("video/")) {
      res.status(422).json({ error: "video precisa ser um arquivo de vídeo" });
      return;
    }
    if (!music.mimetype.startsWith("audio/")) {
      res.status(422).json({ error: "music precisa ser um arquivo de áudio" });
      return;
    }

    const tenantId = String(req.params["tenantId"]);
    const userId = req.user?.sub ?? null;
    const musicVolume = clampNumber(req.body?.musicVolume, 0.18, 0, 1);
    const originalVolume = clampNumber(req.body?.originalVolume, 1, 0, 2);
    const fadeIn = clampNumber(req.body?.fadeIn, 1, 0, 10);
    const fadeOut = clampNumber(req.body?.fadeOut, 1.5, 0, 10);
    const duckingEnabled = parseBoolean(req.body?.ducking, true);
    const duckingThreshold = clampNumber(req.body?.duckingThreshold, 0.04, 0.001, 1);
    const duckingRatio = clampNumber(req.body?.duckingRatio, 8, 1, 20);
    const duckingAttackMs = clampNumber(req.body?.duckingAttackMs, 20, 0.01, 2000);
    const duckingReleaseMs = clampNumber(req.body?.duckingReleaseMs, 250, 0.01, 9000);
    const jobId = randomUUID();
    const projectId = await createProcessingMediaProject({
      tenantId,
      userId,
      title: `Composição com trilha — ${video.originalname}`,
      operation: "video_compose",
      context: {
        videoFilename: video.originalname,
        musicFilename: music.originalname,
        musicVolume,
        originalVolume,
        fadeIn,
        fadeOut,
        duckingEnabled,
        duckingThreshold,
        duckingRatio,
        duckingAttackMs,
        duckingReleaseMs,
      },
    });
    await createMediaJob({
      id: jobId,
      tenantId,
      projectId,
      operation: "video_compose",
      provider: "vendorai",
      input: {
        musicVolume,
        originalVolume,
        fadeIn,
        fadeOut,
        duckingEnabled,
        duckingThreshold,
        duckingRatio,
        duckingAttackMs,
        duckingReleaseMs,
      },
      snapshot: { status: "running", progress: 0 },
    });

    res.status(202).json({ jobId, projectId, provider: "vendorai", operation: "video_compose" });

    void (async () => {
      const videoPath = join(tmpdir(), `compose-video-${jobId}.mp4`);
      const musicExt = music.originalname.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "mp3";
      const musicPath = join(tmpdir(), `compose-music-${jobId}.${musicExt}`);
      const outputPath = join(tmpdir(), `compose-output-${jobId}.mp4`);
      try {
        await Promise.all([
          writeFile(videoPath, video.buffer),
          writeFile(musicPath, music.buffer),
        ]);
        await updateMediaJob(jobId, tenantId, { status: "running", progress: 15 });

        const [duration, sourceHasAudio] = await Promise.all([
          mediaDuration(videoPath),
          hasAudioStream(videoPath),
        ]);
        const safeFadeOut = Math.min(fadeOut, Math.max(0, duration - 0.1));
        const fadeOutStart = Math.max(0, duration - safeFadeOut);
        const musicFilters = [
          `volume=${musicVolume.toFixed(3)}`,
          `atrim=0:${duration.toFixed(3)}`,
          "asetpts=N/SR/TB",
        ];
        if (fadeIn > 0) musicFilters.push(`afade=t=in:st=0:d=${Math.min(fadeIn, duration).toFixed(3)}`);
        if (safeFadeOut > 0) musicFilters.push(`afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${safeFadeOut.toFixed(3)}`);

        const args = ["-y", "-i", videoPath, "-stream_loop", "-1", "-i", musicPath];
        const duckingApplied = sourceHasAudio && duckingEnabled;
        if (duckingApplied) {
          args.push(
            "-filter_complex",
            `[0:a]volume=${originalVolume.toFixed(3)},asplit=2[originalMix][sidechain];` +
              `[1:a]${musicFilters.join(",")}[music];` +
              `[music][sidechain]sidechaincompress=` +
              `threshold=${duckingThreshold.toFixed(4)}:` +
              `ratio=${duckingRatio.toFixed(2)}:` +
              `attack=${duckingAttackMs.toFixed(2)}:` +
              `release=${duckingReleaseMs.toFixed(2)}[duckedMusic];` +
              `[originalMix][duckedMusic]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
            "-map", "0:v:0",
            "-map", "[aout]",
          );
        } else if (sourceHasAudio) {
          args.push(
            "-filter_complex",
            `[0:a]volume=${originalVolume.toFixed(3)}[original];[1:a]${musicFilters.join(",")}[music];[original][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
            "-map", "0:v:0",
            "-map", "[aout]",
          );
        } else {
          args.push(
            "-filter_complex",
            `[1:a]${musicFilters.join(",")}[aout]`,
            "-map", "0:v:0",
            "-map", "[aout]",
          );
        }
        args.push(
          "-c:v", "copy",
          "-c:a", "aac",
          "-b:a", "192k",
          "-shortest",
          "-movflags", "+faststart",
          outputPath,
        );

        await updateMediaJob(jobId, tenantId, { status: "running", progress: 40 });
        await execFileAsync("ffmpeg", args, { maxBuffer: 8 * 1024 * 1024 });
        await updateMediaJob(jobId, tenantId, { status: "running", progress: 80 });

        const output = await readFile(outputPath);
        if (!output.length) throw new Error("FFmpeg retornou vídeo vazio");
        const storageUrl = await objectStorage.savePrivateBuffer(output, "video/mp4", `composed-${jobId}.mp4`);
        const registered = await registerGeneratedMediaOutput({
          tenantId,
          projectId,
          userId,
          storageUrl,
          mimeType: "video/mp4",
          type: "video",
          originalFilename: `composed-${video.originalname.replace(/\.[^.]+$/, "")}.mp4`,
          operation: "video_compose",
          label: "Vídeo com trilha",
          metadata: {
            jobId,
            musicFilename: music.originalname,
            musicVolume,
            originalVolume,
            fadeIn,
            fadeOut,
            sourceHasAudio,
            duckingEnabled,
            duckingApplied,
            duckingThreshold,
            duckingRatio,
            duckingAttackMs,
            duckingReleaseMs,
            engine: "vendorai",
          },
        });
        await updateMediaJob(jobId, tenantId, {
          status: "done",
          progress: 100,
          videoUrl: storageUrl,
          assetId: registered.assetId,
          versionId: registered.versionId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha desconhecida na composição de vídeo";
        await setMediaProjectStatus(tenantId, projectId, "draft").catch(() => undefined);
        await updateMediaJob(jobId, tenantId, { status: "error", error: message }).catch(() => undefined);
      } finally {
        await Promise.all([
          unlink(videoPath).catch(() => undefined),
          unlink(musicPath).catch(() => undefined),
          unlink(outputPath).catch(() => undefined),
        ]);
      }
    })();
  },
);

export default router;
