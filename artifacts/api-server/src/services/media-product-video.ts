import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  mediaAssetsTable,
  mediaVersionsTable,
} from "@workspace/db";
import { objectStorageClient } from "../lib/objectStorage.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { applyBrandIntroOutro } from "./media-brand-video.js";
import { createMediaJob, updateMediaJob } from "./media-jobs.js";
import {
  createProcessingMediaProject,
  registerGeneratedMediaOutput,
  setMediaProjectStatus,
} from "./media-library.js";

const execFileAsync = promisify(execFile);
const objectStorage = new ObjectStorageService();
const PRIVATE_DIR = process.env["PRIVATE_OBJECT_DIR"] ?? "";
const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;
const MAX_IMAGES = 8;

export type ProductVideoImage = {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  size: number;
  sourceAssetId?: string | null;
};

export type ProductVideoFormat = "reel" | "story";

export type StartProductVideoInput = {
  tenantId: string;
  userId?: string | null;
  images: ProductVideoImage[];
  name: string;
  description?: string;
  price?: string;
  benefits?: string;
  cta?: string;
  format: ProductVideoFormat;
  storyboard?: string;
};

export async function resolveProductVideoLibraryImages(
  tenantId: string,
  assetIds: string[],
): Promise<ProductVideoImage[]> {
  if (!assetIds.length) return [];

  const uniqueIds = [...new Set(assetIds)];
  if (uniqueIds.length > MAX_IMAGES) throw new Error(`Selecione no máximo ${MAX_IMAGES} fotos`);

  const rows = await db
    .select({
      id: mediaAssetsTable.id,
      storageUrl: mediaAssetsTable.storageUrl,
      mimeType: mediaAssetsTable.mimeType,
      fileSize: mediaAssetsTable.fileSize,
      originalFilename: mediaAssetsTable.originalFilename,
    })
    .from(mediaAssetsTable)
    .where(
      and(
        eq(mediaAssetsTable.tenantId, tenantId),
        eq(mediaAssetsTable.type, "image"),
        inArray(mediaAssetsTable.id, uniqueIds),
      ),
    );

  const byId = new Map(rows.map((row) => [row.id, row]));
  const resolved: ProductVideoImage[] = [];
  const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

  for (const assetId of uniqueIds) {
    const row = byId.get(assetId);
    if (!row) throw new Error("Uma das fotos selecionadas não está disponível na Biblioteca deste tenant");

    const mimeType = String(row.mimeType ?? "").toLowerCase();
    if (!allowedMimeTypes.has(mimeType)) {
      throw new Error("Para gerar o vídeo, use somente fotos JPG, PNG ou WebP");
    }

    const file = await objectStorage.getObjectEntityFile(String(row.storageUrl));
    const [buffer] = await file.download();
    if (!buffer.length) throw new Error("Uma das fotos da Biblioteca está vazia");
    if (buffer.length > 20 * 1024 * 1024) throw new Error("Cada foto deve ter no máximo 20 MB");

    resolved.push({
      buffer,
      mimeType,
      originalName: row.originalFilename ?? `biblioteca-${assetId}.${extensionForMime(mimeType)}`,
      size: Number(row.fileSize ?? buffer.length),
      sourceAssetId: assetId,
    });
  }

  return resolved;
}

function extensionForMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  return "jpg";
}

