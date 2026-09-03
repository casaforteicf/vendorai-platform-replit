import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { createMediaJob, updateMediaJob } from "./media-jobs.js";
import {
  createProcessingMediaProject,
  registerGeneratedMediaOutput,
  setMediaProjectStatus,
} from "./media-library.js";
import { applyBrandIntroOutro } from "./media-brand-video.js";

const execFileAsync = promisify(execFile);
const objectStorage = new ObjectStorageService();

export class PhotoVideoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoVideoValidationError";
  }
}

type PhotoVideoFormat = "9:16" | "1:1" | "16:9";

function dimensionsFor(format: PhotoVideoFormat): { width: number; height: number } {
  if (format === "9:16") return { width: 1080, height: 1920 };
  if (format === "1:1") return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

function extensionFromMime(mimeType: string | null | undefined): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

async function resolveImageAsset(tenantId: string, assetId: string) {
  const result = await pool.query(
    `SELECT id, storage_url, mime_type, original_filename
       FROM media_assets
      WHERE tenant_id = $1 AND id = $2 AND type = 'image'
      LIMIT 1`,
    [tenantId, assetId],
  );
  if (!result.rowCount) {
    throw new PhotoVideoValidationError(`Imagem ${assetId} não encontrada neste tenant`);
  }
  const row = result.rows[0];
  const storageUrl = String(row.storage_url ?? "");
  if (!storageUrl.startsWith("/objects/")) {
    throw new PhotoVideoValidationError(`Imagem ${assetId} não está disponível no Object Storage`);
  }
  return row;
}

export async function startVendorAiPhotoVideo(input: {
  tenantId: string;
  userId?: string | null;
  title: string;
  assetIds: string[];
  secondsPerImage?: number;
  format?: PhotoVideoFormat;
}) {
  const assetIds = [...new Set(input.assetIds.map((id) => id.trim()).filter(Boolean))];
  if (assetIds.length < 2 || assetIds.length > 30) {
    throw new PhotoVideoValidationError("Selecione de 2 a 30 imagens para montar o vídeo");
  }

  const secondsPerImage = Math.max(1, Math.min(12, Number(input.secondsPerImage ?? 3)));
  const format: PhotoVideoFormat = input.format === "9:16" || input.format === "1:1" ? input.format : "16:9";
  const { width, height } = dimensionsFor(format);

  // Resolve antes de criar o job para falhar cedo em caso de asset inválido.
  const assets = [];
  for (const assetId of assetIds) {
    assets.push(await resolveImageAsset(input.tenantId, assetId));
  }

  const projectId = await createProcessingMediaProject({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title,
    operation: "photo_video",
    context: {
      engine: "vendorai",
      sourceAssetIds: assetIds,
      secondsPerImage,
      format,
      width,
      height,
      native: true,
    },
  });
  const jobId = randomUUID();
  await createMediaJob({
    id: jobId,
    tenantId: input.tenantId,
    projectId,
    operation: "photo_video",
    provider: "vendorai",
    input: {
      title: input.title,
      sourceAssetIds: assetIds,
      secondsPerImage,
      format,
      width,
      height,
      userId: input.userId ?? null,
    },
    snapshot: { status: "running", progress: 0 },
  });

  void (async () => {
    const imagePaths: string[] = [];
    const segmentPaths: string[] = [];
    const concatPath = join(tmpdir(), `photo-video-${jobId}.txt`);
    const baseOutputPath = join(tmpdir(), `photo-video-${jobId}.mp4`);
    let brandCleanup: (() => Promise<void>) | null = null;

    try {
      for (let index = 0; index < assets.length; index += 1) {
        const asset = assets[index];
        const file = await objectStorage.getObjectEntityFile(String(asset.storage_url));
        const [buffer] = await file.download();
        if (!buffer.length) throw new Error(`Imagem ${asset.id} está vazia`);

        const imagePath = join(tmpdir(), `photo-video-${jobId}-${index}.${extensionFromMime(asset.mime_type)}`);
        const segmentPath = join(tmpdir(), `photo-video-${jobId}-${index}.mp4`);
        imagePaths.push(imagePath);
        segmentPaths.push(segmentPath);
        await writeFile(imagePath, buffer);

        const vf = [
          `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
          "setsar=1",
          "format=yuv420p",
        ].join(",");

        await execFileAsync("ffmpeg", [
          "-y",
          "-loop", "1",
          "-i", imagePath,
          "-t", secondsPerImage.toFixed(3),
          "-vf", vf,
          "-r", "30",
          "-an",
          "-c:v", "libx264",
          "-preset", "medium",
          "-crf", "20",
          "-pix_fmt", "yuv420p",
          segmentPath,
        ], { maxBuffer: 8 * 1024 * 1024 });

        const progress = 10 + Math.round(((index + 1) / assets.length) * 55);
        await updateMediaJob(jobId, input.tenantId, { status: "running", progress });
      }

      const concatContents = segmentPaths
        .map((path) => `file '${path.replace(/'/g, "'\\''")}'`)
        .join("\n");
      await writeFile(concatPath, concatContents, "utf8");

      await execFileAsync("ffmpeg", [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concatPath,
        "-c", "copy",
        "-movflags", "+faststart",
        baseOutputPath,
      ], { maxBuffer: 8 * 1024 * 1024 });
      await updateMediaJob(jobId, input.tenantId, { status: "running", progress: 75 });

      const brandResult = await applyBrandIntroOutro({
        tenantId: input.tenantId,
        sourcePath: baseOutputPath,
        jobId,
      });
      brandCleanup = brandResult.cleanup;
      await updateMediaJob(jobId, input.tenantId, {
        status: "running",
        progress: 90,
        logoAssetId: brandResult.logoAssetId,
        logoApplied: brandResult.logoApplied,
        introAssetId: brandResult.introAssetId,
        outroAssetId: brandResult.outroAssetId,
        introApplied: brandResult.introApplied,
        outroApplied: brandResult.outroApplied,
        ...(brandResult.logoWarning ? { logoWarning: brandResult.logoWarning } : {}),
      });

      const output = await readFile(brandResult.outputPath);
      if (!output.length) throw new Error("FFmpeg retornou vídeo vazio");
      const storageUrl = await objectStorage.savePrivateBuffer(output, "video/mp4", `photo-video-${jobId}.mp4`);
      const registered = await registerGeneratedMediaOutput({
        tenantId: input.tenantId,
        projectId,
        userId: input.userId ?? null,
        storageUrl,
        mimeType: "video/mp4",
        type: "video",
        originalFilename: `${input.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "video-fotos"}.mp4`,
        operation: "photo_video",
        label: input.title,
        metadata: {
          jobId,
          sourceAssetIds: assetIds,
          secondsPerImage,
          format,
          width,
          height,
          durationEstimate: secondsPerImage * assetIds.length,
          logoAssetId: brandResult.logoAssetId,
          logoApplied: brandResult.logoApplied,
          logoWarning: brandResult.logoWarning,
          introAssetId: brandResult.introAssetId,
          outroAssetId: brandResult.outroAssetId,
          introApplied: brandResult.introApplied,
          outroApplied: brandResult.outroApplied,
          engine: "vendorai",
          native: true,
        },
      });
      await updateMediaJob(jobId, input.tenantId, {
        status: "done",
        progress: 100,
        videoUrl: storageUrl,
        assetId: registered.assetId,
        versionId: registered.versionId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao montar vídeo a partir das fotos";
      await setMediaProjectStatus(input.tenantId, projectId, "draft").catch(() => undefined);
      await updateMediaJob(jobId, input.tenantId, { status: "error", error: message }).catch(() => undefined);
    } finally {
      await brandCleanup?.().catch(() => undefined);
      await Promise.all([
        ...imagePaths.map((path) => unlink(path).catch(() => undefined)),
        ...segmentPaths.map((path) => unlink(path).catch(() => undefined)),
        unlink(concatPath).catch(() => undefined),
        unlink(baseOutputPath).catch(() => undefined),
      ]);
    }
  })();

  return { projectId, jobId, operation: "photo_video" as const, provider: "vendorai" as const };
}
