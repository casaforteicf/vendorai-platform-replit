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
  | "persona_profile"
  | "avatar_lipsync"
  | "video_generate";

export interface VendorAiMediaEngineCapabilities {
  provider: "vendorai";
  externalAvatarProviderRequired: false;
  capabilities: Record<VendorAiMediaCapability, "ready" | "building">;
}

export const vendorAiMediaEngineCapabilities: VendorAiMediaEngineCapabilities = {
  provider: "vendorai",
  externalAvatarProviderRequired: false,
  capabilities: {
    video_edit: "ready",
    video_clips: "ready",
    video_caption: "ready",
    video_batch: "building",
    video_compose: "building",
    voice_profile: "building",
    persona_profile: "building",
    avatar_lipsync: "building",
    video_generate: "building",
  },
};

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
    input: input.context ?? {},
    snapshot: { status: "running", progress: 0 },
  });

  return { projectId, jobId };
}
