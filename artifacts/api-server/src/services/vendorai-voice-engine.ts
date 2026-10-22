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

export type VoiceSelectionMatch =
  | "preferred_exact_locale"
  | "exact_locale"
  | "preferred_same_language"
  | "same_language_fallback"
  | "preferred_generic_fallback"
  | "primary_generic_fallback"
  | "first_ready_fallback";

export type VoiceSelectionResult = {
  requestedVoiceProfileId: string;
  voiceProfileId: string;
  requestedLocale: string;
  selectedLocale: string | null;
  selectedMarket: string | null;
  match: VoiceSelectionMatch;
  warning: string | null;
};

type VoiceCandidate = {
  id: string;
  metadata: Record<string, unknown>;
  updatedAt: Date | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLocale(value: string | undefined | null): string {
  return (value ?? "pt-br").trim().replace(/_/g, "-").toLowerCase();
}

function localeLanguage(locale: string | null): string | null {
  if (!locale) return null;
  const normalized = normalizeLocale(locale);
  return normalized.split("-")[0] || null;
}

function candidateLocale(candidate: VoiceCandidate): string | null {
  const locale = metadataString(candidate.metadata, "locale");
  return locale ? normalizeLocale(locale) : null;
}

function candidateMarket(candidate: VoiceCandidate): string | null {
  return metadataString(candidate.metadata, "market") ?? metadataString(candidate.metadata, "country");
}

function candidatePrimary(candidate: VoiceCandidate): boolean {
  return candidate.metadata["primary"] === true;
}

function sameSpanishAccentFamily(requestedLocale: string, candidateLocaleValue: string | null): boolean {
  if (!candidateLocaleValue) return false;
  const voseoLocales = new Set(["es-ar", "es-uy", "es-py"]);
  return voseoLocales.has(requestedLocale) && voseoLocales.has(candidateLocaleValue);
}

function candidateScore(candidate: VoiceCandidate, requestedLocale: string): number {
  const locale = candidateLocale(candidate);
  const requestedLanguage = localeLanguage(requestedLocale);
  const language = localeLanguage(locale);
  let score = 0;

  if (locale === requestedLocale) score += 1000;
  else if (requestedLanguage && language === requestedLanguage) {
    score += 500;
    if (sameSpanishAccentFamily(requestedLocale, locale)) score += 120;
    if (requestedLocale === "es-bo" && locale === "es-py") score += 40;
  }

  if (candidatePrimary(candidate)) score += 20;
  const updatedAt = candidate.updatedAt?.getTime() ?? 0;
  score += Math.min(10, Math.max(0, Math.floor(updatedAt / 1_000_000_000_000)));
  return score;
}

async function listReadyVoiceCandidates(tenantId: string, identityId: string): Promise<VoiceCandidate[]> {
  const result = await pool.query(
    `SELECT id, metadata, updated_at
       FROM media_voice_profiles
      WHERE tenant_id = $1
        AND identity_id = $2
        AND status = 'ready'
        AND reference_asset_id IS NOT NULL
      ORDER BY updated_at DESC, created_at DESC`,
    [tenantId, identityId],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    metadata: asRecord(row.metadata),
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  }));
}

