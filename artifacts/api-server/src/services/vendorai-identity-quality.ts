import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { extname, join } from "path";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";

const execFileAsync = promisify(execFile);
const objectStorage = new ObjectStorageService();

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFrameRate(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  if (!value.includes("/")) return numberOrNull(value);
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function extensionForAsset(originalFilename: unknown, mimeType: unknown, fallback: string): string {
  const filename = typeof originalFilename === "string" ? originalFilename : "";
  const existing = extname(filename).replace(/[^.a-z0-9]/gi, "");
  if (existing) return existing;
  const mime = typeof mimeType === "string" ? mimeType.toLowerCase() : "";
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return fallback === "audio" ? ".m4a" : ".mp4";
  if (mime.includes("quicktime")) return ".mov";
  return fallback === "audio" ? ".audio" : ".video";
}

async function getAsset(tenantId: string, assetId: string) {
  const result = await pool.query(
    `SELECT id, type, storage_url, mime_type, file_size, original_filename, metadata
       FROM media_assets
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1`,
    [tenantId, assetId],
  );
  return result.rows[0] ?? null;
}

async function materializeAsset(tenantId: string, assetId: string, expectedType: "audio" | "video") {
  const asset = await getAsset(tenantId, assetId);
  if (!asset || asset.type !== expectedType) {
    throw new Error(`Referência ${expectedType === "audio" ? "de voz" : "de vídeo"} não encontrada`);
  }
  const storageUrl = String(asset.storage_url ?? "");
  const file = await objectStorage.getObjectEntityFile(storageUrl);
  const [buffer] = await file.download();
  const suffix = extensionForAsset(asset.original_filename, asset.mime_type, expectedType);
  const path = join(tmpdir(), `vendorai-identity-${expectedType}-${randomUUID()}${suffix}`);
  await writeFile(path, buffer);
  return { path, asset };
}

async function ffprobe(path: string): Promise<JsonRecord> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels,bit_rate",
    "-of", "json",
    path,
  ], { maxBuffer: 4 * 1024 * 1024 });
  return asRecord(JSON.parse(stdout));
}

function streamByType(probe: JsonRecord, type: "audio" | "video"): JsonRecord | null {
  const streams = Array.isArray(probe["streams"]) ? probe["streams"] : [];
  const stream = streams.map(asRecord).find((item) => item["codec_type"] === type);
  return stream ?? null;
}

function parseSilence(stderr: string, duration: number): number {
  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  let total = 0;
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = ends[index] ?? duration;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) total += end - start;
  }
  return Math.max(0, Math.min(duration, total));
}

async function analyzeAudioPath(path: string) {
  const probe = await ffprobe(path);
  const format = asRecord(probe["format"]);
  const stream = streamByType(probe, "audio");
  if (!stream) throw new Error("O arquivo de voz não possui faixa de áudio válida");

  const duration = numberOrNull(format["duration"]) ?? 0;
  const sampleRate = numberOrNull(stream["sample_rate"]);
  const channels = numberOrNull(stream["channels"]);
  const codec = typeof stream["codec_name"] === "string" ? stream["codec_name"] : null;

  let meanVolumeDb: number | null = null;
  let maxVolumeDb: number | null = null;
  let silenceSeconds = 0;
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-hide_banner", "-nostats", "-i", path,
      "-af", "silencedetect=noise=-42dB:d=0.7,volumedetect",
      "-f", "null", "-",
    ], { maxBuffer: 8 * 1024 * 1024 });
    const meanMatch = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/i);
    const maxMatch = stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/i);
    meanVolumeDb = meanMatch ? Number(meanMatch[1]) : null;
    maxVolumeDb = maxMatch ? Number(maxMatch[1]) : null;
    silenceSeconds = duration > 0 ? parseSilence(stderr, duration) : 0;
  } catch {
    // ffprobe metrics remain valid even if optional loudness filters are unavailable.
  }

  const silenceRatio = duration > 0 ? silenceSeconds / duration : 0;
  let score = 0;
  score += duration >= 45 && duration <= 150 ? 30 : duration >= 30 && duration <= 180 ? 20 : 10;
  score += meanVolumeDb !== null && meanVolumeDb >= -32 && meanVolumeDb <= -12 ? 25 : meanVolumeDb !== null && meanVolumeDb >= -40 && meanVolumeDb <= -8 ? 15 : 8;
  score += maxVolumeDb !== null && maxVolumeDb <= -0.3 && maxVolumeDb >= -8 ? 20 : maxVolumeDb !== null && maxVolumeDb > -0.3 ? 8 : maxVolumeDb !== null && maxVolumeDb >= -15 ? 12 : 6;
  score += silenceRatio >= 0.02 && silenceRatio <= 0.35 ? 15 : silenceRatio <= 0.5 ? 10 : 5;
  score += sampleRate !== null && sampleRate >= 32000 ? 10 : 5;

  const warnings: string[] = [];
  if (duration < 45) warnings.push("Referência curta; grave mais fala natural para ampliar a cobertura da voz.");
  if (duration > 150) warnings.push("Referência longa; prefira um trecho mais objetivo e limpo para o perfil principal.");
  if (meanVolumeDb !== null && meanVolumeDb < -38) warnings.push("Volume médio baixo; aproxime-se do microfone ou aumente o ganho de entrada.");
  if (meanVolumeDb !== null && meanVolumeDb > -8) warnings.push("Volume médio alto; reduza o ganho para preservar dinâmica e naturalidade.");
  if (maxVolumeDb !== null && maxVolumeDb > -0.2) warnings.push("Picos muito próximos de 0 dB; há risco de clipping na gravação.");
  if (silenceRatio > 0.5) warnings.push("Há silêncio excessivo na referência de voz.");

  return {
    technicalScore: clampScore(score),
    durationSeconds: Math.round(duration * 10) / 10,
    sampleRate,
    channels,
    codec,
    meanVolumeDb,
    maxVolumeDb,
    silenceRatio: Math.round(silenceRatio * 1000) / 1000,
    warnings,
    checks: {
      durationRecommended: duration >= 45 && duration <= 150,
      levelReadable: meanVolumeDb !== null ? meanVolumeDb >= -40 && meanVolumeDb <= -8 : null,
      clippingRisk: maxVolumeDb !== null ? maxVolumeDb > -0.2 : null,
      silenceAcceptable: silenceRatio <= 0.5,
    },
  };
}

