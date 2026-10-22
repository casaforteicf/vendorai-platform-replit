import { randomUUID } from "crypto";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { createMediaJob, updateMediaJob } from "./media-jobs.js";
import {
  createProcessingMediaProject,
  registerGeneratedMediaOutput,
  setMediaProjectStatus,
} from "./media-library.js";

const objectStorage = new ObjectStorageService();

export class LipSyncEngineNotReadyError extends Error {}
export class LipSyncConsentError extends Error {
  constructor(public readonly missingScopes: string[]) {
    super(`Consentimentos ausentes: ${missingScopes.join(", ")}`);
  }
}
export class LipSyncInputError extends Error {}

export function isVendorAiLipSyncWorkerConfigured(): boolean {
  return Boolean(process.env["VENDORAI_LIPSYNC_WORKER_URL"]);
}

async function assertLipSyncConsent(tenantId: string, identityId: string): Promise<void> {
  const scopes = ["face_use", "ai_generation"];
  const checks = await Promise.all(scopes.map(async (scope) => {
    const result = await pool.query(
      `SELECT media_identity_has_active_consent($1, $2, $3) AS authorized`,
      [tenantId, identityId, scope],
    );
    return { scope, authorized: result.rows[0]?.authorized === true };
  }));
  const missing = checks.filter((item) => !item.authorized).map((item) => item.scope);
  if (missing.length) throw new LipSyncConsentError(missing);
}

async function loadInputs(tenantId: string, identityId: string, audioAssetId: string, faceAssetId?: string | null) {
  const identityResult = await pool.query(
    `SELECT status, face_reference_asset_id
       FROM media_identities
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1`,
    [tenantId, identityId],
  );
  const identity = identityResult.rows[0] as Record<string, unknown> | undefined;
  if (!identity) throw new LipSyncInputError("Identidade audiovisual não encontrada");
  if (identity["status"] !== "active") throw new LipSyncInputError("A identidade precisa estar ativa");

  const selectedFaceAssetId = faceAssetId?.trim() || String(identity["face_reference_asset_id"] ?? "");
  if (!selectedFaceAssetId) throw new LipSyncInputError("A identidade precisa de uma foto de referência");

  const faceResult = await pool.query(
    `SELECT storage_url, mime_type, original_filename
       FROM media_assets
      WHERE tenant_id = $1 AND id = $2 AND type = 'image'
      LIMIT 1`,
    [tenantId, selectedFaceAssetId],
  );
  const face = faceResult.rows[0] as Record<string, unknown> | undefined;
  if (!face || typeof face["storage_url"] !== "string" || !face["storage_url"]) {
    throw new LipSyncInputError("Imagem de referência não encontrada na Biblioteca Audiovisual");
  }

  const audioResult = await pool.query(
    `SELECT storage_url, mime_type, original_filename
       FROM media_assets
      WHERE tenant_id = $1 AND id = $2 AND type = 'audio'
      LIMIT 1`,
    [tenantId, audioAssetId],
  );
  const audio = audioResult.rows[0] as Record<string, unknown> | undefined;
  if (!audio || typeof audio["storage_url"] !== "string" || !audio["storage_url"]) {
    throw new LipSyncInputError("Áudio de origem não encontrado na Biblioteca Audiovisual");
  }

  return {
    faceAssetId: selectedFaceAssetId,
    face: {
      storageUrl: String(face["storage_url"]),
      mimeType: typeof face["mime_type"] === "string" ? face["mime_type"] : "image/jpeg",
      filename: typeof face["original_filename"] === "string" ? face["original_filename"] : "face-reference.jpg",
    },
    audio: {
      storageUrl: String(audio["storage_url"]),
      mimeType: typeof audio["mime_type"] === "string" ? audio["mime_type"] : "audio/wav",
      filename: typeof audio["original_filename"] === "string" ? audio["original_filename"] : "speech.wav",
    },
  };
}