export async function resolveVendorAiVoiceProfile(input: {
  tenantId: string;
  identityId: string;
  preferredVoiceProfileId: string;
  language?: string;
}): Promise<VoiceSelectionResult> {
  const requestedLocale = normalizeLocale(input.language);
  const candidates = await listReadyVoiceCandidates(input.tenantId, input.identityId);

  if (!candidates.length) {
    return {
      requestedVoiceProfileId: input.preferredVoiceProfileId,
      voiceProfileId: input.preferredVoiceProfileId,
      requestedLocale,
      selectedLocale: null,
      selectedMarket: null,
      match: "preferred_generic_fallback",
      warning: null,
    };
  }

  const preferred = candidates.find((candidate) => candidate.id === input.preferredVoiceProfileId) ?? null;
  const preferredLocale = preferred ? candidateLocale(preferred) : null;
  const requestedLanguage = localeLanguage(requestedLocale);

  if (preferred && preferredLocale === requestedLocale) {
    return {
      requestedVoiceProfileId: input.preferredVoiceProfileId,
      voiceProfileId: preferred.id,
      requestedLocale,
      selectedLocale: preferredLocale,
      selectedMarket: candidateMarket(preferred),
      match: "preferred_exact_locale",
      warning: null,
    };
  }

  const exact = candidates.find((candidate) => candidateLocale(candidate) === requestedLocale) ?? null;
  if (exact) {
    return {
      requestedVoiceProfileId: input.preferredVoiceProfileId,
      voiceProfileId: exact.id,
      requestedLocale,
      selectedLocale: candidateLocale(exact),
      selectedMarket: candidateMarket(exact),
      match: "exact_locale",
      warning: preferred
        ? `A voz selecionada manualmente não corresponde a ${requestedLocale}; o VendorAI usou automaticamente a referência exata deste mercado.`
        : null,
    };
  }

  if (preferred && preferredLocale && localeLanguage(preferredLocale) === requestedLanguage) {
    return {
      requestedVoiceProfileId: input.preferredVoiceProfileId,
      voiceProfileId: preferred.id,
      requestedLocale,
      selectedLocale: preferredLocale,
      selectedMarket: candidateMarket(preferred),
      match: "preferred_same_language",
      warning: `Não existe uma referência exata em ${requestedLocale}; usando ${preferredLocale} como fallback do mesmo idioma.`,
    };
  }

  const sameLanguage = candidates
    .filter((candidate) => localeLanguage(candidateLocale(candidate)) === requestedLanguage)
    .sort((left, right) => candidateScore(right, requestedLocale) - candidateScore(left, requestedLocale))[0] ?? null;

  if (sameLanguage) {
    const selectedLocale = candidateLocale(sameLanguage);
    return {
      requestedVoiceProfileId: input.preferredVoiceProfileId,
      voiceProfileId: sameLanguage.id,
      requestedLocale,
      selectedLocale,
      selectedMarket: candidateMarket(sameLanguage),
      match: "same_language_fallback",
      warning: selectedLocale
        ? `Não existe uma referência exata em ${requestedLocale}; usando ${selectedLocale}, a opção compatível mais próxima disponível.`
        : `Não existe uma referência exata em ${requestedLocale}; usando uma voz disponível do mesmo idioma.`,
    };
  }

  if (preferred) {
    return {
      requestedVoiceProfileId: input.preferredVoiceProfileId,
      voiceProfileId: preferred.id,
      requestedLocale,
      selectedLocale: preferredLocale,
      selectedMarket: candidateMarket(preferred),
      match: "preferred_generic_fallback",
      warning: preferredLocale
        ? `Não há voz no idioma ${requestedLanguage ?? requestedLocale}; usando a voz preferida ${preferredLocale} como fallback.`
        : `Não há voz no idioma ${requestedLanguage ?? requestedLocale}; usando a voz preferida disponível como fallback.`,
    };
  }

  const primary = candidates.find(candidatePrimary) ?? null;
  const fallback = primary ?? candidates[0];
  const selectedLocale = candidateLocale(fallback);
  return {
    requestedVoiceProfileId: input.preferredVoiceProfileId,
    voiceProfileId: fallback.id,
    requestedLocale,
    selectedLocale,
    selectedMarket: candidateMarket(fallback),
    match: primary ? "primary_generic_fallback" : "first_ready_fallback",
    warning: selectedLocale
      ? `Não há voz no idioma ${requestedLanguage ?? requestedLocale}; usando ${selectedLocale} como fallback disponível.`
      : `Não há voz no idioma ${requestedLanguage ?? requestedLocale}; usando o perfil de voz disponível.`,
  };
}

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
       v.metadata,
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
    metadata: asRecord(row["metadata"]),
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
}): Promise<{
  projectId: string;
  jobId: string;
  audioUrl: string;
  assetId: string;
  versionId: string;
  voiceProfileId: string;
  requestedVoiceProfileId: string;
  voiceSelection: VoiceSelectionResult;
}> {
  const workerUrl = process.env["VENDORAI_MEDIA_WORKER_URL"]?.replace(/\/$/, "");
  if (!workerUrl) throw new VoiceEngineNotReadyError("Voice worker do VendorAI ainda não está configurado");

  await assertVoiceConsent(input.tenantId, input.identityId);
  const selection = await resolveVendorAiVoiceProfile({
    tenantId: input.tenantId,
    identityId: input.identityId,
    preferredVoiceProfileId: input.voiceProfileId,
    language: input.language,
  });
  const reference = await loadVoiceReference(input.tenantId, input.identityId, selection.voiceProfileId);

  const projectId = await createProcessingMediaProject({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title ?? "Síntese de voz",
    kind: "audio",
    operation: "voice_synthesize",
    context: {
      identityId: input.identityId,
      requestedVoiceProfileId: input.voiceProfileId,
      voiceProfileId: selection.voiceProfileId,
      language: input.language ?? "pt-br",
      voiceSelection: selection,
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
      requestedVoiceProfileId: input.voiceProfileId,
      voiceProfileId: selection.voiceProfileId,
      language: input.language ?? "pt-br",
      voiceSelection: selection,
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
    form.append("reference_audio", new Blob([new Uint8Array(referenceBuffer)], { type: reference.mimeType }), reference.originalFilename);

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
        requestedVoiceProfileId: input.voiceProfileId,
        voiceProfileId: selection.voiceProfileId,
        requestedLocale: selection.requestedLocale,
        selectedLocale: selection.selectedLocale,
        selectedMarket: selection.selectedMarket,
        voiceSelectionMatch: selection.match,
        voiceSelectionWarning: selection.warning,
        language: input.language ?? "pt-br",
        engine: "vendorai",
      },
    });
    await updateMediaJob(jobId, input.tenantId, { status: "done", progress: 100, audioUrl });
    return {
      projectId,
      jobId,
      audioUrl,
      ...registered,
      voiceProfileId: selection.voiceProfileId,
      requestedVoiceProfileId: input.voiceProfileId,
      voiceSelection: selection,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na síntese de voz";
    await updateMediaJob(jobId, input.tenantId, { status: "error", error: message });
    await setMediaProjectStatus(input.tenantId, projectId, "draft");
    throw error;
  }
}