async function saveObject(
  buffer: Buffer,
  contentType: string,
  folder: string,
  extension: string,
): Promise<string> {
  if (!PRIVATE_DIR) throw new Error("PRIVATE_OBJECT_DIR não configurado");
  const fileName = `${randomUUID()}.${extension}`;
  const fullPath = `${PRIVATE_DIR}/${folder}/${fileName}`;
  const parts = fullPath.split("/").filter(Boolean);
  const bucketName = parts.shift();
  if (!bucketName || !parts.length) throw new Error("PRIVATE_OBJECT_DIR inválido");
  const file = objectStorageClient.bucket(bucketName).file(parts.join("/"));
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${folder}/${fileName}`;
}

async function registerSourceImage(input: {
  tenantId: string;
  projectId: string;
  userId?: string | null;
  storageUrl: string;
  image: ProductVideoImage;
  index: number;
}): Promise<string> {
  const [asset] = await db
    .insert(mediaAssetsTable)
    .values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      userId: input.userId ?? null,
      type: "image",
      role: "source",
      storageUrl: input.storageUrl,
      mimeType: input.image.mimeType,
      fileSize: input.image.size,
      originalFilename: input.image.originalName,
      source: "upload",
      metadata: {
        operation: "product_video",
        imageIndex: input.index,
      },
    })
    .returning({ id: mediaAssetsTable.id });
  if (!asset) throw new Error("Falha ao registrar foto de origem na Biblioteca");

  await db.insert(mediaVersionsTable).values({
    tenantId: input.tenantId,
    projectId: input.projectId,
    assetId: asset.id,
    operation: "original",
    label: `Foto ${input.index + 1}`,
    metadata: { imageIndex: input.index },
  });
  return asset.id;
}

function scenePlan(format: ProductVideoFormat, imageCount: number): {
  sceneCount: number;
  sceneDuration: number;
  totalDuration: number;
} {
  if (format === "story") {
    return { sceneCount: 5, sceneDuration: 3, totalDuration: 15 };
  }
  const sceneCount = Math.max(3, Math.min(MAX_IMAGES, imageCount));
  const totalDuration = Math.max(15, Math.min(30, sceneCount * 4));
  return { sceneCount, sceneDuration: totalDuration / sceneCount, totalDuration };
}

function motionFilter(sceneIndex: number, duration: number): string {
  const frames = Math.max(1, Math.round(duration * FPS));
  const fadeOutStart = Math.max(0, duration - 0.3).toFixed(3);
  const movement = sceneIndex % 4;
  const x = movement === 1
    ? "0"
    : movement === 3
      ? "iw-iw/zoom"
      : "iw/2-(iw/zoom/2)";
  const y = movement === 0
    ? "0"
    : movement === 2
      ? "ih-ih/zoom"
      : "ih/2-(ih/zoom/2)";

  return [
    `scale=900:1600:force_original_aspect_ratio=increase`,
    `crop=900:1600`,
    `zoompan=z='min(zoom+0.0008,1.10)':x='${x}':y='${y}':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
    "format=yuv420p",
    "fade=t=in:st=0:d=0.25",
    `fade=t=out:st=${fadeOutStart}:d=0.30`,
  ].join(",");
}

async function renderScene(inputPath: string, outputPath: string, sceneIndex: number, duration: number): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-loop", "1",
    "-i", inputPath,
    "-t", duration.toFixed(3),
    "-vf", motionFilter(sceneIndex, duration),
    "-an",
    "-r", String(FPS),
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputPath,
  ], { maxBuffer: 8 * 1024 * 1024 });
}

