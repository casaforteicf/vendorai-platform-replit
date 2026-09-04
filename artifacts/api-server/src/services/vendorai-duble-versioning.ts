import { createHash, randomUUID } from "crypto";
import { pool } from "@workspace/db";
import { analyzeVendorAiIdentityReferences } from "./vendorai-identity-quality.js";

type JsonRecord = Record<string, unknown>;

type VoiceSnapshot = {
  id: string;
  name: string;
  status: string;
  referenceAssetId: string;
  locale: string | null;
  market: string | null;
};

export type DubleTrainingVersionSnapshot = {
  id: string;
  versionNumber: number;
  label: string;
  createdAt: string;
  createdByUserId: string | null;
  trigger: "reference_analysis";
  fingerprint: string;
  references: {
    faceAssetId: string;
    videoAssetId: string;
    voices: VoiceSnapshot[];
  };
  market: {
    country: string | null;
    locale: string | null;
    region: string | null;
  };
  capture: {
    voiceScriptVersion: string | null;
    videoScriptVersion: string | null;
  };
  fidelity: {
    score: number | null;
    completeness: number | null;
    confidence: string | null;
    deepFidelityStatus: string | null;
  };
  behaviorDNA: JsonRecord | null;
};

export type EnsureDubleTrainingVersionResult = {
  created: boolean;
  reason: "created" | "same_training_set" | "incomplete_reference_set";
  currentVersion: number | null;
  version: DubleTrainingVersionSnapshot | null;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableFingerprint(input: {
  faceAssetId: string;
  videoAssetId: string;
  voices: VoiceSnapshot[];
  voiceScriptVersion: string | null;
  videoScriptVersion: string | null;
}) {
  const stableVoices = [...input.voices]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((voice) => ({
      id: voice.id,
      referenceAssetId: voice.referenceAssetId,
      locale: voice.locale,
      market: voice.market,
      status: voice.status,
    }));
  return createHash("sha256")
    .update(JSON.stringify({
      faceAssetId: input.faceAssetId,
      videoAssetId: input.videoAssetId,
      voices: stableVoices,
      voiceScriptVersion: input.voiceScriptVersion,
      videoScriptVersion: input.videoScriptVersion,
    }))
    .digest("hex");
}

async function loadTrainingSet(tenantId: string, identityId: string) {
  const identityResult = await pool.query(
    `SELECT face_reference_asset_id, metadata
       FROM media_identities
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1`,
    [tenantId, identityId],
  );
  const identity = identityResult.rows[0] as Record<string, unknown> | undefined;
  if (!identity) throw new Error("Identidade audiovisual não encontrada");
  const metadata = asRecord(identity["metadata"]);
  const captureProfile = asRecord(metadata["captureProfile"]);
  const voiceCapture = asRecord(captureProfile["voice"]);
  const videoCapture = asRecord(captureProfile["video"]);
  const faceAssetId = stringOrNull(identity["face_reference_asset_id"]);
  const videoAssetId = stringOrNull(videoCapture["referenceAssetId"]);

  const voicesResult = await pool.query(
    `SELECT id, name, status, reference_asset_id, metadata
       FROM media_voice_profiles
      WHERE tenant_id = $1
        AND identity_id = $2
        AND status <> 'archived'
        AND reference_asset_id IS NOT NULL
      ORDER BY created_at ASC, id ASC`,
    [tenantId, identityId],
  );
  const voices: VoiceSnapshot[] = voicesResult.rows.map((row) => {
    const voiceMetadata = asRecord(row.metadata);
    return {
      id: String(row.id),
      name: String(row.name ?? "Voz"),
      status: String(row.status ?? "draft"),
      referenceAssetId: String(row.reference_asset_id),
      locale: stringOrNull(voiceMetadata["locale"]),
      market: stringOrNull(voiceMetadata["market"] ?? voiceMetadata["country"]),
    };
  });

  return {
    metadata,
    faceAssetId,
    videoAssetId,
    voices,
    voiceScriptVersion: stringOrNull(voiceCapture["scriptVersion"]),
    videoScriptVersion: stringOrNull(videoCapture["scriptVersion"]),
  };
}

export async function ensureVendorAiDubleTrainingVersion(params: {
  tenantId: string;
  identityId: string;
  userId?: string | null;
}): Promise<EnsureDubleTrainingVersionResult> {
  const training = await loadTrainingSet(params.tenantId, params.identityId);
  const versionsRoot = asRecord(training.metadata["dubleVersions"]);
  const items = Array.isArray(versionsRoot["items"]) ? versionsRoot["items"].map(asRecord) : [];
  const currentVersion = numberOrNull(versionsRoot["currentVersion"]);

  if (!training.faceAssetId || !training.videoAssetId || training.voices.length === 0) {
    return {
      created: false,
      reason: "incomplete_reference_set",
      currentVersion,
      version: null,
    };
  }

  const fingerprint = stableFingerprint({
    faceAssetId: training.faceAssetId,
    videoAssetId: training.videoAssetId,
    voices: training.voices,
    voiceScriptVersion: training.voiceScriptVersion,
    videoScriptVersion: training.videoScriptVersion,
  });
  const currentFingerprint = stringOrNull(versionsRoot["currentFingerprint"]);
  if (currentFingerprint === fingerprint) {
    const current = items.find((item) => numberOrNull(item["versionNumber"]) === currentVersion) ?? null;
    return {
      created: false,
      reason: "same_training_set",
      currentVersion,
      version: current as unknown as DubleTrainingVersionSnapshot | null,
    };
  }

  const nextVersionNumber = Math.max(0, ...items.map((item) => numberOrNull(item["versionNumber"]) ?? 0)) + 1;
  const quality = asRecord(training.metadata["qualityAnalysis"]);
  const behaviorDNA = training.metadata["behaviorDNA"] && typeof training.metadata["behaviorDNA"] === "object"
    ? asRecord(training.metadata["behaviorDNA"])
    : null;
  const snapshot: DubleTrainingVersionSnapshot = {
    id: randomUUID(),
    versionNumber: nextVersionNumber,
    label: `V${nextVersionNumber}`,
    createdAt: new Date().toISOString(),
    createdByUserId: params.userId ?? null,
    trigger: "reference_analysis",
    fingerprint,
    references: {
      faceAssetId: training.faceAssetId,
      videoAssetId: training.videoAssetId,
      voices: training.voices,
    },
    market: {
      country: stringOrNull(training.metadata["country"]),
      locale: stringOrNull(training.metadata["locale"]),
      region: stringOrNull(training.metadata["marketRegion"]),
    },
    capture: {
      voiceScriptVersion: training.voiceScriptVersion,
      videoScriptVersion: training.videoScriptVersion,
    },
    fidelity: {
      score: numberOrNull(quality["fidelityScore"]),
      completeness: numberOrNull(quality["fidelityCompleteness"]),
      confidence: stringOrNull(quality["fidelityConfidence"]),
      deepFidelityStatus: stringOrNull(quality["deepFidelityStatus"]),
    },
    behaviorDNA,
  };
  const nextMetadata = {
    ...training.metadata,
    dubleVersions: {
      schemaVersion: 1,
      currentVersion: nextVersionNumber,
      currentFingerprint: fingerprint,
      updatedAt: snapshot.createdAt,
      items: [snapshot, ...items].slice(0, 20),
    },
  };
  await pool.query(
    `UPDATE media_identities SET metadata = $3::jsonb, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2`,
    [params.tenantId, params.identityId, JSON.stringify(nextMetadata)],
  );
  return {
    created: true,
    reason: "created",
    currentVersion: nextVersionNumber,
    version: snapshot,
  };
}

export async function analyzeVendorAiIdentityReferencesWithVersion(params: {
  tenantId: string;
  identityId: string;
  userId?: string | null;
}) {
  const analysis = await analyzeVendorAiIdentityReferences({
    tenantId: params.tenantId,
    identityId: params.identityId,
  });
  const dubleVersion = await ensureVendorAiDubleTrainingVersion(params);
  return { ...analysis, dubleVersion };
}
