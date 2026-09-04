import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { pool } from "@workspace/db";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { generateVendorAiLipSync } from "./vendorai-lipsync-engine.js";

const execFileAsync = promisify(execFile);
const objectStorage = new ObjectStorageService();

type JsonRecord = Record<string, unknown>;
type GateStatus = "pass" | "review" | "failed" | "unavailable";
type PublishDecision = "approved" | "review" | "blocked";
type IssueSeverity = "critical" | "high" | "medium" | "low";

type GateIssue = {
  category: "face" | "eyes" | "mouth" | "hands" | "temporal" | "framing" | "background" | "anatomy" | "other";
  severity: IssueSeverity;
  description: string;
  frameHint: string | null;
};

export type DublePostGenerationQualityGate = {
  version: 1;
  analyzedAt: string;
  status: GateStatus;
  publishDecision: PublishDecision;
  score: number | null;
  model: string | null;
  sampledFrames: number;
  technical: {
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    fps: number | null;
  };
  scores: {
    faceConsistency: number | null;
    temporalConsistency: number | null;
    eyeIntegrity: number | null;
    mouthIntegrity: number | null;
    handIntegrity: number | null;
    framingStability: number | null;
    backgroundStability: number | null;
    naturalness: number | null;
  };
  issues: GateIssue[];
  recommendations: string[];
  pendingChecks: string[];
  error: string | null;
};

type LipSyncResult = Awaited<ReturnType<typeof generateVendorAiLipSync>>;

type VideoProbe = {
  durationSeconds: number;
  width: number | null;
  height: number | null;
  fps: number | null;
};

const SCORE_WEIGHTS = {
  faceConsistency: 0.20,
  temporalConsistency: 0.15,
  eyeIntegrity: 0.10,
  mouthIntegrity: 0.15,
  handIntegrity: 0.10,
  framingStability: 0.10,
  backgroundStability: 0.10,
  naturalness: 0.10,
} as const;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function clampScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function strings(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit);
}

function parseFrameRate(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  if (!value.includes("/")) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const [numerator, denominator] = value.split("/").map(Number);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0 ? numerator / denominator : null;
}

function responseText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  if (!Array.isArray(response?.output)) return "";
  const parts: string[] = [];
  for (const item of response.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function safeJson(text: string): JsonRecord {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return asRecord(JSON.parse(cleaned));
}

function normalizeIssues(value: unknown): GateIssue[] {
  if (!Array.isArray(value)) return [];
  const categories = new Set(["face", "eyes", "mouth", "hands", "temporal", "framing", "background", "anatomy", "other"]);
  const severities = new Set(["critical", "high", "medium", "low"]);
  return value.slice(0, 12).map((raw) => {
    const item = asRecord(raw);
    const category = String(item["category"] ?? "other");
    const severity = String(item["severity"] ?? "medium");
    const frameHint = typeof item["frameHint"] === "string" && item["frameHint"].trim() ? item["frameHint"].trim().slice(0, 80) : null;
    return {
      category: (categories.has(category) ? category : "other") as GateIssue["category"],
      severity: (severities.has(severity) ? severity : "medium") as IssueSeverity,
      description: String(item["description"] ?? "Anomalia visual detectada").trim().slice(0, 500),
      frameHint,
    };
  });
}

async function loadAssetBuffer(tenantId: string, assetId: string, type: "image" | "video") {
  const result = await pool.query(
    `SELECT storage_url, mime_type, original_filename, metadata
       FROM media_assets
      WHERE tenant_id = $1 AND id = $2 AND type = $3
      LIMIT 1`,
    [tenantId, assetId, type],
  );
  const asset = result.rows[0] as Record<string, unknown> | undefined;
  if (!asset || typeof asset["storage_url"] !== "string" || !asset["storage_url"]) throw new Error(`Asset ${type} não encontrado`);
  const file = await objectStorage.getObjectEntityFile(String(asset["storage_url"]));
  const [buffer] = await file.download();
  if (!buffer.length) throw new Error(`Asset ${type} está vazio`);
  return {
    buffer,
    mimeType: typeof asset["mime_type"] === "string" ? asset["mime_type"] : type === "image" ? "image/jpeg" : "video/mp4",
    filename: typeof asset["original_filename"] === "string" ? asset["original_filename"] : `${type}-asset`,
    metadata: asRecord(asset["metadata"]),
  };
}

async function loadIdentityFaceAssetId(tenantId: string, identityId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT face_reference_asset_id FROM media_identities WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, identityId],
  );
  return result.rows[0]?.face_reference_asset_id ? String(result.rows[0].face_reference_asset_id) : null;
}