async function analyzeVideoPath(path: string) {
  const probe = await ffprobe(path);
  const format = asRecord(probe["format"]);
  const video = streamByType(probe, "video");
  const audio = streamByType(probe, "audio");
  if (!video) throw new Error("O arquivo de referência não possui faixa de vídeo válida");

  const duration = numberOrNull(format["duration"]) ?? 0;
  const width = numberOrNull(video["width"]);
  const height = numberOrNull(video["height"]);
  const fps = parseFrameRate(video["r_frame_rate"]);
  const bitRate = numberOrNull(video["bit_rate"]) ?? numberOrNull(format["bit_rate"]);
  const codec = typeof video["codec_name"] === "string" ? video["codec_name"] : null;
  const shortSide = Math.min(width ?? 0, height ?? 0);
  const hasAudio = Boolean(audio);

  let score = 0;
  score += duration >= 90 && duration <= 150 ? 30 : duration >= 60 && duration <= 180 ? 20 : 10;
  score += shortSide >= 720 ? 25 : shortSide >= 480 ? 15 : 5;
  score += fps !== null && fps >= 24 ? 20 : fps !== null && fps >= 20 ? 12 : 5;
  score += bitRate !== null && bitRate >= 1_000_000 ? 15 : bitRate !== null && bitRate >= 500_000 ? 10 : 5;
  score += hasAudio ? 10 : 0;

  const warnings: string[] = [];
  if (duration < 90) warnings.push("Vídeo curto; tente chegar perto de 2 minutos para cobrir mais expressões e transições.");
  if (duration > 150) warnings.push("Vídeo acima da faixa recomendada; mantenha a referência principal mais objetiva.");
  if (shortSide > 0 && shortSide < 720) warnings.push("Resolução abaixo de 720p; use uma câmera com maior definição para preservar detalhes faciais.");
  if (fps !== null && fps < 24) warnings.push("Taxa de quadros baixa; 24 fps ou mais melhora a leitura dos movimentos labiais.");
  if (!hasAudio) warnings.push("O vídeo não possui áudio; grave imagem e voz juntas para facilitar a análise temporal.");

  return {
    technicalScore: clampScore(score),
    durationSeconds: Math.round(duration * 10) / 10,
    width,
    height,
    fps: fps === null ? null : Math.round(fps * 100) / 100,
    bitRate,
    codec,
    hasAudio,
    warnings,
    checks: {
      durationRecommended: duration >= 90 && duration <= 150,
      resolutionRecommended: shortSide >= 720,
      frameRateRecommended: fps !== null ? fps >= 24 : null,
      audioPresent: hasAudio,
    },
  };
}

