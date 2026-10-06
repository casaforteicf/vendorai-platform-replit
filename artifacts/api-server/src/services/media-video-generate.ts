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
import { generateVeoVideo } from "./media-provider-execution.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import { applyBrandIntroOutro } from "./media-brand-video.js";
import { resolveVideoContextPack } from "./video-context-pack.js";
import {
  registerGeneratedMediaOutput,
  setMediaProjectStatus,
} from "./media-library.js";
import {
  extensionForMediaInput,
  referenceImageInput,
  resolveVideoGenerationMediaInputs,
  videoGenerationBriefing,
  videoGenerationMode,
  visualGenerationInputs,
  type ResolvedVideoGenerationMediaInput,
  type VideoGenerationMode,
  type VideoGenerationMediaInputSpec,
} from "./media-video-inputs.js";
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
const STALE_RUNNING_MINUTES = 5;
const IMAGE_GENERATION_TIMEOUT_MS = 180_000;
const FPS = 30;
const MAX_PROMPT_LENGTH = 4_000;
const MAX_STYLE_LENGTH = 300;
const MIN_SCENES = 3;
const MAX_AI_SCENES = 6;
const MAX_MEDIA_SCENES = 12;
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
  generationMode?: VideoGenerationMode | string;
  mediaInputs?: VideoGenerationMediaInputSpec[] | unknown;
  engine?: string;
  qualityMode?: string;
  audio?: unknown;
  voiceoverScript?: string;
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