async function videoProbe(path: string): Promise<VideoProbe> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate",
    "-of", "json",
    path,
  ], { maxBuffer: 4 * 1024 * 1024 });
  const parsed = asRecord(JSON.parse(stdout));
  const format = asRecord(parsed["format"]);
  const streams = Array.isArray(parsed["streams"]) ? parsed["streams"].map(asRecord) : [];
  const video = streams.find((stream) => stream["codec_type"] === "video") ?? {};
  const duration = Number(format["duration"] ?? 0);
  const width = Number(video["width"] ?? NaN);
  const height = Number(video["height"] ?? NaN);
  return {
    durationSeconds: Number.isFinite(duration) ? duration : 0,
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
    fps: parseFrameRate(video["r_frame_rate"]),
  };
}

async function sampleVideoFrames(path: string, durationSeconds: number): Promise<Array<{ label: string; dataUrl: string }>> {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Vídeo final sem duração válida");
  const workDir = await mkdtemp(join(tmpdir(), "vendorai-postgen-gate-"));
  const positions = [0.05, 0.17, 0.29, 0.41, 0.55, 0.69, 0.82, 0.94];
  const frames: Array<{ label: string; dataUrl: string }> = [];
  try {
    for (let index = 0; index < positions.length; index += 1) {
      const fraction = positions[index]!;
      const second = Math.max(0, Math.min(durationSeconds - 0.03, durationSeconds * fraction));
      const output = join(workDir, `frame-${index + 1}.jpg`);
      await execFileAsync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-ss", second.toFixed(3), "-i", path,
        "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "3", output,
      ], { maxBuffer: 4 * 1024 * 1024 });
      const buffer = await readFile(output);
      if (buffer.length) frames.push({
        label: `${Math.round(fraction * 100)}% do vídeo`,
        dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
      });
    }
    return frames;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function imageDataUrl(tenantId: string, assetId: string): Promise<string> {
  const asset = await loadAssetBuffer(tenantId, assetId, "image");
  const mimeType = asset.mimeType.startsWith("image/") ? asset.mimeType : "image/jpeg";
  return `data:${mimeType};base64,${asset.buffer.toString("base64")}`;
}

function buildGate(parsed: JsonRecord, model: string, frames: number, technical: VideoProbe): DublePostGenerationQualityGate {
  const rawScores = asRecord(parsed["scores"]);
  const scores = {
    faceConsistency: clampScore(rawScores["faceConsistency"]),
    temporalConsistency: clampScore(rawScores["temporalConsistency"]),
    eyeIntegrity: clampScore(rawScores["eyeIntegrity"]),
    mouthIntegrity: clampScore(rawScores["mouthIntegrity"]),
    handIntegrity: clampScore(rawScores["handIntegrity"]),
    framingStability: clampScore(rawScores["framingStability"]),
    backgroundStability: clampScore(rawScores["backgroundStability"]),
    naturalness: clampScore(rawScores["naturalness"]),
  };
  const score = Math.round(
    scores.faceConsistency * SCORE_WEIGHTS.faceConsistency
      + scores.temporalConsistency * SCORE_WEIGHTS.temporalConsistency
      + scores.eyeIntegrity * SCORE_WEIGHTS.eyeIntegrity
      + scores.mouthIntegrity * SCORE_WEIGHTS.mouthIntegrity
      + scores.handIntegrity * SCORE_WEIGHTS.handIntegrity
      + scores.framingStability * SCORE_WEIGHTS.framingStability
      + scores.backgroundStability * SCORE_WEIGHTS.backgroundStability
      + scores.naturalness * SCORE_WEIGHTS.naturalness,
  );
  const criticalFloor = Math.min(scores.faceConsistency, scores.temporalConsistency, scores.eyeIntegrity, scores.mouthIntegrity);
  const status: GateStatus = score >= 82 && criticalFloor >= 72 ? "pass" : score >= 66 && criticalFloor >= 55 ? "review" : "failed";
  const publishDecision: PublishDecision = status === "pass" ? "approved" : status === "failed" ? "blocked" : "review";
  return {
    version: 1,
    analyzedAt: new Date().toISOString(),
    status,
    publishDecision,
    score,
    model,
    sampledFrames: frames,
    technical: {
      durationSeconds: Math.round(technical.durationSeconds * 10) / 10,
      width: technical.width,
      height: technical.height,
      fps: technical.fps === null ? null : Math.round(technical.fps * 100) / 100,
    },
    scores,
    issues: normalizeIssues(parsed["issues"]),
    recommendations: strings(parsed["recommendations"], 8),
    pendingChecks: ["audio_phoneme_alignment"],
    error: null,
  };
}