export async function generateVendorAiLipSync(input: {
  tenantId: string;
  userId?: string | null;
  identityId: string;
  audioAssetId: string;
  faceAssetId?: string | null;
  title?: string;
  bboxShift?: number;
}): Promise<{ projectId: string; jobId: string; videoUrl: string; assetId: string; versionId: string }> {
  const workerUrl = process.env["VENDORAI_LIPSYNC_WORKER_URL"]?.replace(/\/$/, "");
  if (!workerUrl) throw new LipSyncEngineNotReadyError("Lip-sync worker do VendorAI ainda não está configurado");

  await assertLipSyncConsent(input.tenantId, input.identityId);
  const sources = await loadInputs(input.tenantId, input.identityId, input.audioAssetId, input.faceAssetId);
  const bboxShift = Number.isFinite(input.bboxShift) ? Math.max(-20, Math.min(20, Number(input.bboxShift))) : 0;

  const projectId = await createProcessingMediaProject({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title ?? "Vídeo com pessoa autorizada",
    kind: "video",
    operation: "avatar_lipsync",
    context: {
      identityId: input.identityId,
      audioAssetId: input.audioAssetId,
      faceAssetId: sources.faceAssetId,
      bboxShift,
      engine: "vendorai",
    },
  });
  const jobId = randomUUID();
  await createMediaJob({
    id: jobId,
    tenantId: input.tenantId,
    projectId,
    operation: "avatar_lipsync",
    provider: "vendorai",
    input: {
      identityId: input.identityId,
      audioAssetId: input.audioAssetId,
      faceAssetId: sources.faceAssetId,
      bboxShift,
    },
    snapshot: { status: "running", progress: 5 },
  });

  try {
    const [faceFile, audioFile] = await Promise.all([
      objectStorage.getObjectEntityFile(sources.face.storageUrl),
      objectStorage.getObjectEntityFile(sources.audio.storageUrl),
    ]);
    const [[faceBuffer], [audioBuffer]] = await Promise.all([
      faceFile.download(),
      audioFile.download(),
    ]);

    const form = new FormData();
    form.append("job_id", jobId);
    form.append("bbox_shift", String(bboxShift));
    form.append("source_face", new Blob([new Uint8Array(faceBuffer)], { type: sources.face.mimeType }), sources.face.filename);
    form.append("audio", new Blob([new Uint8Array(audioBuffer)], { type: sources.audio.mimeType }), sources.audio.filename);

    const headers: Record<string, string> = {};
    const secret = process.env["VENDORAI_LIPSYNC_WORKER_SECRET"];
    if (secret) headers["x-vendorai-worker-secret"] = secret;

    await updateMediaJob(jobId, input.tenantId, { status: "running", progress: 25 });
    const response = await fetch(`${workerUrl}/v1/lipsync/generate`, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(900_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 800);
      throw new Error(`Lip-sync worker respondeu ${response.status}: ${detail}`);
    }

    const videoBuffer = Buffer.from(await response.arrayBuffer());
    if (!videoBuffer.length) throw new Error("Lip-sync worker retornou vídeo vazio");

    await updateMediaJob(jobId, input.tenantId, { status: "running", progress: 85 });
    const videoUrl = await objectStorage.savePrivateBuffer(videoBuffer, "video/mp4", `lipsync-${jobId}.mp4`);
    const registered = await registerGeneratedMediaOutput({
      tenantId: input.tenantId,
      projectId,
      userId: input.userId ?? null,
      storageUrl: videoUrl,
      mimeType: "video/mp4",
      type: "video",
      originalFilename: `lipsync-${jobId}.mp4`,
      operation: "avatar_lipsync",
      label: "Pessoa autorizada — lip-sync",
      metadata: {
        identityId: input.identityId,
        audioAssetId: input.audioAssetId,
        faceAssetId: sources.faceAssetId,
        styledFaceReference: Boolean(input.faceAssetId),
        bboxShift,
        engine: "vendorai",
      },
    });
    await updateMediaJob(jobId, input.tenantId, { status: "done", progress: 100, videoUrl });
    return { projectId, jobId, videoUrl, ...registered };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no lip-sync";
    await updateMediaJob(jobId, input.tenantId, { status: "error", error: message });
    await setMediaProjectStatus(input.tenantId, projectId, "draft");
    throw error;
  }
}
