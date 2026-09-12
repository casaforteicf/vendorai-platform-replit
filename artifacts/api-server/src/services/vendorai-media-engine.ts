import { randomUUID } from "crypto";
import { pool } from "@workspace/db";
import { createMediaJob } from "./media-jobs.js";
import { createProcessingMediaProject } from "./media-library.js";
import { startVendorAiPhotoVideo } from "./vendorai-photo-video.js";
import { startVendorAiMediaBatch, type MediaBatchItem } from "./vendorai-media-batch.js";
import { startVendorAiAiImageTool } from "./vendorai-ai-image-tools.js";
import { generateVendorAiMusic } from "./vendorai-music-engine.js";
import { generateVendorAiLipSync } from "./vendorai-lipsync-engine.js";

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
  | "image_replace_background"
  | "image_remove_object"
  | "image_outpaint"
  | "photo_video"
  | "media_batch";

export interface VendorAiMediaEngineCapabilities {
  provider: "vendorai";
  externalAvatarProviderRequired: false;
  capabilities: Record<VendorAiMediaCapability, "ready" | "building">;
}

export type VendorAiWorkerKind = "voice" | "lipsync" | "music";
export type VendorAiWorkerStatus = { configured: boolean; ready: boolean; checkedAt: string };

export const vendorAiWorkerStatus: Record<VendorAiWorkerKind, VendorAiWorkerStatus> = {
  voice: { configured: Boolean(process.env["VENDORAI_MEDIA_WORKER_URL"]), ready: false, checkedAt: new Date(0).toISOString() },
  lipsync: { configured: Boolean(process.env["VENDORAI_LIPSYNC_WORKER_URL"]), ready: false, checkedAt: new Date(0).toISOString() },
  music: { configured: Boolean(process.env["VENDORAI_MUSIC_WORKER_URL"]), ready: false, checkedAt: new Date(0).toISOString() },
};

async function workerHealthReady(url: string | undefined, kind: VendorAiWorkerKind): Promise<boolean> {
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
    image_remove_background: "ready", image_variations: "ready", image_replace_background: "ready", image_remove_object: "ready", image_outpaint: "ready",
    photo_video: "ready", media_batch: "ready",
  },
};

