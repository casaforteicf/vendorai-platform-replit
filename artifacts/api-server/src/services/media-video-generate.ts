import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { toFile } from "openai";
import type { Logger } from "pino";
import {
  db,
  mediaAssetsTable,
  mediaVersionsTable,
  pool,
} from "@workspace/db";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import { applyBrandIntroOutro } from "./media-brand-video.js";
import {
  registerGeneratedMediaOutput,
  setMediaProjectStatus,
} from "./media-library.js";
import {
  applyTransitionSoundEffects,
  buildSceneFilter,
  concatScenesWithEffects,
  recommendedSceneCount,
  resolveVideoEffects,
  transitionDurationFor,
} from "./media-video-effects.js";

const execFileAsync = promisify(execFile);
const PRIVATE_DIR = process.env["PRIVATE_OBJECT_DIR"] ?? "";
const DEFAULT_POLL_MS = 5_000;
const LEASE_MINUTES = 30;
const FPS = 30;
const MAX_PROMPT_LENGTH = 4_000;
const MAX_STYLE_LENGTH = 300;
const MIN_SCENES = 3;
const MAX_SCENES = 6;
const MIN_DURATION = 8;
const MAX_DURATION = 30;

type VideoAspectRatio = "portrait" | "landscape";

type GenerateVideoInput = {
  userId?: string | null;
  title?: string;
  prompt?: string;
  style?: string;
  aspectRatio?: VideoAspectRatio;
  duration?: number;
  sceneCount?: number;
  effects?: unknown;
};

type ClaimedVideo = {
  id: string;
  tenantId: string;
  projectId: string | null;
  input: GenerateVideoInput;
};

type GeneratedScene = {
  buffer: Buffer;
  model: string;
  continuity: "generated" | "edited" | "regenerated";
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function aspectRatioValue(value: unknown): VideoAspectRatio {
  return String(value ?? "").toLowerCase() === "landscape" ? "landscape" : "portrait";
}

function imageSize(aspectRatio: VideoAspectRatio): "1024x1536" | "1536x1024" {
  return aspectRatio === "landscape" ? "1536x1024" : "1024x1536";
}

function outputDimensions(aspectRatio: VideoAspectRatio): { width: number; height: number } {
  return aspectRatio === "landscape"
    ? { width: 1280, height: 720 }
    : { width: 720, height: 1280 };
}

function isModelAvailabilityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("model") && (
    message.includes("not found")
    || message.includes("does not exist")
    || message.includes("unsupported")
    || message.includes("access")
  );
}

function scenePrompt(input: {
  prompt: string;
  style: string;
  sceneIndex: number;
  sceneCount: number;
  aspectRatio: VideoAspectRatio;
  continuity: boolean;
}): string {
  const shotTypes = [
    "establishing wide shot that clearly introduces the subject and environment",
    "medium shot with a visible action or meaningful change",
    "close-up detail shot that highlights texture, benefit, emotion, or product detail",
    "dynamic alternate angle with stronger depth and cinematic composition",
    "result or payoff shot that communicates the desired outcome",
    "final hero shot with a clean, premium closing composition",
  ];
  const shot = shotTypes[Math.min(input.sceneIndex, shotTypes.length - 1)]!;
  const orientation = input.aspectRatio === "landscape" ? "horizontal 16:9" : "vertical 9:16";
  return [
    input.continuity
      ? "Use the supplied previous frame only as a VISUAL CONTINUITY REFERENCE. Create the next distinct scene, not a duplicate. Preserve the main subject identity, recognizable product/character features, palette and art direction."
      : "Create the first frame of a coherent short-form video sequence.",
    `Core video concept: ${input.prompt}`,
    `Scene ${input.sceneIndex + 1} of ${input.sceneCount}: ${shot}.`,
    `Art direction: ${input.style}.`,
    `Composition: ${orientation}, cinematic depth, realistic lighting, strong focal point, safe margins for social video cropping.`,
    "Do not add captions, typography, logos, UI, watermarks or borders inside the generated image.",
    "This frame will be animated and connected to the following frames, so preserve visual continuity while advancing the story.",
  ].join(" ");
}

