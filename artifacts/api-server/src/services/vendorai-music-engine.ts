import { randomUUID } from "crypto";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { createMediaJob, updateMediaJob } from "./media-jobs.js";
import {
  createProcessingMediaProject,
  registerGeneratedMediaOutput,
  setMediaProjectStatus,
} from "./media-library.js";
import { normalizeMediaAudioRights } from "./media-rights.js";

const objectStorage = new ObjectStorageService();

export class MusicEngineNotReadyError extends Error {}
export class MusicGenerationInputError extends Error {}

function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(5, Math.min(90, Math.round(value)));
}

function generatedMusicRights(userId?: string | null) {
  return normalizeMediaAudioRights({
    status: "cleared",
    origin: "generated",
    commercialUse: true,
    paidAds: true,
    territories: ["*"],
    expiresAt: null,
    attributionRequired: false,
    attributionText: null,
    licenseReference: "VendorAI generated music — ACE-Step Apache-2.0 engine",
    evidenceAssetId: null,
    updatedAt: new Date().toISOString(),
    updatedByUserId: userId ?? null,
  });
}

export async function generateVendorAiMusic(input: {
  tenantId: string;
  userId?: string | null;
  prompt: string;
  title?: string;
  durationSeconds?: number;
  style?: string | null;
  mood?: string | null;
  energy?: string | null;
  instrumental?: boolean;
}): Promise<{
  projectId: string;
  jobId: string;
  audioUrl: string;
  assetId: string;
  versionId: string;
  rights: ReturnType<typeof generatedMusicRights>;
}> {
  const workerUrl = process.env["VENDORAI_MUSIC_WORKER_URL"]?.replace(/\/$/, "");
  if (!workerUrl) {
    throw new MusicEngineNotReadyError("Music worker do VendorAI ainda não está configurado");
  }

  const prompt = input.prompt.trim();
  if (!prompt || prompt.length > 1500) {
    throw new MusicGenerationInputError("prompt é obrigatório e deve ter até 1500 caracteres");
  }

  const durationSeconds = clampDuration(input.durationSeconds ?? 30);
  const instrumental = input.instrumental !== false;
  const rights = generatedMusicRights(input.userId);
  const projectId = await createProcessingMediaProject({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title?.trim() || "Trilha gerada com IA",
    kind: "audio",
    operation: "music_generate",
    context: {
      prompt,
      durationSeconds,
      style: input.style ?? null,
      mood: input.mood ?? null,
      energy: input.energy ?? null,
      instrumental,
      engine: "vendorai",
      modelFamily: "ace-step",
    },
  });

  const jobId = randomUUID();
  await createMediaJob({
    id: jobId,
    tenantId: input.tenantId,
    projectId,
    operation: "music_generate",
    provider: "vendorai",
    input: {
      prompt,
      durationSeconds,
      style: input.style ?? null,
      mood: input.mood ?? null,
      energy: input.energy ?? null,
      instrumental,
    },
    snapshot: { status: "running", progress: 5 },
  });

  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const workerSecret = process.env["VENDORAI_MUSIC_WORKER_SECRET"];
    if (workerSecret) headers["x-vendorai-worker-secret"] = workerSecret;

    await updateMediaJob(jobId, input.tenantId, { status: "running", progress: 20 });
    const response = await fetch(`${workerUrl}/v1/music/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jobId,
        prompt,
        durationSeconds,
        style: input.style ?? null,
        mood: input.mood ?? null,
        energy: input.energy ?? null,
        instrumental,
      }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 600);
      throw new Error(`Music worker respondeu ${response.status}: ${detail}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    if (!audioBuffer.length) throw new Error("Music worker retornou áudio vazio");

    await updateMediaJob(jobId, input.tenantId, { status: "running", progress: 80 });
    const audioUrl = await objectStorage.savePrivateBuffer(audioBuffer, "audio/wav", `music-${jobId}.wav`);
    const metadata = {
      prompt,
      durationSeconds,
      style: input.style ?? null,
      mood: input.mood ?? null,
      energy: input.energy ?? null,
      instrumental,
      engine: "vendorai",
      modelFamily: "ace-step",
      rights,
    };
    const registered = await registerGeneratedMediaOutput({
      tenantId: input.tenantId,
      projectId,
      userId: input.userId ?? null,
      storageUrl: audioUrl,
      mimeType: "audio/wav",
      type: "audio",
      originalFilename: `music-${jobId}.wav`,
      operation: "music_generate",
      label: "Trilha gerada com IA",
      metadata,
    });

    await pool.query(
      `UPDATE media_assets
          SET role = 'music', metadata = $4::jsonb
        WHERE tenant_id = $1 AND project_id = $2 AND id = $3`,
      [input.tenantId, projectId, registered.assetId, JSON.stringify(metadata)],
    );
    await updateMediaJob(jobId, input.tenantId, {
      status: "done",
      progress: 100,
      audioUrl,
      assetId: registered.assetId,
      versionId: registered.versionId,
    });

    return { projectId, jobId, audioUrl, ...registered, rights };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na geração musical";
    await updateMediaJob(jobId, input.tenantId, { status: "error", error: message }).catch(() => undefined);
    await setMediaProjectStatus(input.tenantId, projectId, "draft").catch(() => undefined);
    throw error;
  }
}