export async function analyzeVendorAiIdentityReferences(params: {
  tenantId: string;
  identityId: string;
}) {
  const { tenantId, identityId } = params;
  const identityResult = await pool.query(
    `SELECT id, face_reference_asset_id, metadata
       FROM media_identities
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1`,
    [tenantId, identityId],
  );
  const identity = identityResult.rows[0];
  if (!identity) throw new Error("Identidade audiovisual não encontrada");

  const voiceResult = await pool.query(
    `SELECT id, reference_asset_id, metadata
       FROM media_voice_profiles
      WHERE tenant_id = $1 AND identity_id = $2
        AND status <> 'archived' AND reference_asset_id IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1`,
    [tenantId, identityId],
  );
  const voice = voiceResult.rows[0] ?? null;
  const metadata = asRecord(identity.metadata);
  const captureProfile = asRecord(metadata["captureProfile"]);
  const videoCapture = asRecord(captureProfile["video"]);
  const videoAssetId = typeof videoCapture["referenceAssetId"] === "string" ? videoCapture["referenceAssetId"] : null;
  const voiceAssetId = voice?.reference_asset_id ? String(voice.reference_asset_id) : null;

  let audioAnalysis: Awaited<ReturnType<typeof analyzeAudioPath>> | null = null;
  let videoAnalysis: Awaited<ReturnType<typeof analyzeVideoPath>> | null = null;
  const cleanupPaths: string[] = [];

  try {
    if (voiceAssetId) {
      const audio = await materializeAsset(tenantId, voiceAssetId, "audio");
      cleanupPaths.push(audio.path);
      audioAnalysis = await analyzeAudioPath(audio.path);
    }
    if (videoAssetId) {
      const video = await materializeAsset(tenantId, videoAssetId, "video");
      cleanupPaths.push(video.path);
      videoAnalysis = await analyzeVideoPath(video.path);
    }
  } finally {
    await Promise.all(cleanupPaths.map((path) => unlink(path).catch(() => undefined)));
  }

  const scores = [audioAnalysis?.technicalScore, videoAnalysis?.technicalScore].filter((value): value is number => typeof value === "number");
  const technicalScore = scores.length ? clampScore(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
  const faceReady = Boolean(identity.face_reference_asset_id);
  const fullReferenceSet = faceReady && Boolean(audioAnalysis) && Boolean(videoAnalysis);
  const readiness = fullReferenceSet && technicalScore !== null && technicalScore >= 60 ? "ready_for_duble_test" : "needs_reference_review";
  const analyzedAt = new Date().toISOString();

  const nextCaptureProfile = {
    ...captureProfile,
    voice: {
      ...asRecord(captureProfile["voice"]),
      analysisStatus: audioAnalysis ? "technical_complete" : "missing",
      technicalScore: audioAnalysis?.technicalScore ?? null,
    },
    video: {
      ...videoCapture,
      analysisStatus: videoAnalysis ? "technical_complete" : "missing",
      technicalScore: videoAnalysis?.technicalScore ?? null,
    },
  };
  const qualityAnalysis = {
    version: 1,
    analyzedAt,
    technicalScore,
    readiness,
    faceReferenceReady: faceReady,
    voice: audioAnalysis,
    video: videoAnalysis,
    deepFidelityStatus: "pending",
    deepChecksPending: ["face_similarity", "expression_coverage", "gaze_coverage", "lip_motion_coverage", "prosody_similarity"],
  };
  const nextMetadata = {
    ...metadata,
    captureProfile: nextCaptureProfile,
    qualityAnalysis,
  };

  await pool.query(
    `UPDATE media_identities SET metadata = $3::jsonb, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, identityId, JSON.stringify(nextMetadata)],
  );

  if (voice?.id && audioAnalysis) {
    const nextVoiceMetadata = {
      ...asRecord(voice.metadata),
      qualityAnalysis: {
        version: 1,
        analyzedAt,
        ...audioAnalysis,
      },
    };
    await pool.query(
      `UPDATE media_voice_profiles SET metadata = $4::jsonb, updated_at = NOW()
        WHERE tenant_id = $1 AND identity_id = $2 AND id = $3`,
      [tenantId, identityId, String(voice.id), JSON.stringify(nextVoiceMetadata)],
    );
  }

  return qualityAnalysis;
}

export async function saveVendorAiDubleEvaluation(params: {
  tenantId: string;
  identityId: string;
  testAssetId?: string | null;
  ratings: Record<string, number>;
  notes?: string | null;
  userId?: string | null;
}) {
  const { tenantId, identityId, testAssetId, ratings, notes, userId } = params;
  const identityResult = await pool.query(
    `SELECT metadata FROM media_identities WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, identityId],
  );
  if (!identityResult.rowCount) throw new Error("Identidade audiovisual não encontrada");

  if (testAssetId) {
    const asset = await getAsset(tenantId, testAssetId);
    if (!asset || asset.type !== "video") throw new Error("Vídeo de teste não pertence a esta empresa");
  }

  const allowedKeys = ["voice", "likeness", "lipSync", "expression", "naturalness"];
  const normalized: Record<string, number> = {};
  for (const key of allowedKeys) {
    const value = Number(ratings[key]);
    if (!Number.isFinite(value) || value < 1 || value > 5) throw new Error("Todas as avaliações devem ficar entre 1 e 5");
    normalized[key] = Math.round(value);
  }
  const values = Object.values(normalized);
  const average = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
  const evaluation = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    createdByUserId: userId ?? null,
    testAssetId: testAssetId ?? null,
    ratings: normalized,
    average,
    notes: notes?.trim().slice(0, 1000) || null,
  };

  const metadata = asRecord(identityResult.rows[0]?.metadata);
  const existing = Array.isArray(metadata["dubleEvaluations"]) ? metadata["dubleEvaluations"] : [];
  const nextMetadata = {
    ...metadata,
    dubleEvaluations: [evaluation, ...existing].slice(0, 50),
    dubleValidation: {
      status: average >= 4 ? "approved" : average >= 3 ? "review" : "needs_improvement",
      lastEvaluationAt: evaluation.createdAt,
      lastAverage: average,
    },
  };
  await pool.query(
    `UPDATE media_identities SET metadata = $3::jsonb, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, identityId, JSON.stringify(nextMetadata)],
  );
  return evaluation;
}