export async function refreshVendorAiWorkerCapabilities(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const urls: Record<VendorAiWorkerKind, string | undefined> = {
    voice: process.env["VENDORAI_MEDIA_WORKER_URL"],
    lipsync: process.env["VENDORAI_LIPSYNC_WORKER_URL"],
    music: process.env["VENDORAI_MUSIC_WORKER_URL"],
  };
  const [voiceReady, lipSyncReady, musicReady] = await Promise.all([
    workerHealthReady(urls.voice, "voice"), workerHealthReady(urls.lipsync, "lipsync"), workerHealthReady(urls.music, "music"),
  ]);
  vendorAiWorkerStatus.voice = { configured: Boolean(urls.voice), ready: voiceReady, checkedAt };
  vendorAiWorkerStatus.lipsync = { configured: Boolean(urls.lipsync), ready: lipSyncReady, checkedAt };
  vendorAiWorkerStatus.music = { configured: Boolean(urls.music), ready: musicReady, checkedAt };
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
function optionalString(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function normalize(value: unknown): string { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function tokens(value: unknown): string[] {
  const stop = new Set(["para", "como", "com", "uma", "das", "dos", "por", "que", "seu", "sua", "de", "do", "da", "em", "no", "na", "mais", "video", "cena", "campanha"]);
  return Array.from(new Set(normalize(value).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length >= 4 && !stop.has(word))));
}

type ProfessionalLibraryAsset = {
  id: string;
  type: "image" | "video";
  role: string;
  source: string;
  originalFilename: string;
  metadata: Record<string, unknown>;
  createdAt: string | Date | null;
};

async function realMediaPlanInputs(tenantId: string, context: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const requested = Array.isArray(context["mediaInputs"])
    ? (context["mediaInputs"] as unknown[]).map(record).filter((item) => Boolean(String(item["assetId"] ?? "").trim()))
    : [];
  const requestedIds = new Set(requested.map((item) => String(item["assetId"] ?? "").trim()));
  const result = await pool.query(
    `SELECT id, type, role, source, original_filename, metadata, created_at
       FROM media_assets
      WHERE tenant_id = $1
        AND type IN ('image', 'video')
        AND source <> 'generated'
      ORDER BY created_at DESC
      LIMIT 250`,
    [tenantId],
  );
  const assets: ProfessionalLibraryAsset[] = result.rows.map((row) => ({
    id: String(row.id),
    type: row.type === "video" ? "video" : "image",
    role: String(row.role ?? "source"),
    source: String(row.source ?? "upload"),
    originalFilename: String(row.original_filename ?? ""),
    metadata: record(row.metadata),
    createdAt: row.created_at ?? null,
  }));
  if (!assets.length) return [];

  const search = tokens([
    context["prompt"], context["campaignName"], context["channel"], context["contentType"],
  ].filter(Boolean).join(" "));
  const ranked = assets.map((asset, index) => {
    let metadataText = "";
    try { metadataText = JSON.stringify(asset.metadata); } catch {}
    const haystack = normalize(`${asset.originalFilename} ${asset.role} ${metadataText}`);
    const overlap = search.reduce((score, token) => score + (haystack.includes(token) ? 4 : 0), 0);
    const requestedBonus = requestedIds.has(asset.id) ? 100 : 0;
    const ownedBonus = asset.source === "upload" || asset.source === "imported" ? 15 : 0;
    const brollBonus = asset.role === "broll" ? 8 : 0;
    return { asset, index, score: overlap + requestedBonus + ownedBonus + brollBonus };
  }).sort((a, b) => b.score !== a.score ? b.score - a.score : a.index - b.index);

  const selectedAssets = ranked
    .slice(0, Math.min(8, Math.max(3, requestedIds.size || 6)))
    .map((item) => item.asset);
  const selectedCount = selectedAssets.length;
  return selectedAssets.map((asset, index) => ({
    assetId: asset.id,
    type: asset.type,
    role: index === 0 ? "opening" : index === selectedCount - 1 ? "closing" : asset.role === "product" ? "product" : "broll",
    importance: "preferred",
    order: index,
    note: `Mídia real da Biblioteca: ${asset.originalFilename || asset.id}`,
  }));
}

async function prepareProfessionalMediaPlanVideo(input: {
  tenantId: string;
  operation: VendorAiMediaCapability;
  context: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  if (input.operation !== "video_generate") return input.context;
  const source = String(input.context["source"] ?? "").trim().toLowerCase();
  if (source !== "media-plan") return input.context;

  const mediaInputs = await realMediaPlanInputs(input.tenantId, input.context);
  if (!mediaInputs.length) {
    throw new Error("VIDEO_PROFESSIONAL_MEDIA_REQUIRED: o roteiro está pronto, mas o tenant ainda não possui fotos/vídeos reais suficientes na Biblioteca. Adicione mídias ou produza com um Dublê validado no Vídeo Studio Profissional.");
  }
  const currentEffects = record(input.context["effects"]);
  return {
    ...input.context,
    generationMode: "media_only",
    mediaInputs,
    professionalProduction: true,
    professionalPolicy: "real_media_first",
    effects: {
      ...currentEffects,
      preset: "clean",
      intensity: "soft",
      transition: "smooth",
      motion: "drift",
      color: "natural",
      grain: false,
      vignette: false,
      sharpen: true,
      sfx: "none",
    },
  };
}

export async function createVendorAiMediaGenerationJob(input: {
  tenantId: string; userId?: string | null; title: string; operation: VendorAiMediaCapability; context?: Record<string, unknown>;
}) {
  const initialContext = input.context ?? {};
  const context = await prepareProfessionalMediaPlanVideo({ tenantId: input.tenantId, operation: input.operation, context: initialContext });

  if (input.operation === "photo_video") {
    const rawFormat = String(context["format"] ?? "16:9");
    const format = rawFormat === "9:16" || rawFormat === "1:1" ? rawFormat : "16:9";
    return startVendorAiPhotoVideo({ tenantId: input.tenantId, userId: input.userId ?? null, title: input.title, assetIds: stringArray(context["assetIds"]), secondsPerImage: Number(context["secondsPerImage"] ?? 3), format });
  }
  if (input.operation === "media_batch") {
    return startVendorAiMediaBatch({ tenantId: input.tenantId, userId: input.userId ?? null, title: input.title, items: mediaBatchItems(context["items"]) });
  }
  if (["image_remove_background", "image_variations", "image_replace_background", "image_remove_object", "image_outpaint"].includes(input.operation)) {
    const rawSize = String(context["size"] ?? "1024x1024");
    const size = rawSize === "1024x1536" || rawSize === "1536x1024" ? rawSize : "1024x1024";
    return startVendorAiAiImageTool({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      title: input.title,
      assetId: String(context["assetId"] ?? ""),
      operation: input.operation as "image_remove_background" | "image_variations" | "image_replace_background" | "image_remove_object" | "image_outpaint",
      prompt: typeof context["prompt"] === "string" ? context["prompt"] : undefined,
      count: Number(context["count"] ?? 2),
      size,
    });
  }
  if (input.operation === "music_generate") {
    return generateVendorAiMusic({ tenantId: input.tenantId, userId: input.userId ?? null, title: input.title, prompt: String(context["prompt"] ?? ""), durationSeconds: Number(context["durationSeconds"] ?? 30), style: optionalString(context["style"]), mood: optionalString(context["mood"]), energy: optionalString(context["energy"]), instrumental: context["instrumental"] !== false });
  }
  if (input.operation === "avatar_lipsync") {
    return generateVendorAiLipSync({ tenantId: input.tenantId, userId: input.userId ?? null, title: input.title, identityId: String(context["identityId"] ?? ""), audioAssetId: String(context["audioAssetId"] ?? ""), bboxShift: Number(context["bboxShift"] ?? 0) });
  }

  const projectId = await createProcessingMediaProject({ tenantId: input.tenantId, userId: input.userId ?? null, title: input.title, operation: input.operation, context: { ...context, engine: "vendorai", externalAvatarProvider: false } });
  const jobId = randomUUID();
  await createMediaJob({ id: jobId, tenantId: input.tenantId, projectId, operation: input.operation, provider: "vendorai", input: { ...context, userId: input.userId ?? null, title: input.title }, snapshot: { status: "running", progress: 0 } });
  return { projectId, jobId };
}