async function concatScenes(scenePaths: string[], listPath: string, outputPath: string): Promise<void> {
  const content = scenePaths
    .map((path) => `file '${path.replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(listPath, content, "utf8");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    "-movflags", "+faststart",
    outputPath,
  ], { maxBuffer: 8 * 1024 * 1024 });
}

export async function startProductPhotoVideo(input: StartProductVideoInput): Promise<{
  projectId: string;
  jobId: string;
}> {
  if (!input.name.trim()) throw new Error("Nome do produto é obrigatório");
  if (input.images.length < 1 || input.images.length > MAX_IMAGES) {
    throw new Error(`Envie entre 1 e ${MAX_IMAGES} fotos do produto`);
  }
  const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (input.images.some((image) => !allowedMimeTypes.has(image.mimeType.toLowerCase()))) {
    throw new Error("Use somente fotos JPG, PNG ou WebP");
  }

  const { sceneCount, sceneDuration, totalDuration } = scenePlan(input.format, input.images.length);
  const reusedSourceAssetIds = input.images.flatMap((image) => image.sourceAssetId ? [image.sourceAssetId] : []);
  const projectId = await createProcessingMediaProject({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: `Vídeo de produto — ${input.name.trim()}`,
    kind: input.format === "story" ? "story" : "reel",
    operation: "product_video",
    context: {
      productName: input.name.trim(),
      description: input.description?.trim() || null,
      price: input.price?.trim() || null,
      benefits: input.benefits?.trim() || null,
      cta: input.cta?.trim() || "Compre agora",
      format: input.format,
      imageCount: input.images.length,
      reusedSourceAssetIds,
      sceneCount,
      estimatedDuration: totalDuration,
      storyboard: input.storyboard ?? null,
    },
  });
  const jobId = randomUUID();
  await createMediaJob({
    id: jobId,
    tenantId: input.tenantId,
    projectId,
    operation: "product_video",
    provider: "vendorai",
    input: {
      productName: input.name.trim(),
      format: input.format,
      imageCount: input.images.length,
      reusedSourceAssetIds,
      sceneCount,
      storyboard: input.storyboard ?? null,
    },
    snapshot: {
      status: "running",
      progress: 0,
      total: sceneCount + 2,
      storyboard: input.storyboard ?? null,
    },
  });

  const images = input.images.map((image) => ({ ...image, buffer: Buffer.from(image.buffer) }));
  void (async () => {
    const tempPaths: string[] = [];
    let brandCleanup: (() => Promise<void>) | null = null;
    try {
      const inputPaths: string[] = [];
      const sourceAssetIds: string[] = [];

      for (let index = 0; index < images.length; index += 1) {
        const image = images[index]!;
        const ext = extensionForMime(image.mimeType);
        const sourcePath = join(tmpdir(), `product-video-source-${jobId}-${index}.${ext}`);
        tempPaths.push(sourcePath);
        await writeFile(sourcePath, image.buffer);
        inputPaths.push(sourcePath);

        if (image.sourceAssetId) {
          sourceAssetIds.push(image.sourceAssetId);
          continue;
        }

        const storageUrl = await saveObject(image.buffer, image.mimeType, "product-video/sources", ext);
        const assetId = await registerSourceImage({
          tenantId: input.tenantId,
          projectId,
          userId: input.userId ?? null,
          storageUrl,
          image,
          index,
        });
        sourceAssetIds.push(assetId);
      }

      await updateMediaJob(jobId, input.tenantId, {
        status: "running",
        progress: 1,
        total: sceneCount + 2,
        sourceAssetIds,
      });

      const scenePaths: string[] = [];
      for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
        const sourcePath = inputPaths[sceneIndex % inputPaths.length]!;
        const scenePath = join(tmpdir(), `product-video-scene-${jobId}-${sceneIndex}.mp4`);
        tempPaths.push(scenePath);
        await renderScene(sourcePath, scenePath, sceneIndex, sceneDuration);
        scenePaths.push(scenePath);
        await updateMediaJob(jobId, input.tenantId, {
          status: "running",
          progress: Math.min(sceneCount + 1, sceneIndex + 2),
          total: sceneCount + 2,
          sourceAssetIds,
        });
      }

      const listPath = join(tmpdir(), `product-video-list-${jobId}.txt`);
      const baseVideoPath = join(tmpdir(), `product-video-base-${jobId}.mp4`);
      tempPaths.push(listPath, baseVideoPath);
      await concatScenes(scenePaths, listPath, baseVideoPath);

      const branded = await applyBrandIntroOutro({
        tenantId: input.tenantId,
        sourcePath: baseVideoPath,
        jobId,
      });
      brandCleanup = branded.cleanup;
      const finalBuffer = await readFile(branded.outputPath);
      if (!finalBuffer.length) throw new Error("Render do vídeo de produto ficou vazio");

      const storageUrl = await saveObject(finalBuffer, "video/mp4", "product-video/outputs", "mp4");
      const output = await registerGeneratedMediaOutput({
        tenantId: input.tenantId,
        projectId,
        userId: input.userId ?? null,
        storageUrl,
        mimeType: "video/mp4",
        originalFilename: `produto-${input.name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || jobId}.mp4`,
        operation: "product_video",
        label: input.format === "story" ? "Story de produto" : "Reel de produto",
        metadata: {
          jobId,
          productName: input.name.trim(),
          format: input.format,
          sourceAssetIds,
          sceneCount,
          duration: totalDuration,
          storyboard: input.storyboard ?? null,
          logoAssetId: branded.logoAssetId,
          introAssetId: branded.introAssetId,
          outroAssetId: branded.outroAssetId,
          logoApplied: branded.logoApplied,
          introApplied: branded.introApplied,
          outroApplied: branded.outroApplied,
          logoWarning: branded.logoWarning,
        },
      });

      await updateMediaJob(jobId, input.tenantId, {
        status: "done",
        progress: sceneCount + 2,
        total: sceneCount + 2,
        videoUrl: storageUrl,
        videoAssetId: output.assetId,
        sourceAssetIds,
        storyboard: input.storyboard ?? null,
        logoAssetId: branded.logoAssetId,
        introAssetId: branded.introAssetId,
        outroAssetId: branded.outroAssetId,
        logoApplied: branded.logoApplied,
        introApplied: branded.introApplied,
        outroApplied: branded.outroApplied,
        logoWarning: branded.logoWarning,
      });
    } catch (error) {
      await setMediaProjectStatus(input.tenantId, projectId, "draft").catch(() => undefined);
      await updateMediaJob(jobId, input.tenantId, {
        status: "error",
        error: error instanceof Error ? error.message : "Falha ao gerar vídeo de produto",
      }).catch(() => undefined);
    } finally {
      if (brandCleanup) await brandCleanup().catch(() => undefined);
      await Promise.all(tempPaths.map((path) => unlink(path).catch(() => undefined)));
    }
  })();

  return { projectId, jobId };
}
