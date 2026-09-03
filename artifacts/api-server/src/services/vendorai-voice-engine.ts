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

export class VoiceEngineNotReadyError extends Error {}
export class VoiceConsentError extends Error {
  constructor(public readonly missingScopes: string[]) {
    super(`Consentimentos ausentes: ${missingScopes.join(", ")}`);
  }
}
export class VoiceProfileInvalidError extends Error {}

export function isVendorAiVoiceWorkerConfigured(): boolean {
  return Boolean(process.env["VENDORAI_MEDIA_WORKER_URL"]);
}

async function assertVoiceConsent(tenantId: string, identityId: string): Promise<void> {
  const scopes = ["voice_use", "ai_generation"];
  const checks = await Promise.all(scopes.map(async (scope) => {
    const result = await pool.query(
      `SELECT media_identity_has_active_consent($1, $2, $3) AS authorized`,
      [tenantId, identityId, scope],
    );
    return { scope, authorized: result.rows[0]?.authorized === true };
  }));
  const missing = checks.filter((item) => !item.authorized).map((item) => item.scope);
  if (missing.length) throw new VoiceConsentError(missing);
}

async function loadVoiceReference(tenantId: string, identityId: string, voiceProfileId: string) {
  const result = await pool.query(
    `SELECT
       v.id,
       v.status,
       v.reference_asset_id,
       v.model_config,
       i.status AS identity_status,
       a.storage_url,
       a.mime_type,
       a.original_filename
     FROM media_voice_profiles v
     JOIN media_identities i
       ON i.id = v.identity_id AND i.tenant_id = v.tenant_id
     LEFT JOIN media_assets a
       ON a.id = v.reference_asset_id AND a.tenant_id = v.tenant_id
     WHERE v.tenant_id = $1 AND v.identity_id = $2 AND v.id = $3
     LIMIT 1`,
    [tenantId, identityId, voiceProfileId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new VoiceProfileInvalidError("Perfil de voz não encontrado");
  if (row["identity_status"] !== "active") {
    throw new VoiceProfileInvalidError("A identidade precisa estar ativa");
  }
  if (row["status"] !== "ready") {
    throw new VoiceProfileInvalidError("O perfil de voz precisa estar pronto");
  }
  if (typeof row["storage_url"] !== "string" || !row["storage_url"]) {
    throw new VoiceProfileInvalidError("O perfil de voz precisa de um áudio de referência");
  }
  return {
    storageUrl: String(row["storage_url"]),
    mimeType: typeof row["mime_type"] === "string" ? row["mime_type"] : "audio/wav",
    originalFilename: typeof row["original_filename"] === "string" ? row["original_filename"] : "voice-reference.wav",
    modelConfig: row["model_config"] && typeof row["model_config"] === "object" ? row["model_config"] as Record<string, unknown> : {},
  };
}

export async function synthesizeVendorAiVoice(input: {
  tenantId: string;
  userId?: string | null;
  identityId: string;
  voiceProfileId: string;
  text: string;
  language?: string;
  title?: string;
}): Promise<{ projectId: string; jobId: string; audioUrl: string; assetId: string; versionId: string }> {
  const workerUrl = process.env["VENDORAI_MEDIA_WORKER_URL"]?.replace(/\/$/, "");
  if (!workerUrl) throw new VoiceEngineNotReadyError("Voice worker do VendorAI ainda não está configurado");

  await assertVoiceConsent(input.tenantId, input.identityId);
  const reference = await loadVoiceReference(input.tenantId, input.identityId, input.voiceProfileId);

  const projectId = await createProcessingMediaProject({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title ?? "Síntese de voz",
    kind: "audio",
    operation: "voice_synthesize",
    context: {
      identityId: input.identityId,
      voiceProfileId: input.voiceProfileId,
      language: input.language ?? "pt-br",
      engine: "vendorai",
    },
  });
  const jobId = randomUUID();
  await createMediaJob({
    id: jobId,
    tenantId: input.tenantId,
    projectId,
    operation: "voice_synthesize",
    provider: "vendorai",
    input: {
      identityId: input.identityId,
      voiceProfileId: input.voiceProfileId,
      language: input.language ?? "pt-br",
      textLength: input.text.length,
    },
    snapshot: { status: "running", progress: 5 },
  });

  try {
    const referenceFile = await objectStorage.getObjectEntityFile(reference.storageUrl);
    const [referenceBuffer] = await referenceFile.download();
    const form = new FormData();
    form.append("job_id", jobId);
    form.append("text", input.text);
    form.append("language", input.language ?? "pt-br");
    form.append("model_config", JSON.stringify(reference.modelConfig));
    form.append("reference_audio", new Blob([referenceBuffer], { type: reference.mimeType }), reference.originalFilename);

    const headers: Record<string, string> = {};
    const workerSecret = process.env["VENDORAI_MEDIA_WORKER_SECRET"];
    if (workerSecret) headers["x-vendorai-worker-secret"] = workerSecret;

    await updateMediaJob(jobId, input.tenantId, { status: "running", progress: 25 });
    const response = await fetch(`${workerUrl}/v1/voice/synthesize`, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Voice worker respondeu ${response.status}: ${detail}`);
    }
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    if (!audioBuffer.length) throw new Error("Voice worker retornou áudio vazio");

    await updateMediaJob(jobId, input.tenantId, { status: "running", progress: 80 });
    const audioUrl = await objectStorage.savePrivateBuffer(audioBuffer, "audio/wav", `voice-${jobId}.wav`);
    const registered = await registerGeneratedMediaOutput({
      tenantId: input.tenantId,
      projectId,
      userId: input.userId ?? null,
      storageUrl: audioUrl,
      mimeType: "audio/wav",
      type: "audio",
      originalFilename: `voice-${jobId}.wav`,
      operation: "voice_synthesize",
      label: "Voz sintetizada",
      metadata: {
        identityId: input.identityId,
        voiceProfileId: input.voiceProfileId,
        language: input.language ?? "pt-br",
        engine: "vendorai",
      },
    });
    await updateMediaJob(jobId, input.tenantId, { status: "done", progress: 100, audioUrl });
    return { projectId, jobId, audioUrl, ...registered };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na síntese de voz";
    await updateMediaJob(jobId, input.tenantId, { status: "error", error: message });
    await setMediaProjectStatus(input.tenantId, projectId, "draft");
    throw error;
  }
}
