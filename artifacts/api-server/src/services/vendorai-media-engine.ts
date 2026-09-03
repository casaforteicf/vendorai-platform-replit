import { randomUUID } from "crypto";
import { createMediaJob } from "./media-jobs.js";
import { createProcessingMediaProject } from "./media-library.js";

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
  | "video_generate";

export interface VendorAiMediaEngineCapabilities {
  provider: "vendorai";
  externalAvatarProviderRequired: false;
  capabilities: Record<VendorAiMediaCapability, "ready" | "building">;
}

async function workerHealthReady(url: string | undefined, kind: "voice" | "lipsync" | "music"): Promise<boolean> {
  if (!url) return false;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return false;
    const health = await response.json() as Record<string, unknown>;
    if (kind === "lipsync" || kind === "music") return health["ready"] === true;
    return health["status"] === "ok" && (health["cudaAvailable"] === true || health["device"] === "cpu");
  } catch {
    return false;
  }
}

export const vendorAiMediaEngineCapabilities: VendorAiMediaEngineCapabilities = {
  provider: "vendorai",
  externalAvatarProviderRequired: false,
  capabilities: {
    video_edit: "ready",
    video_clips: "ready",
    video_caption: "ready",
    video_batch: "building",
    video_compose: "ready",
    voice_profile: "ready",
    voice_synthesize: "building",
    persona_profile: "ready",
    avatar_lipsync: "building",
    music_generate: "building",
    video_generate: "building",
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
const workerHealthTimer = setInterval(() => {
  void refreshVendorAiWorkerCapabilities();
}, 30_000);
workerHealthTimer.unref?.();

export async function createVendorAiMediaGenerationJob(input: {
  tenantId: string;
  userId?: string | null;
  title: string;
  operation: VendorAiMediaCapability;
  context?: Record<string, unknown>;
}) {
  const projectId = await createProcessingMediaProject({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title,
    operation: input.operation,
    context: {
      ...(input.context ?? {}),
      engine: "vendorai",
      externalAvatarProvider: false,
    },
  });

  const jobId = randomUUID();
  await createMediaJob({
    id: jobId,
    tenantId: input.tenantId,
    projectId,
    operation: input.operation,
    provider: "vendorai",
    input: {
      ...(input.context ?? {}),
      userId: input.userId ?? null,
      title: input.title,
    },
    snapshot: { status: "running", progress: 0 },
  });

  return { projectId, jobId };
}