type SceneContinuity = GeneratedScene["continuity"] | "provided_image" | "provided_video";

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

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} excedeu ${Math.round(ms / 1000)}s`)), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  const shot = shotTypes[Math.min(input.sceneIndex, shotTypes.length - 1)] ?? shotTypes.at(-1)!;
  const orientation = input.aspectRatio === "landscape" ? "horizontal 16:9" : "vertical 9:16";
  return [
    input.continuity
      ? "Use the supplied previous frame only as a VISUAL CONTINUITY REFERENCE. Create the next distinct scene, not a duplicate. Preserve the main subject identity, recognizable product/character features, palette and art direction."
      : "Create the first frame of a coherent short-form video sequence.",
    `Core video concept and confirmed context: ${input.prompt}`,
    `Scene ${input.sceneIndex + 1} of ${input.sceneCount}: ${shot}.`,
    `Art direction: ${input.style}.`,
    `Composition: ${orientation}, cinematic depth, realistic lighting, strong focal point, safe margins for social video cropping.`,
    "Do not add captions, typography, logos, UI, watermarks or borders inside the generated image.",
    "Do not invent prices, discounts, guarantees, certifications, deadlines or performance claims that are not explicitly present in the confirmed context.",
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
    const result = await withTimeout(openai.images.generate({
      model: preferredModel,
      prompt: input.prompt,
      n: 1,
      size: input.size,
      quality: "medium",
    }), IMAGE_GENERATION_TIMEOUT_MS, "Geração da primeira cena");
    return { buffer: extractImageBuffer(result), model: preferredModel, continuity: "generated" };
  } catch (error) {
    if (preferredModel === "gpt-image-1" || !isModelAvailabilityError(error)) throw error;
    const fallbackModel = "gpt-image-1";
    const result = await withTimeout(openai.images.generate({
      model: fallbackModel,
      prompt: input.prompt,
      n: 1,
      size: input.size,
      quality: "medium",
    }), IMAGE_GENERATION_TIMEOUT_MS, "Geração da primeira cena (fallback)");
    return { buffer: extractImageBuffer(result), model: fallbackModel, continuity: "generated" };
  }
}

async function generateNextScene(input: {
  tenantId: string;
  previous: Buffer;
  previousMimeType?: string | null;
  prompt: string;
  size: "1024x1536" | "1536x1024";
  model: string;
}): Promise<GeneratedScene> {
  const openai = await getOpenAIForTenant(input.tenantId);
  try {
    const mimeType = input.previousMimeType?.startsWith("image/") ? input.previousMimeType : "image/png";
    const extension = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
    const previousFile = await toFile(input.previous, `previous-scene.${extension}`, { type: mimeType });
    const result = await withTimeout(openai.images.edit({
      model: input.model,
      image: previousFile,
      prompt: input.prompt,
      n: 1,
      size: input.size,
      quality: "medium",
    }), IMAGE_GENERATION_TIMEOUT_MS, "Geração da cena por continuidade");
    return { buffer: extractImageBuffer(result), model: input.model, continuity: "edited" };
  } catch {
    const result = await withTimeout(openai.images.generate({
      model: input.model,
      prompt: input.prompt,
      n: 1,
      size: input.size,
      quality: "medium",
    }), IMAGE_GENERATION_TIMEOUT_MS, "Regeneração da cena");
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

async function renderImageScene(input: {
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
    "-map", "0:v:0",
    "-map", "1:a:0",
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

async function renderVideoScene(input: {
  sourcePath: string;
  outputPath: string;
  duration: number;
  width: number;
  height: number;
}): Promise<void> {
  const sourceHasAudio = await hasAudioStream(input.sourcePath);
  const videoFilter = [
    `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase`,
    `crop=${input.width}:${input.height}`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");
  if (sourceHasAudio) {
    await execFileAsync("ffmpeg", [
      "-y",
      "-stream_loop", "-1",
      "-i", input.sourcePath,
      "-t", input.duration.toFixed(3),
      "-vf", videoFilter,
      "-map", "0:v:0",
      "-map", "0:a:0",
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
    return;
  }
  await execFileAsync("ffmpeg", [
    "-y",
    "-stream_loop", "-1",
    "-i", input.sourcePath,
    "-f", "lavfi",
    "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-t", input.duration.toFixed(3),
    "-vf", videoFilter,
    "-map", "0:v:0",
    "-map", "1:a:0",
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

async function applyProjectAudio(input: {
  sourcePath: string;
  outputPath: string;
  audioInputs: ResolvedVideoGenerationMediaInput[];
  duration: number;
  tempPaths: string[];
  jobId: string;
}): Promise<{ outputPath: string; applied: boolean; assetIds: string[] }> {
  const voice = input.audioInputs.find((item) => item.role === "voiceover");
  const music = input.audioInputs.find((item) => item.role === "music");
  const sfx = input.audioInputs.find((item) => item.role === "sfx");
  const selected = [voice, music, sfx].filter((item): item is ResolvedVideoGenerationMediaInput => Boolean(item));
  if (!selected.length) return { outputPath: input.sourcePath, applied: false, assetIds: [] };

  const args = ["-y", "-i", input.sourcePath];
  const filterParts: string[] = ["[0:a]volume=1[baseaudio]"];
  const mixLabels = ["[baseaudio]"];
  for (let index = 0; index < selected.length; index += 1) {
    const asset = selected[index]!;
    const extension = extensionForMediaInput(asset);
    const path = join(tmpdir(), `video-generate-${input.jobId}-audio-${index}.${extension}`);
    input.tempPaths.push(path);
    await writeFile(path, asset.buffer);
    args.push("-stream_loop", "-1", "-i", path);
    const label = `audio${index}`;
    const volume = asset.role === "voiceover" ? 1 : asset.role === "music" ? 0.18 : 0.38;
    const trimDuration = asset.role === "sfx" ? Math.min(2, input.duration) : input.duration;
    filterParts.push(`[${index + 1}:a]volume=${volume.toFixed(2)},atrim=0:${trimDuration.toFixed(3)},asetpts=N/SR/TB[${label}]`);
    mixLabels.push(`[${label}]`);
  }
  filterParts.push(`${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=2[aout]`);
  args.push(
    "-filter_complex", filterParts.join(";"),
    "-map", "0:v:0",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-ac", "2",
    "-t", input.duration.toFixed(3),
    "-movflags", "+faststart",
    input.outputPath,
  );
  await execFileAsync("ffmpeg", args, { maxBuffer: 8 * 1024 * 1024 });
  return { outputPath: input.outputPath, applied: true, assetIds: selected.map((item) => item.assetId) };
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
           OR updated_at < NOW() - ($3::text || ' minutes')::interval
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
    [runnerToken, LEASE_MINUTES, STALE_RUNNING_MINUTES],
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

async function concatPremiumClips(input: {
  clipPaths: string[];
  outputPath: string;
  withAudio: boolean;
}): Promise<void> {
  if (input.clipPaths.length === 1) {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", input.clipPaths[0]!,
      "-c", "copy",
      "-movflags", "+faststart",
      input.outputPath,
    ], { maxBuffer: 8 * 1024 * 1024 });
    return;
  }

  const args = ["-y"];
  for (const clipPath of input.clipPaths) args.push("-i", clipPath);

  if (input.withAudio) {
    const streams = input.clipPaths.map((_, index) => `[${index}:v:0][${index}:a:0]`).join("");
    args.push(
      "-filter_complex", `${streams}concat=n=${input.clipPaths.length}:v=1:a=1[v][a]`,
      "-map", "[v]",
      "-map", "[a]",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "19",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-ac", "2",
      "-movflags", "+faststart",
      input.outputPath,
    );
  } else {
    const streams = input.clipPaths.map((_, index) => `[${index}:v:0]`).join("");
    args.push(
      "-filter_complex", `${streams}concat=n=${input.clipPaths.length}:v=1:a=0[v]`,
      "-map", "[v]",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "19",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      input.outputPath,
    );
  }

  await execFileAsync("ffmpeg", args, { maxBuffer: 8 * 1024 * 1024 });
}

function splitPremiumVoiceover(script: string | null, sceneCount: number): string[] {
  if (!script) return Array.from({ length: sceneCount }, () => "");
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (!sentences.length) return Array.from({ length: sceneCount }, () => "");

  const chunks = Array.from({ length: sceneCount }, () => [] as string[]);
  sentences.forEach((sentence, index) => chunks[Math.min(sceneCount - 1, Math.floor(index * sceneCount / sentences.length))]!.push(sentence));
  return chunks.map((chunk) => chunk.join(" "));
}

async function processClaimedVideo(video: ClaimedVideo, runnerToken: string, logger: Logger): Promise<void> {
  const rawPrompt = stringValue(video.input.prompt);
  const title = stringValue(video.input.title) ?? "Vídeo gerado com IA";
  const style = (stringValue(video.input.style) ?? "cinematic, premium, photorealistic, polished commercial production").slice(0, MAX_STYLE_LENGTH);
  const aspectRatio = aspectRatioValue(video.input.aspectRatio);
  const duration = numberValue(video.input.duration, 16, MIN_DURATION, MAX_DURATION);
  const effects = resolveVideoEffects(video.input.effects);
  const requestedSceneCount = Number.isFinite(Number(video.input.sceneCount)) ? Number(video.input.sceneCount) : null;
  const mode = videoGenerationMode(video.input.generationMode);
  const userId = video.input.userId ?? null;
  const requestedEngine = String(video.input.engine ?? "").trim().toLowerCase();
  const qualityMode = String(video.input.qualityMode ?? "").trim().toLowerCase();
  const useCinemaNativeVideo = requestedEngine === "veo-3.1"
    || requestedEngine === "google/veo-3.1"
    || qualityMode === "cinema";
  const useLiteNativeVideo = requestedEngine === "veo-3.1-lite"
    || requestedEngine === "google/veo-3.1-lite"
    || qualityMode === "standard"
    || qualityMode === "lite";
  const useNativeVideo = useCinemaNativeVideo || useLiteNativeVideo;
  const nativeVideoModel: "google/veo-3.1" | "google/veo-3.1-lite" = useCinemaNativeVideo
    ? "google/veo-3.1"
    : "google/veo-3.1-lite";
  const nativeVideoResolution: "720p" | "1080p" = useCinemaNativeVideo ? "1080p" : "720p";
  const effectiveQualityMode = useCinemaNativeVideo ? "cinema" : "standard";
  const audioConfig = asRecord(video.input.audio);
  const nativeAudioEnabled = audioConfig["enabled"] !== false;
  const voiceoverScript = stringValue(video.input.voiceoverScript);
  const contextPack = await resolveVideoContextPack(video.tenantId).catch((error) => {
    logger.warn({ err: error, tenantId: video.tenantId, jobId: video.id }, "media-video-generate: contexto do tenant indisponível");
    return null;
  });

  if (!video.projectId || (rawPrompt?.length ?? 0) > MAX_PROMPT_LENGTH) {
    const error = `Vídeo inválido: o prompt deve ter no máximo ${MAX_PROMPT_LENGTH} caracteres`;
    await persistFinished({ video, runnerToken, status: "error", error });
    if (video.projectId) await setMediaProjectStatus(video.tenantId, video.projectId, "draft");
    return;
  }

  if (useNativeVideo) {
    try {
      await persistRunning({
        video,
        runnerToken,
        progress: 5,
        output: {
          prompt: rawPrompt ?? "",
          style,
          aspectRatio,
          requestedDuration: duration,
          engine: nativeVideoModel,
          qualityMode: effectiveQualityMode,
          resolution: nativeVideoResolution,
          nativeAudioEnabled,
          stage: useCinemaNativeVideo ? "premium_native_video" : "standard_native_video",
        },
      });

      const premiumSceneCount = Math.max(3, Math.min(4, Math.ceil(duration / 8)));
      const actualDuration = premiumSceneCount * 8;
      const referenceImages = (contextPack?.references ?? [])
        .filter((item) => item.type === "image" && /^https:\/\//i.test(item.storageUrl))
        .slice(0, 3)
        .map((item) => item.storageUrl);
      const voiceoverChunks = splitPremiumVoiceover(voiceoverScript, premiumSceneCount);
      const negativePrompt = [
        "deformed hands",
        "extra fingers",
        "missing fingers",
        "duplicated people",
        "multiple faces on one person",
        "warped faces",
        "melting objects",
        "fused objects",
        "floating objects",
        "broken anatomy",
        "unrealistic body motion",
        "crowds",
        "close-up hands",
        "distorted screens",
        "invented UI text",
        "warped typography",
        "random logos",
        "watermarks",
        "flicker",
        "geometry drift",
      ].join(", ");

      const sceneDirections = [
        [
          "SCENE 1 — REAL PRODUCT.",
          "No people. Present the actual SaaS product experience as the hero.",
          "Use official product screenshots from reference images as visual truth whenever available.",
          "Elegant controlled camera move, minimal motion, stable UI geometry, premium enterprise lighting.",
        ].join(" "),
        [
          "SCENE 2 — HUMAN + PRODUCT.",
          "Show at most ONE professional using the product in a realistic office environment.",
          "Keep the person medium-shot or wider; do not show hands in close-up.",
          "Simple natural movement only: looking at screen, slight posture shift, subtle camera dolly.",
          "The product remains the focal point and should resemble the official references.",
        ].join(" "),
        [
          "SCENE 3 — BUSINESS RESULT.",
          "Return to product-led visuals with no people, showing coordinated agents, CRM, omnichannel, agenda and automation conceptually.",
          "Use restrained motion graphics around a plausible SaaS environment without inventing readable UI text.",
          "Finish with a clean hero composition prepared for deterministic Vendor.ai branding in post-production.",
        ].join(" "),
        [
          "SCENE 4 — PREMIUM CLOSE.",
          "No people. Create a controlled cinematic product montage using official product references and stable interface geometry.",
          "Emphasize trust, scale, automation and enterprise polish. Leave clean negative space for brand compositor.",
        ].join(" "),
      ];

      const premiumClipPaths: string[] = [];
      const predictionIds: string[] = [];
      const generationProviders: string[] = [];
      const premiumTempPaths: string[] = [];

      for (let sceneIndex = 0; sceneIndex < premiumSceneCount; sceneIndex += 1) {
        await persistRunning({
          video,
          runnerToken,
          progress: 8 + Math.round((sceneIndex / premiumSceneCount) * 72),
          output: {
            prompt: rawPrompt ?? "",
            style,
            aspectRatio,
            requestedDuration: duration,
            actualDuration,
            sceneCount: premiumSceneCount,
            sceneIndex,
            engine: nativeVideoModel,
            qualityMode: effectiveQualityMode,
            resolution: nativeVideoResolution,
            nativeAudioEnabled,
            stage: useCinemaNativeVideo ? "premium_native_multishot" : "standard_native_multishot",
          },
        });

        const scenePrompt = [
          contextPack?.promptContext ?? "",
          rawPrompt ?? "",
          sceneDirections[sceneIndex] ?? sceneDirections.at(-1)!,
          `Visual direction: ${style}.`,
          voiceoverChunks[sceneIndex]
            ? `Brazilian Portuguese narration for this scene only, natural and professional: "${voiceoverChunks[sceneIndex]}"`
            : "",
          nativeAudioEnabled
            ? "Generate subtle synchronized ambience and restrained premium technology sound design."
            : "Do not generate audio.",
          "Premium commercial film quality. Stable geometry, physically plausible movement, realistic lighting, restrained motion, clean enterprise SaaS aesthetic.",
          "Do not render captions, brand names or logos inside the generated frames. Official Vendor.ai identity is applied later by a deterministic compositor.",
        ].filter(Boolean).join("\n");

        const premiumScene = await generateVeoVideo({
          prompt: scenePrompt,
          cinema: useCinemaNativeVideo,
          aspectRatio: aspectRatio === "portrait" ? "9:16" : "16:9",
          duration: 8,
          resolution: nativeVideoResolution,
          generateAudio: nativeAudioEnabled,
          negativePrompt: useCinemaNativeVideo ? negativePrompt : undefined,
          image: !useCinemaNativeVideo && referenceImages.length
            ? referenceImages[sceneIndex % referenceImages.length]
            : undefined,
          referenceImages: useCinemaNativeVideo ? referenceImages : undefined,
          logger,
        });

        const clipPath = join(tmpdir(), `video-premium-${video.id}-scene-${sceneIndex + 1}.mp4`);
        await writeFile(clipPath, premiumScene.buffer);
        premiumClipPaths.push(clipPath);
        premiumTempPaths.push(clipPath);
        predictionIds.push(premiumScene.providerJobId);
        generationProviders.push(premiumScene.provider);
      }

      const premiumRawPath = join(tmpdir(), `video-premium-${video.id}-raw.mp4`);
      premiumTempPaths.push(premiumRawPath);
      const clipsHaveAudio = nativeAudioEnabled
        && (await Promise.all(premiumClipPaths.map((clipPath) => hasAudioStream(clipPath)))).every(Boolean);
      await concatPremiumClips({
        clipPaths: premiumClipPaths,
        outputPath: premiumRawPath,
        withAudio: clipsHaveAudio,
      });

      await persistRunning({
        video,
        runnerToken,
        progress: 90,
        output: {
          prompt: rawPrompt ?? "",
          style,
          aspectRatio,
          requestedDuration: duration,
          actualDuration,
          sceneCount: premiumSceneCount,
          engine: nativeVideoModel,
          qualityMode: effectiveQualityMode,
          resolution: nativeVideoResolution,
          nativeAudioEnabled,
          predictionIds,
          referenceImages,
          stage: "saving_output",
        },
      });

      let premiumBrandCleanup: (() => Promise<void>) | null = null;
      let premiumFinalBuffer = await readFile(premiumRawPath);
      let premiumBrand = {
        logoAssetId: null as string | null,
        introAssetId: null as string | null,
        outroAssetId: null as string | null,
        logoApplied: false,
        introApplied: false,
        outroApplied: false,
        logoWarning: null as string | null,
      };
      try {
        const branded = await applyBrandIntroOutro({
          tenantId: video.tenantId,
          sourcePath: premiumRawPath,
          jobId: video.id,
        });
        premiumBrandCleanup = branded.cleanup;
        premiumFinalBuffer = await readFile(branded.outputPath);
        premiumBrand = {
          logoAssetId: branded.logoAssetId,
          introAssetId: branded.introAssetId,
          outroAssetId: branded.outroAssetId,
          logoApplied: branded.logoApplied,
          introApplied: branded.introApplied,
          outroApplied: branded.outroApplied,
          logoWarning: branded.logoWarning,
        };
      } finally {
        for (const tempPath of premiumTempPaths) {
          await unlink(tempPath).catch(() => undefined);
        }
      }

      const storageUrl = await saveObject(premiumFinalBuffer, "video/mp4", "video-generate/outputs", "mp4");
      const output = await registerGeneratedMediaOutput({
        tenantId: video.tenantId,
        projectId: video.projectId,
        userId,
        storageUrl,
        mimeType: "video/mp4",
        originalFilename: `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || video.id}-cinema-v5.mp4`,
        operation: "video_generate",
        label: useCinemaNativeVideo ? "Vídeo Cinema gerado com IA" : "Vídeo Padrão gerado com IA",
        metadata: {
          jobId: video.id,
          prompt: rawPrompt ?? "",
          style,
          aspectRatio,
          requestedDuration: duration,
          actualDuration,
          sceneCount: premiumSceneCount,
          engine: nativeVideoModel,
          provider: Array.from(new Set(generationProviders)).join("+") || "unknown",
          providers: generationProviders,
          qualityMode: effectiveQualityMode,
          resolution: nativeVideoResolution,
          audioApplied: clipsHaveAudio,
          nativeAudio: clipsHaveAudio,
          predictionIds,
          referenceImages,
          generationEngine: useCinemaNativeVideo ? "native-video-premium-v5-multishot-references" : "native-video-lite-v1-multishot",
          contextPack: contextPack ? {
            brand: contextPack.brand,
            knowledgeTitles: contextPack.knowledge.map((item) => item.title),
            referenceAssetIds: contextPack.references.map((item) => item.assetId),
          } : null,
          ...premiumBrand,
        },
      });

      await persistFinished({
        video,
        runnerToken,
        status: "done",
        output: {
          videoUrl: storageUrl,
          videoAssetId: output.assetId,
          prompt: rawPrompt ?? "",
          style,
          aspectRatio,
          requestedDuration: duration,
          actualDuration,
          sceneCount: premiumSceneCount,
          engine: nativeVideoModel,
          provider: "replicate",
          qualityMode: effectiveQualityMode,
          resolution: nativeVideoResolution,
          audioApplied: nativeAudioEnabled,
          nativeAudio: nativeAudioEnabled,
          predictionIds,
          referenceImages,
          generationEngine: useCinemaNativeVideo ? "native-video-premium-v5-multishot-references" : "native-video-lite-v1-multishot",
          contextPack: contextPack ? {
            brand: contextPack.brand,
            knowledgeTitles: contextPack.knowledge.map((item) => item.title),
            referenceAssetIds: contextPack.references.map((item) => item.assetId),
          } : null,
          ...premiumBrand,
        },
      });
      if (premiumBrandCleanup) await premiumBrandCleanup().catch(() => undefined);
      return;
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Falha no motor de vídeo").slice(0, 1000);
      logger.error({ err: error, jobId: video.id, tenantId: video.tenantId }, "media-video-generate: motor nativo falhou");
      await persistFinished({ video, runnerToken, status: "error", error: message }).catch(() => undefined);
      if (video.projectId) await setMediaProjectStatus(video.tenantId, video.projectId, "draft").catch(() => undefined);
      return;
    }
  }

  const { width, height } = outputDimensions(aspectRatio);
  const size = imageSize(aspectRatio);
  const tempPaths: string[] = [];
  let brandCleanup: (() => Promise<void>) | null = null;

  try {
    const resolvedInputs = mode === "ai_only"
      ? []
      : await resolveVideoGenerationMediaInputs({ tenantId: video.tenantId, specs: video.input.mediaInputs });
    const visualInputs = visualGenerationInputs(resolvedInputs);
    const audioInputs = resolvedInputs.filter((item) => item.type === "audio");
    const requiredVisuals = visualInputs.filter((item) => item.importance === "required");
    if (mode !== "ai_only" && resolvedInputs.length === 0) {
      throw new Error("Adicione pelo menos uma mídia válida para usar este modo de geração");
    }
    if (mode === "media_only" && visualInputs.length === 0) {
      throw new Error("O modo “Somente minhas mídias” precisa de pelo menos uma foto ou vídeo");
    }
    if (visualInputs.length > MAX_MEDIA_SCENES) {
      throw new Error(`Use no máximo ${MAX_MEDIA_SCENES} fotos/vídeos por geração. Divida projetos maiores na timeline.`);
    }
    if (requiredVisuals.length > MAX_MEDIA_SCENES) {
      throw new Error(`Há mais de ${MAX_MEDIA_SCENES} mídias visuais obrigatórias; reduza a seleção antes de gerar.`);
    }

    const briefing = videoGenerationBriefing({ prompt: rawPrompt, inputs: resolvedInputs, mode });
    const baseAiSceneCount = recommendedSceneCount(duration, requestedSceneCount, effects, MIN_SCENES, MAX_AI_SCENES);
    const sceneCount = mode === "media_only"
      ? visualInputs.length
      : mode === "hybrid"
        ? Math.min(MAX_MEDIA_SCENES, Math.max(baseAiSceneCount, visualInputs.length))
        : baseAiSceneCount;
    const transitionDuration = transitionDurationFor(duration, sceneCount, effects);
    const sceneDuration = (duration + transitionDuration * Math.max(0, sceneCount - 1)) / Math.max(1, sceneCount);
    const inputAssetIds = resolvedInputs.map((item) => item.assetId);

    await persistRunning({
      video,
      runnerToken,
      progress: 2,
      output: {
        prompt: rawPrompt ?? "",
        style,
        aspectRatio,
        duration,
        sceneCount,
        effects,
        transitionDuration,
        generationMode: mode,
        inputAssetIds,
        documentSources: briefing.documentSources,
      },
    });

    const sceneAssetIds: string[] = [];
    const scenePrompts: string[] = [];
    const continuityModes: SceneContinuity[] = [];
    const sceneVideoPaths: string[] = [];
    let previous: Buffer | null = null;
    let previousMimeType: string | null = null;
    let imageModel = process.env["VENDORAI_IMAGE_MODEL"]?.trim() || "gpt-image-2";

    for (let index = 0; index < visualInputs.length; index += 1) {
      const asset = visualInputs[index]!;
      const sourcePath = join(tmpdir(), `video-generate-${video.id}-input-${index}.${extensionForMediaInput(asset)}`);
      const sceneVideoPath = join(tmpdir(), `video-generate-${video.id}-scene-${index}.mp4`);
      tempPaths.push(sourcePath, sceneVideoPath);
      await writeFile(sourcePath, asset.buffer);
      if (asset.type === "image") {
        await renderImageScene({ imagePath: sourcePath, outputPath: sceneVideoPath, sceneIndex: index, duration: sceneDuration, width, height, effects });
        previous = asset.buffer;
        previousMimeType = asset.mimeType;
        continuityModes.push("provided_image");
      } else {
        await renderVideoScene({ sourcePath, outputPath: sceneVideoPath, duration: sceneDuration, width, height });
        continuityModes.push("provided_video");
      }
      sceneVideoPaths.push(sceneVideoPath);
      sceneAssetIds.push(asset.assetId);
      scenePrompts.push(`Mídia fornecida: ${asset.originalFilename}${asset.note ? ` — ${asset.note}` : ""}`);
      await persistRunning({
        video,
        runnerToken,
        progress: 8 + ((index + 1) / Math.max(1, sceneCount)) * 62,
        output: {
          prompt: rawPrompt ?? "",
          style,
          aspectRatio,
          duration,
          sceneCount,
          imageModel,
          sceneAssetIds,
          continuityModes,
          effects,
          transitionDuration,
          generationMode: mode,
          inputAssetIds,
          documentSources: briefing.documentSources,
        },
      });
    }

    if (mode !== "media_only") {
      const reference = referenceImageInput(resolvedInputs);
      if (!previous && reference) {
        previous = reference.buffer;
        previousMimeType = reference.mimeType;
      }
      for (let index = visualInputs.length; index < sceneCount; index += 1) {
        const promptForScene = scenePrompt({
          prompt: briefing.prompt,
          style,
          sceneIndex: index,
          sceneCount,
          aspectRatio,
          continuity: Boolean(previous),
        });
        const generated = previous
          ? await generateNextScene({
              tenantId: video.tenantId,
              previous,
              previousMimeType,
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
        previousMimeType = "image/png";
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

        const sceneImagePath = join(tmpdir(), `video-generate-${video.id}-generated-${index}.png`);
        const sceneVideoPath = join(tmpdir(), `video-generate-${video.id}-scene-${index}.mp4`);
        tempPaths.push(sceneImagePath, sceneVideoPath);
        await writeFile(sceneImagePath, generated.buffer);
        await renderImageScene({ imagePath: sceneImagePath, outputPath: sceneVideoPath, sceneIndex: index, duration: sceneDuration, width, height, effects });
        sceneVideoPaths.push(sceneVideoPath);

        await persistRunning({
          video,
          runnerToken,
          progress: 8 + ((index + 1) / Math.max(1, sceneCount)) * 62,
          output: {
            prompt: rawPrompt ?? "",
            style,
            aspectRatio,
            duration,
            sceneCount,
            imageModel,
            sceneAssetIds,
            continuityModes,
            effects,
            transitionDuration,
            generationMode: mode,
            inputAssetIds,
            documentSources: briefing.documentSources,
          },
        });
      }
    }

    if (!sceneVideoPaths.length) throw new Error("Nenhuma cena visual ficou disponível para compor o vídeo");

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

    const audioOutputPath = join(tmpdir(), `video-generate-${video.id}-audio.mp4`);
    const mixed = await applyProjectAudio({
      sourcePath: composedPath,
      outputPath: audioOutputPath,
      audioInputs,
      duration,
      tempPaths,
      jobId: video.id,
    });
    if (mixed.applied) {
      tempPaths.push(audioOutputPath);
      composedPath = mixed.outputPath;
    }

    await persistRunning({
      video,
      runnerToken,
      progress: 85,
      output: {
        prompt: rawPrompt ?? "",
        style,
        aspectRatio,
        duration,
        sceneCount,
        imageModel,
        sceneAssetIds,
        continuityModes,
        effects,
        transitionDuration,
        generationMode: mode,
        inputAssetIds,
        documentSources: briefing.documentSources,
        audioApplied: mixed.applied,
        audioAssetIds: mixed.assetIds,
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
        prompt: rawPrompt ?? "",
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
        generationMode: mode,
        inputAssetIds,
        mediaInputs: resolvedInputs.map((item) => ({
          assetId: item.assetId,
          type: item.type,
          role: item.role,
          importance: item.importance,
          order: item.order,
          note: item.note,
        })),
        documentSources: briefing.documentSources,
        audioApplied: mixed.applied,
        audioAssetIds: mixed.assetIds,
        logoAssetId: branded.logoAssetId,
        introAssetId: branded.introAssetId,
        outroAssetId: branded.outroAssetId,
        logoApplied: branded.logoApplied,
        introApplied: branded.introApplied,
        outroApplied: branded.outroApplied,
        logoWarning: branded.logoWarning,
        engine: "vendorai",
        generationEngine: "media-workspace-hybrid-v1",
      },
    });

    await persistFinished({
      video,
      runnerToken,
      status: "done",
      output: {
        videoUrl: storageUrl,
        videoAssetId: output.assetId,
        prompt: rawPrompt ?? "",
        style,
        aspectRatio,
        duration,
        sceneCount,
        imageModel,
        sceneAssetIds,
        continuityModes,
        effects,
        transitionDuration,
        generationMode: mode,
        inputAssetIds,
        documentSources: briefing.documentSources,
        audioApplied: mixed.applied,
        audioAssetIds: mixed.assetIds,
        logoAssetId: branded.logoAssetId,
        introAssetId: branded.introAssetId,
        outroAssetId: branded.outroAssetId,
        logoApplied: branded.logoApplied,
        introApplied: branded.introApplied,
        outroApplied: branded.outroApplied,
        logoWarning: branded.logoWarning,
        engine: "vendorai",
        generationEngine: "media-workspace-hybrid-v1",
      },
    });
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Falha ao gerar vídeo").slice(0, 1_000);
    logger.error({ err: error, jobId: video.id, tenantId: video.tenantId }, "media-video-generate: geração falhou");
    if (video.projectId) await setMediaProjectStatus(video.tenantId, video.projectId, "draft").catch(() => undefined);
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
      if (video) {
        logger.info({ jobId: video.id, tenantId: video.tenantId, projectId: video.projectId }, "media-video-generate: job reivindicado");
        await processClaimedVideo(video, runnerToken, logger);
      }
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