function extractImageBuffer(result: { data?: Array<{ b64_json?: string | null }> | null }): Buffer {
  const b64 = result.data?.[0]?.b64_json ?? undefined;
  if (!b64) throw new Error("O gerador de imagens não retornou b64_json");
  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length) throw new Error("A cena gerada ficou vazia");
  return buffer;
}

async function generateFirstScene(input: {
  tenantId: string;
  prompt: string;
  size: "1024x1536" | "1536x1024";
}): Promise<GeneratedScene> {
  const openai = await getOpenAIForTenant(input.tenantId);
  const preferredModel = process.env["VENDORAI_IMAGE_MODEL"]?.trim() || "gpt-image-2";
  try {
    const result = await openai.images.generate({
      model: preferredModel,
      prompt: input.prompt,
      n: 1,
      size: input.size,
      quality: "medium",
    });
    return { buffer: extractImageBuffer(result), model: preferredModel, continuity: "generated" };
  } catch (error) {
    if (preferredModel === "gpt-image-1" || !isModelAvailabilityError(error)) throw error;
    const fallbackModel = "gpt-image-1";
    const result = await openai.images.generate({
      model: fallbackModel,
      prompt: input.prompt,
      n: 1,
      size: input.size,
      quality: "medium",
    });
    return { buffer: extractImageBuffer(result), model: fallbackModel, continuity: "generated" };
  }
}

async function generateNextScene(input: {
  tenantId: string;
  previous: Buffer;
  prompt: string;
  size: "1024x1536" | "1536x1024";
  model: string;
}): Promise<GeneratedScene> {
  const openai = await getOpenAIForTenant(input.tenantId);
  try {
    const previousFile = await toFile(input.previous, "previous-scene.png", { type: "image/png" });
    const result = await openai.images.edit({
      model: input.model,
      image: previousFile,
      prompt: input.prompt,
      n: 1,
      size: input.size,
      quality: "medium",
    });
    return { buffer: extractImageBuffer(result), model: input.model, continuity: "edited" };
  } catch {
    const result = await openai.images.generate({
      model: input.model,
      prompt: input.prompt,
      n: 1,
      size: input.size,
      quality: "medium",
    });
    return { buffer: extractImageBuffer(result), model: input.model, continuity: "regenerated" };
  }
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
  await objectStorageClient.bucket(bucketName).file(parts.join("/")).save(buffer, {
    contentType,
    resumable: false,
  });
  return `/objects/${folder}/${fileName}`;
}

async function registerScene(input: {
  tenantId: string;
  projectId: string;
  userId?: string | null;
  storageUrl: string;
  buffer: Buffer;
  index: number;
  prompt: string;
  model: string;
  continuity: GeneratedScene["continuity"];
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
      mimeType: "image/png",
      fileSize: input.buffer.length,
      originalFilename: `video-generate-scene-${input.index + 1}.png`,
      source: "generated",
      metadata: {
        operation: "video_generate",
        sceneIndex: input.index,
        prompt: input.prompt,
        model: input.model,
        continuity: input.continuity,
      },
    })
    .returning({ id: mediaAssetsTable.id });
  if (!asset) throw new Error("Falha ao registrar cena gerada na Biblioteca");

  await db.insert(mediaVersionsTable).values({
    tenantId: input.tenantId,
    projectId: input.projectId,
    assetId: asset.id,
    operation: "video_generate_scene",
    label: `Cena ${input.index + 1}`,
    metadata: {
      sceneIndex: input.index,
      prompt: input.prompt,
      model: input.model,
      continuity: input.continuity,
    },
  });
  return asset.id;
}

