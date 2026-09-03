import { randomUUID } from "crypto";
import { createMediaJob } from "./media-jobs.js";
import { createProcessingMediaProject } from "./media-library.js";
import { startVendorAiPhotoVideo } from "./vendorai-photo-video.js";
import { startVendorAiMediaBatch, type MediaBatchItem } from "./vendorai-media-batch.js";
import { startVendorAiAiImageTool } from "./vendorai-ai-image-tools.js";

export type VendorAiMediaCapability =
  | "video_edit"
  | "video_clips"
  | "video_caption"
  | "video_batch"
  | "video_compose"
  | "voice_profile"
  | "voice_synthesize"
  | "persona_profile"
  | "avatar_lipsync"
  | "music_generate"
  | "video_generate"
  | "image_resize"
  | "image_crop"
  | "image_optimize"
  | "image_enhance"
  | "image_convert"
  | "image_remove_background"
  | "image_variations"
  | "photo_video"
  | "media_batch";

export interface VendorAiMediaEngineCapabilities {
  provider: "vendorai";
  externalAvatarProviderRequired: false;
  capabilities: Record<VendorAiMediaCapability, "ready" | "building">;
}

async function workerHealthReady(url: string | undefined, kind: "voice" | "lipsync" | "music"): Promise<boolean> {
  if (!url) return false;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return false;
    const health = await response.json() as Record<string, unknown>;
    if (kind === "lipsync" || kind === "music") return health["ready"] === true;
    return health["status"] === "ok" && (health["cudaAvailable"] === true || health["device"] === "cpu");
  } catch { return false; }
}

export const vendorAiMediaEngineCapabilities: VendorAiMediaEngineCapabilities = {
  provider: "vendorai",
  externalAvatarProviderRequired: false,
  capabilities: {
    video_edit: "ready", video_clips: "ready", video_caption: "ready", video_batch: "building", video_compose: "ready",
    voice_profile: "ready", voice_synthesize: "building", persona_profile: "ready", avatar_lipsync: "building", music_generate: "building",
    video_generate: "ready", image_resize: "ready", image_crop: "ready", image_optimize: "ready", image_enhance: "ready", image_convert: "ready",
    image_remove_background: "ready", image_variations: "ready", photo_video: "ready", media_batch: "ready",
  },
};

export async function refreshVendorAiWorkerCapabilities(): Promise<void> {
  const [voiceReady, lipSyncReady, musicReady] = await Promise.all([
    workerHealthReady(process.env["VENDORAI_MEDIA_WORKER_URL"], "voice"),
    workerHealthReady(process.env["VENDORAI_LIPSYNC_WORKER_URL"], "lipsync"),
    workerHealthReady(process.env["VENDORAI_MUSIC_WORKER_URL"], "music"),
  ]);
  vendorAiMediaEngineCapabilities.capabilities.voice_synthesize = voiceReady ? "ready" : "building";
  vendorAiMediaEngineCapabilities.capabilities.avatar_lipsync = lipSyncReady ? "ready" : "building";
  vendorAiMediaEngineCapabilities.capabilities.video_batch = voiceReady && lipSyncReady ? "ready" : "building";
  vendorAiMediaEngineCapabilities.capabilities.music_generate = musicReady ? "ready" : "building";
}

void refreshVendorAiWorkerCapabilities();
const workerHealthTimer = setInterval(() => { void refreshVendorAiWorkerCapabilities(); }, 30_000);
workerHealthTimer.unref?.();

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function mediaBatchItems(value: unknown): MediaBatchItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item) => ({
    assetId: String(item["assetId"] ?? ""),
    operation: String(item["operation"] ?? "") as MediaBatchItem["operation"],
    options: item["options"] && typeof item["options"] === "object" && !Array.isArray(item["options"]) ? item["options"] as MediaBatchItem["options"] : undefined,
  }));
}

export async function createVendorAiMediaGenerationJob(input: {
  tenantId: string; userId?: string | null; title: string; operation: VendorAiMediaCapability; context?: Record<string, unknown>;
}) {
  const context = input.context ?? {};

  if (input.operation === "photo_video") {
    const rawFormat = String(context["format"] ?? "16:9");
    const format = rawFormat === "9:16" || rawFormat === "1:1" ? rawFormat : "16:9";
    return startVendorAiPhotoVideo({ tenantId: input.tenantId, userId: input.userId ?? null, title: input.title, assetIds: stringArray(context["assetIds"]), secondsPerImage: Number(context["secondsPerImage"] ?? 3), format });
  }
  if (input.operation === "media_batch") {
    return startVendorAiMediaBatch({ tenantId: input.tenantId, userId: input.userId ?? null, title: input.title, items: mediaBatchItems(context["items"]) });
  }
  if (input.operation === "image_remove_background" || input.operation === "image_variations") {
    const rawSize = String(context["size"] ?? "1024x1024");
    const size = rawSize === "1024x1536" || rawSize === "1536x1024" ? rawSize : "1024x1024";
    return startVendorAiAiImageTool({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      title: input.title,
      assetId: String(context["assetId"] ?? ""),
      operation: input.operation,
      prompt: typeof context["prompt"] === "string" ? context["prompt"] : undefined,
      count: Number(context["count"] ?? 2),
      size,
    });
  }

  const projectId = await createProcessingMediaProject({ tenantId: input.tenantId, userId: input.userId ?? null, title: input.title, operation: input.operation, context: { ...context, engine: "vendorai", externalAvatarProvider: false } });
  const jobId = randomUUID();
  await createMediaJob({ id: jobId, tenantId: input.tenantId, projectId, operation: input.operation, provider: "vendorai", input: { ...context, userId: input.userId ?? null, title: input.title }, snapshot: { status: "running", progress: 0 } });
  return { projectId, jobId };
}