export async function resolveDefaultVendorAiVoice(input: {
  tenantId: string;
  language?: string;
}): Promise<{ identityId: string; voiceProfileId: string; displayName: string } | null> {
  const requestedLocale = normalizeLocale(input.language);
  const requestedLanguage = localeLanguage(requestedLocale);

  const result = await pool.query(
    `SELECT
       i.id AS identity_id,
       i.display_name,
       v.id AS voice_profile_id,
       v.metadata,
       v.updated_at
     FROM media_identities i
     JOIN media_voice_profiles v
       ON v.identity_id = i.id
      AND v.tenant_id = i.tenant_id
     WHERE i.tenant_id = $1
       AND i.status = 'active'
       AND v.status = 'ready'
       AND v.provider = 'vendorai'
       AND v.reference_asset_id IS NOT NULL
       AND media_identity_has_active_consent(i.tenant_id, i.id, 'voice_use') = true
       AND media_identity_has_active_consent(i.tenant_id, i.id, 'ai_generation') = true
     ORDER BY
       CASE
         WHEN LOWER(REPLACE(COALESCE(v.metadata->>'locale',''), '_', '-')) = $2 THEN 0
         WHEN SPLIT_PART(LOWER(REPLACE(COALESCE(v.metadata->>'locale',''), '_', '-')), '-', 1) = $3 THEN 1
         WHEN COALESCE((v.metadata->>'primary')::boolean, false) = true THEN 2
         ELSE 3
       END,
       v.updated_at DESC
     LIMIT 1`,
    [input.tenantId, requestedLocale, requestedLanguage ?? requestedLocale],
  );

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    identityId: String(row["identity_id"]),
    voiceProfileId: String(row["voice_profile_id"]),
    displayName: String(row["display_name"] ?? "Dublê"),
  };
}

export async function createVendorAiVoiceStream(input: {
  tenantId: string;
  identityId: string;
  voiceProfileId: string;
  text: string;
  language?: string;
}): Promise<{
  response: globalThis.Response;
  jobId: string;
  voiceSelection: VoiceSelectionResult;
}> {
  const workerUrl = process.env["VENDORAI_MEDIA_WORKER_URL"]?.replace(/\/$/, "");
  if (!workerUrl) throw new VoiceEngineNotReadyError("Voice worker do VendorAI ainda não está configurado");

  await assertVoiceConsent(input.tenantId, input.identityId);
  const selection = await resolveVendorAiVoiceProfile({
    tenantId: input.tenantId,
    identityId: input.identityId,
    preferredVoiceProfileId: input.voiceProfileId,
    language: input.language,
  });
  const reference = await loadVoiceReference(input.tenantId, input.identityId, selection.voiceProfileId);
  const referenceFile = await objectStorage.getObjectEntityFile(reference.storageUrl);
  const [referenceBuffer] = await referenceFile.download();

  const jobId = randomUUID();
  const form = new FormData();
  form.append("job_id", jobId);
  form.append("text", input.text);
  form.append("language", input.language ?? "pt-br");
  form.append("model_config", JSON.stringify(reference.modelConfig));
  form.append("reference_audio", new Blob([new Uint8Array(referenceBuffer)], { type: reference.mimeType }), reference.originalFilename);

  const headers: Record<string, string> = {};
  const workerSecret = process.env["VENDORAI_MEDIA_WORKER_SECRET"];
  if (workerSecret) headers["x-vendorai-worker-secret"] = workerSecret;

  const response = await fetch(`${workerUrl}/v1/voice/stream`, {
    method: "POST",
    headers,
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok || !response.body) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`Voice stream worker respondeu ${response.status}: ${detail}`);
  }

  return { response, jobId, voiceSelection: selection };
}