async function renderScene(input: {
  imagePath: string;
  outputPath: string;
  sceneIndex: number;
  duration: number;
  width: number;
  height: number;
  effects: ReturnType<typeof resolveVideoEffects>;
}): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-loop", "1",
    "-i", input.imagePath,
    "-f", "lavfi",
    "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-t", input.duration.toFixed(3),
    "-vf", buildSceneFilter({
      sceneIndex: input.sceneIndex,
      duration: input.duration,
      width: input.width,
      height: input.height,
      effects: input.effects,
    }),
    "-r", String(FPS),
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-ar", "48000",
    "-ac", "2",
    "-b:a", "128k",
    "-shortest",
    "-movflags", "+faststart",
    input.outputPath,
  ], { maxBuffer: 8 * 1024 * 1024 });
}

async function claimNextVideo(runnerToken: string): Promise<ClaimedVideo | null> {
  const result = await pool.query(
    `WITH candidate AS (
       SELECT id
       FROM media_jobs
       WHERE operation = 'video_generate'
         AND status = 'running'
         AND (
           output->>'runnerToken' = $1
           OR output->>'runnerToken' IS NULL
           OR output->>'leaseUntil' IS NULL
           OR NULLIF(output->>'leaseUntil', '')::timestamptz < NOW()
         )
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE media_jobs j
        SET output = COALESCE(j.output, '{}'::jsonb) || jsonb_build_object(
              'runnerToken', $1::text,
              'leaseUntil', (NOW() + ($2::text || ' minutes')::interval)::text
            ),
            updated_at = NOW()
       FROM candidate
      WHERE j.id = candidate.id
      RETURNING j.id, j.tenant_id, j.project_id, j.input`,
    [runnerToken, LEASE_MINUTES],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row["id"]),
    tenantId: String(row["tenant_id"]),
    projectId: row["project_id"] ? String(row["project_id"]) : null,
    input: asRecord(row["input"]) as GenerateVideoInput,
  };
}

async function persistRunning(input: {
  video: ClaimedVideo;
  runnerToken: string;
  progress: number;
  output?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `UPDATE media_jobs
        SET status = 'running', progress = $3, total = 100,
            output = COALESCE($4::jsonb, '{}'::jsonb) || jsonb_build_object(
              'runnerToken', $2::text,
              'leaseUntil', (NOW() + ($5::text || ' minutes')::interval)::text
            ),
            error = NULL, completed_at = NULL, updated_at = NOW()
      WHERE id = $1 AND output->>'runnerToken' = $2`,
    [
      input.video.id,
      input.runnerToken,
      Math.max(0, Math.min(99, Math.round(input.progress))),
      JSON.stringify(input.output ?? {}),
      LEASE_MINUTES,
    ],
  );
}

async function persistFinished(input: {
  video: ClaimedVideo;
  runnerToken: string;
  status: "done" | "error";
  output?: Record<string, unknown>;
  error?: string | null;
}): Promise<void> {
  await pool.query(
    `UPDATE media_jobs
        SET status = $3,
            progress = CASE WHEN $3 = 'done' THEN 100 ELSE progress END,
            total = 100,
            output = $4::jsonb,
            error = $5,
            completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND output->>'runnerToken' = $2`,
    [
      input.video.id,
      input.runnerToken,
      input.status,
      JSON.stringify(input.output ?? {}),
      input.error ?? null,
    ],
  );
}