function unavailableGate(error: unknown): DublePostGenerationQualityGate {
  return {
    version: 1,
    analyzedAt: new Date().toISOString(),
    status: "unavailable",
    publishDecision: "review",
    score: null,
    model: null,
    sampledFrames: 0,
    technical: { durationSeconds: null, width: null, height: null, fps: null },
    scores: {
      faceConsistency: null,
      temporalConsistency: null,
      eyeIntegrity: null,
      mouthIntegrity: null,
      handIntegrity: null,
      framingStability: null,
      backgroundStability: null,
      naturalness: null,
    },
    issues: [],
    recommendations: [],
    pendingChecks: ["visual_quality_gate", "audio_phoneme_alignment"],
    error: error instanceof Error ? error.message.slice(0, 800) : "Quality Gate indisponível",
  };
}

async function analyzeGeneratedVideo(input: {
  tenantId: string;
  identityId: string;
  videoAssetId: string;
  pipelineFaceAssetId?: string | null;
}): Promise<DublePostGenerationQualityGate> {
  const video = await loadAssetBuffer(input.tenantId, input.videoAssetId, "video");
  const identityFaceAssetId = await loadIdentityFaceAssetId(input.tenantId, input.identityId);
  if (!identityFaceAssetId) throw new Error("Referência facial original não encontrada");
  const pipelineFaceAssetId = input.pipelineFaceAssetId ?? (typeof video.metadata["faceAssetId"] === "string" ? video.metadata["faceAssetId"] : null);
  const workDir = await mkdtemp(join(tmpdir(), "vendorai-quality-video-"));
  const videoPath = join(workDir, video.filename.endsWith(".mp4") ? video.filename : "generated.mp4");
  try {
    await writeFile(videoPath, video.buffer);
    const technical = await videoProbe(videoPath);
    const frames = await sampleVideoFrames(videoPath, technical.durationSeconds);
    if (frames.length < 5) throw new Error("Não foi possível extrair quadros suficientes do vídeo final");
    const [identityReference, pipelineReference] = await Promise.all([
      imageDataUrl(input.tenantId, identityFaceAssetId),
      pipelineFaceAssetId && pipelineFaceAssetId !== identityFaceAssetId
        ? imageDataUrl(input.tenantId, pipelineFaceAssetId)
        : Promise.resolve<string | null>(null),
    ]);
    const openai = await getOpenAIForTenant(input.tenantId);
    const model = process.env["VENDORAI_VISION_MODEL"]?.trim() || "gpt-5.6-luna";
    const content: any[] = [
      {
        type: "input_text",
        text: "A primeira imagem é a referência facial original autorizada. Quando houver uma segunda referência antes dos quadros, ela é a referência visual estilizada usada pelo pipeline. Depois vêm quadros temporais do vídeo final, em ordem. Avalie a QUALIDADE DO VÍDEO GERADO, não autenticação ou identidade civil. Retorne JSON válido com scores 0-100: faceConsistency, temporalConsistency, eyeIntegrity, mouthIntegrity, handIntegrity, framingStability, backgroundStability, naturalness; issues: [{category: face|eyes|mouth|hands|temporal|framing|background|anatomy|other, severity: critical|high|medium|low, description, frameHint}]; recommendations: string[]. Marque deformações, troca visual de pessoa, olhos incoerentes, dentes/boca artificiais, mãos/dedos anômalos, flicker, mudança brusca de cenário, recortes, anatomia e instabilidade. Não afirme sincronização fonética do áudio: imagens amostradas não comprovam alinhamento áudio-fonema.",
      },
      { type: "input_image", image_url: identityReference, detail: "high" },
    ];
    if (pipelineReference) content.push({ type: "input_image", image_url: pipelineReference, detail: "high" });
    frames.forEach((frame) => {
      content.push({ type: "input_text", text: `Quadro: ${frame.label}` });
      content.push({ type: "input_image", image_url: frame.dataUrl, detail: "high" });
    });
    const response = await (openai.responses.create as any)({
      model,
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: "Você é o Quality Gate audiovisual do VendorAI. Avalie somente qualidade visual observável de um Dublê Digital autorizado. Não faça reconhecimento biométrico, não determine identidade civil e não infira atributos sensíveis, saúde ou personalidade psicológica. Seja conservador: problemas críticos de rosto, olhos, boca, mãos, anatomia ou continuidade devem reduzir fortemente a nota. Responda somente JSON válido.",
          }],
        },
        { role: "user", content },
      ],
    });
    const text = responseText(response);
    if (!text) throw new Error("Motor de visão não retornou Quality Gate");
    return buildGate(safeJson(text), model, frames.length, technical);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function persistGate(params: {
  tenantId: string;
  identityId: string;
  videoAssetId: string;
  gate: DublePostGenerationQualityGate;
}) {
  await pool.query(
    `UPDATE media_assets
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
      WHERE tenant_id = $1 AND id = $2`,
    [params.tenantId, params.videoAssetId, JSON.stringify({ qualityGate: params.gate, publishReady: params.gate.publishDecision === "approved" })],
  );
  const result = await pool.query(
    `SELECT metadata FROM media_identities WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [params.tenantId, params.identityId],
  );
  if (!result.rowCount) return;
  const metadata = asRecord(result.rows[0]?.metadata);
  const quality = asRecord(metadata["dubleQualityGate"]);
  const history = Array.isArray(quality["history"]) ? quality["history"] : [];
  const item = { videoAssetId: params.videoAssetId, ...params.gate };
  const nextMetadata = {
    ...metadata,
    dubleQualityGate: {
      version: 1,
      last: item,
      history: [item, ...history].slice(0, 30),
    },
  };
  await pool.query(
    `UPDATE media_identities SET metadata = $3::jsonb, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2`,
    [params.tenantId, params.identityId, JSON.stringify(nextMetadata)],
  );
}

export async function generateVendorAiLipSyncWithQualityGate(input: Parameters<typeof generateVendorAiLipSync>[0]): Promise<LipSyncResult & { qualityGate: DublePostGenerationQualityGate }> {
  const result = await generateVendorAiLipSync(input);
  if (process.env["VENDORAI_DUBLE_QUALITY_GATE_ENABLED"]?.trim().toLowerCase() === "false") {
    const gate = unavailableGate(new Error("Quality Gate desativado por configuração"));
    return { ...result, qualityGate: gate };
  }

  let gate: DublePostGenerationQualityGate;
  try {
    gate = await analyzeGeneratedVideo({
      tenantId: input.tenantId,
      identityId: input.identityId,
      videoAssetId: result.assetId,
      pipelineFaceAssetId: input.faceAssetId ?? null,
    });
  } catch (error) {
    gate = unavailableGate(error);
  }

  await persistGate({
    tenantId: input.tenantId,
    identityId: input.identityId,
    videoAssetId: result.assetId,
    gate,
  }).catch(() => undefined);

  return { ...result, qualityGate: gate };
}
