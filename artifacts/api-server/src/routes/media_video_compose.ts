import { Router, type IRouter } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pool } from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { createMediaJob, updateMediaJob } from "../services/media-jobs.js";
import {
  createProcessingMediaProject,
  registerGeneratedMediaOutput,
  setMediaProjectStatus,
} from "../services/media-library.js";
import { assessMediaAudioUsage, normalizeMediaAudioRights } from "../services/media-rights.js";
import { applyBrandBroll } from "../services/media-broll.js";
import { applyBrandIntroOutro } from "../services/media-brand-video.js";
import mediaTracksRouter from "./media_tracks.js";

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
    const uploadedMusic = files["music"]?.[0];
    const musicAssetId = typeof req.body?.musicAssetId === "string" ? req.body.musicAssetId.trim() : "";

    if (!video) {
      res.status(422).json({ error: "video é obrigatório" });
      return;
    }
    if (!video.mimetype.startsWith("video/")) {
      res.status(422).json({ error: "video precisa ser um arquivo de vídeo" });
      return;
    }
    if ((!uploadedMusic && !musicAssetId) || (uploadedMusic && musicAssetId)) {
      res.status(422).json({ error: "Informe exatamente uma trilha: music ou musicAssetId" });
      return;
    }
    if (uploadedMusic && !uploadedMusic.mimetype.startsWith("audio/")) {
      res.status(422).json({ error: "music precisa ser um arquivo de áudio" });
      return;
    }

    const tenantId = String(req.params["tenantId"]);
    const userId = req.user?.sub ?? null;
    let musicBuffer: Buffer;
    let musicFilename: string;
    let selectedMusicAssetId: string | null = null;
    let musicRights: ReturnType<typeof normalizeMediaAudioRights> | null = null;
    let musicUsage: ReturnType<typeof assessMediaAudioUsage> | null = null;

    if (musicAssetId) {
      const assetResult = await pool.query(
        `SELECT id, storage_url, original_filename, metadata
           FROM media_assets
          WHERE tenant_id = $1
            AND id = $2
            AND type = 'audio'
            AND role = 'music'
          LIMIT 1`,
        [tenantId, musicAssetId],
      );
      if (!assetResult.rowCount) {
        res.status(404).json({ error: "Trilha da biblioteca não encontrada" });
        return;
      }

      const asset = assetResult.rows[0];
      const storageUrl = String(asset.storage_url ?? "");
      try {
        const file = await objectStorage.getObjectEntityFile(storageUrl);
        [musicBuffer] = await file.download();
      } catch {
        res.status(422).json({ error: "Arquivo da trilha não está disponível no Object Storage" });
        return;
      }
      musicFilename = String(asset.original_filename ?? `track-${musicAssetId}.mp3`);
      selectedMusicAssetId = String(asset.id);
      const metadata = asRecord(asset.metadata);
      musicRights = normalizeMediaAudioRights(metadata["rights"]);
      musicUsage = assessMediaAudioUsage(musicRights);
    } else {
      musicBuffer = uploadedMusic!.buffer;
      musicFilename = uploadedMusic!.originalname;
    }

    const musicVolume = clampNumber(req.body?.musicVolume, 0.18, 0, 1);
    const originalVolume = clampNumber(req.body?.originalVolume, 1, 0, 2);
    const fadeIn = clampNumber(req.body?.fadeIn, 1, 0, 10);
    const fadeOut = clampNumber(req.body?.fadeOut, 1.5, 0, 10);
    const duckingEnabled = parseBoolean(req.body?.ducking, true);
    const duckingThreshold = clampNumber(req.body?.duckingThreshold, 0.04, 0.001, 1);
    const duckingRatio = clampNumber(req.body?.duckingRatio, 8, 1, 20);
    const duckingAttackMs = clampNumber(req.body?.duckingAttackMs, 20, 0.01, 2000);
    const duckingReleaseMs = clampNumber(req.body?.duckingReleaseMs, 250, 0.01, 9000);
    const brollContext = typeof req.body?.brollContext === "string"
      ? req.body.brollContext.trim().slice(0, 4000)
      : video.originalname;
    const jobId = randomUUID();
    const projectId = await createProcessingMediaProject({
      tenantId,
      userId,
      title: `Composição com trilha — ${video.originalname}`,
      operation: "video_compose",
      context: {
        videoFilename: video.originalname,
        musicFilename,
        musicAssetId: selectedMusicAssetId,
        musicRights,
        musicUsage,
        musicVolume,
        originalVolume,
        fadeIn,
        fadeOut,
        duckingEnabled,
        duckingThreshold,
        duckingRatio,
        duckingAttackMs,
        duckingReleaseMs,
        brollContext,
      },
    });
    await createMediaJob({
      id: jobId,
      tenantId,
      projectId,
      operation: "video_compose",
      provider: "vendorai",
      input: {
        musicAssetId: selectedMusicAssetId,
        musicRights,
        musicUsage,
        musicVolume,
        originalVolume,
        fadeIn,
        fadeOut,
        duckingEnabled,
        duckingThreshold,
        duckingRatio,
        duckingAttackMs,
        duckingReleaseMs,
        brollContext,
      },
      snapshot: { status: "running", progress: 0 },
    });

    res.status(202).json({ jobId, projectId, provider: "vendorai", operation: "video_compose" });

    void (async () => {
      const videoPath = join(tmpdir(), `compose-video-${jobId}.mp4`);
      const musicExt = musicFilename.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "mp3";
      const musicPath = join(tmpdir(), `compose-music-${jobId}.${musicExt}`);
      const outputPath = join(tmpdir(), `compose-output-${jobId}.mp4`);
      let brollCleanup: (() => Promise<void>) | null = null;
      let brandCleanup: (() => Promise<void>) | null = null;
      try {
        await Promise.all([
          writeFile(videoPath, video.buffer),
          writeFile(musicPath, musicBuffer),
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
        await updateMediaJob(jobId, tenantId, { status: "running", progress: 68 });

        const brollResult = await applyBrandBroll({
          tenantId,
          sourcePath: outputPath,
          jobId,
          context: brollContext,
        });
        brollCleanup = brollResult.cleanup;
        await updateMediaJob(jobId, tenantId, {
          status: "running",
          progress: 82,
          brollApplied: brollResult.applied,
          brollAssetIds: brollResult.assetIds,
          brollInsertions: brollResult.insertions,
          ...(brollResult.warning ? { brollWarning: brollResult.warning } : {}),
        });

        const brandResult = await applyBrandIntroOutro({
          tenantId,
          sourcePath: brollResult.outputPath,
          jobId,
        });
        brandCleanup = brandResult.cleanup;
        await updateMediaJob(jobId, tenantId, { status: "running", progress: 92 });

        const output = await readFile(brandResult.outputPath);
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
            musicFilename,
            musicAssetId: selectedMusicAssetId,
            musicRights,
            musicUsage,
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
            brollContext,
            brollApplied: brollResult.applied,
            brollAssetIds: brollResult.assetIds,
            brollInsertions: brollResult.insertions,
            brollWarning: brollResult.warning,
            introAssetId: brandResult.introAssetId,
            outroAssetId: brandResult.outroAssetId,
            introApplied: brandResult.introApplied,
            outroApplied: brandResult.outroApplied,
            engine: "vendorai",
          },
        });
        await updateMediaJob(jobId, tenantId, {
          status: "done",
          progress: 100,
          videoUrl: storageUrl,
          assetId: registered.assetId,
          versionId: registered.versionId,
          brollApplied: brollResult.applied,
          brollAssetIds: brollResult.assetIds,
          brollInsertions: brollResult.insertions,
          ...(brollResult.warning ? { brollWarning: brollResult.warning } : {}),
          introAssetId: brandResult.introAssetId,
          outroAssetId: brandResult.outroAssetId,
          introApplied: brandResult.introApplied,
          outroApplied: brandResult.outroApplied,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha desconhecida na composição de vídeo";
        await setMediaProjectStatus(tenantId, projectId, "draft").catch(() => undefined);
        await updateMediaJob(jobId, tenantId, { status: "error", error: message }).catch(() => undefined);
      } finally {
        await brollCleanup?.().catch(() => undefined);
        await brandCleanup?.().catch(() => undefined);
        await Promise.all([
          unlink(videoPath).catch(() => undefined),
          unlink(musicPath).catch(() => undefined),
          unlink(outputPath).catch(() => undefined),
        ]);
      }
    })();
  },
);

router.use(mediaTracksRouter);

export default router;