async function processClaimedVideo(video: ClaimedVideo, runnerToken: string, logger: Logger): Promise<void> {
  const prompt = stringValue(video.input.prompt);
  const title = stringValue(video.input.title) ?? "Vídeo gerado com IA";
  const style = (stringValue(video.input.style) ?? "cinematic, premium, photorealistic, polished commercial production").slice(0, MAX_STYLE_LENGTH);
  const aspectRatio = aspectRatioValue(video.input.aspectRatio);
  const duration = numberValue(video.input.duration, 16, MIN_DURATION, MAX_DURATION);
  const effects = resolveVideoEffects(video.input.effects);
  const requestedSceneCount = Number.isFinite(Number(video.input.sceneCount)) ? Number(video.input.sceneCount) : null;
  const sceneCount = recommendedSceneCount(duration, requestedSceneCount, effects, MIN_SCENES, MAX_SCENES);
  const transitionDuration = transitionDurationFor(duration, sceneCount, effects);
  const sceneDuration = (duration + transitionDuration * Math.max(0, sceneCount - 1)) / sceneCount;
  const userId = video.input.userId ?? null;

  if (!video.projectId || !prompt || prompt.length > MAX_PROMPT_LENGTH) {
    const error = `Vídeo inválido: informe prompt de 1 a ${MAX_PROMPT_LENGTH} caracteres`;
    await persistFinished({ video, runnerToken, status: "error", error });
    if (video.projectId) await setMediaProjectStatus(video.tenantId, video.projectId, "draft");
    return;
  }

  const { width, height } = outputDimensions(aspectRatio);
  const size = imageSize(aspectRatio);
  const tempPaths: string[] = [];
  let brandCleanup: (() => Promise<void>) | null = null;

  try {
    await persistRunning({
      video,
      runnerToken,
      progress: 2,
      output: { prompt, style, aspectRatio, duration, sceneCount, effects, transitionDuration },
    });

    const sceneAssetIds: string[] = [];
    const scenePrompts: string[] = [];
    const continuityModes: GeneratedScene["continuity"][] = [];
    const sceneVideoPaths: string[] = [];
    let previous: Buffer | null = null;
    let imageModel = process.env["VENDORAI_IMAGE_MODEL"]?.trim() || "gpt-image-2";

    for (let index = 0; index < sceneCount; index += 1) {
      const promptForScene = scenePrompt({
        prompt,
        style,
        sceneIndex: index,
        sceneCount,
        aspectRatio,
        continuity: index > 0,
      });
      const generated = previous
        ? await generateNextScene({
            tenantId: video.tenantId,
            previous,
            prompt: promptForScene,
            size,
            model: imageModel,
          })
        : await generateFirstScene({
            tenantId: video.tenantId,
            prompt: promptForScene,
            size,
          });
      imageModel = generated.model;
      previous = generated.buffer;
      scenePrompts.push(promptForScene);
      continuityModes.push(generated.continuity);

      const sceneStorageUrl = await saveObject(generated.buffer, "image/png", "video-generate/scenes", "png");
      const sceneAssetId = await registerScene({
        tenantId: video.tenantId,
        projectId: video.projectId,
        userId,
        storageUrl: sceneStorageUrl,
        buffer: generated.buffer,
        index,
        prompt: promptForScene,
        model: imageModel,
        continuity: generated.continuity,
      });
      sceneAssetIds.push(sceneAssetId);

      const sceneImagePath = join(tmpdir(), `video-generate-${video.id}-scene-${index}.png`);
      const sceneVideoPath = join(tmpdir(), `video-generate-${video.id}-scene-${index}.mp4`);
      tempPaths.push(sceneImagePath, sceneVideoPath);
      await writeFile(sceneImagePath, generated.buffer);
      await renderScene({
        imagePath: sceneImagePath,
        outputPath: sceneVideoPath,
        sceneIndex: index,
        duration: sceneDuration,
        width,
        height,
        effects,
      });
      sceneVideoPaths.push(sceneVideoPath);

      await persistRunning({
        video,
        runnerToken,
        progress: 8 + ((index + 1) / sceneCount) * 72,
        output: {
          prompt,
          style,
          aspectRatio,
          duration,
          sceneCount,
          imageModel,
          sceneAssetIds,
          continuityModes,
          effects,
          transitionDuration,
        },
      });
    }

    const listPath = join(tmpdir(), `video-generate-${video.id}-concat.txt`);
    const basePath = join(tmpdir(), `video-generate-${video.id}-base.mp4`);
    tempPaths.push(listPath, basePath);
    await concatScenesWithEffects({
      scenePaths: sceneVideoPaths,
      listPath,
      outputPath: basePath,
      sceneDuration,
      transitionDuration,
      effects,
    });

    let composedPath = basePath;
    const transitionTimes = Array.from({ length: Math.max(0, sceneCount - 1) }, (_, index) => (index + 1) * (sceneDuration - transitionDuration));
    if (effects.sfx !== "none" && transitionTimes.length) {
      const sfxPath = join(tmpdir(), `video-generate-${video.id}-sfx.mp4`);
      tempPaths.push(sfxPath);
      await applyTransitionSoundEffects({ sourcePath: basePath, outputPath: sfxPath, transitionTimes, effects });
      composedPath = sfxPath;
    }

    await persistRunning({
      video,
      runnerToken,
      progress: 85,
      output: {
        prompt,
        style,
        aspectRatio,
        duration,
        sceneCount,
        imageModel,
        sceneAssetIds,
        continuityModes,
        effects,
        transitionDuration,
      },
    });

    const branded = await applyBrandIntroOutro({
      tenantId: video.tenantId,
      sourcePath: composedPath,
      jobId: video.id,
    });
    brandCleanup = branded.cleanup;
    const finalBuffer = await readFile(branded.outputPath);
    if (!finalBuffer.length) throw new Error("O vídeo gerado ficou vazio");

    const storageUrl = await saveObject(finalBuffer, "video/mp4", "video-generate/outputs", "mp4");
    const output = await registerGeneratedMediaOutput({
      tenantId: video.tenantId,
      projectId: video.projectId,
      userId,
      storageUrl,
      mimeType: "video/mp4",
      originalFilename: `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || video.id}.mp4`,
      operation: "video_generate",
      label: "Vídeo gerado com IA",
      metadata: {
        jobId: video.id,
        prompt,
        style,
        aspectRatio,
        duration,
        sceneCount,
        imageModel,
        sceneAssetIds,
        scenePrompts,
        continuityModes,
        effects,
        transitionDuration,
        transitionTimes,
        logoAssetId: branded.logoAssetId,
        introAssetId: branded.introAssetId,
        outroAssetId: branded.outroAssetId,
        logoApplied: branded.logoApplied,
        introApplied: branded.introApplied,
        outroApplied: branded.outroApplied,
        logoWarning: branded.logoWarning,
        engine: "vendorai",
        generationMode: "ai-scenes-ffmpeg-effects-v2",
      },
    });

    await persistFinished({
      video,
      runnerToken,
      status: "done",
      output: {
        videoUrl: `/api/storage${storageUrl}`,
        videoAssetId: output.assetId,
        prompt,
        style,
        aspectRatio,
        duration,
        sceneCount,
        imageModel,
        sceneAssetIds,
        continuityModes,
        effects,
        transitionDuration,
        logoAssetId: branded.logoAssetId,
        introAssetId: branded.introAssetId,
        outroAssetId: branded.outroAssetId,
        logoApplied: branded.logoApplied,
        introApplied: branded.introApplied,
        outroApplied: branded.outroApplied,
        logoWarning: branded.logoWarning,
        engine: "vendorai",
        generationMode: "ai-scenes-ffmpeg-effects-v2",
      },
    });
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Falha ao gerar vídeo").slice(0, 1_000);
    logger.error({ err: error, jobId: video.id, tenantId: video.tenantId }, "media-video-generate: geração falhou");
    await setMediaProjectStatus(video.tenantId, video.projectId, "draft").catch(() => undefined);
    await persistFinished({ video, runnerToken, status: "error", error: message }).catch(() => undefined);
  } finally {
    if (brandCleanup) await brandCleanup().catch(() => undefined);
    await Promise.all(tempPaths.map((path) => unlink(path).catch(() => undefined)));
  }
}

export function startMediaVideoGenerateRunner(
  logger: Logger,
  pollMs = DEFAULT_POLL_MS,
): { stop: () => void } {
  const runnerToken = randomUUID();
  let stopped = false;
  let busy = false;

  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const video = await claimNextVideo(runnerToken);
      if (video) await processClaimedVideo(video, runnerToken, logger);
    } catch (error) {
      logger.error({ err: error }, "media-video-generate: runner falhou");
    } finally {
      busy = false;
    }
  };

  void tick();
  const timer = setInterval(() => { void tick(); }, Math.max(1_000, pollMs));
  timer.unref?.();
  logger.info("media-video-generate: runner iniciado");
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
