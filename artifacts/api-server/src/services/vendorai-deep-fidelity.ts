import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { pool } from "@workspace/db";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const execFileAsync = promisify(execFile);
const objectStorage = new ObjectStorageService();

type JsonRecord = Record<string, unknown>;
type BehaviorLevel = "low" | "medium" | "high";

type BehaviorDNA = {
  gestureIntensity: BehaviorLevel;
  expressionIntensity: BehaviorLevel;
  smileFrequency: BehaviorLevel;
  gazeVariation: BehaviorLevel;
  movementEnergy: BehaviorLevel;
  postureStyle: "upright" | "relaxed" | "mixed";
  presentationStyle: "calm" | "balanced" | "energetic";
  notes: string[];
};

export type DeepFidelityResult = {
  status: "complete";
  analyzedAt: string;
  model: string;
  sampledFrames: number;
  scores: {
    faceConsistency: number;
    expressionCoverage: number;
    gazeCoverage: number;
    lipMotionCoverage: number;
    gestureCoverage: number;
    postureStability: number;
    naturalness: number;
    visualScore: number;
  };
  behaviorDNA: BehaviorDNA;
  observations: string[];
  recommendations: string[];
  pendingAutomaticChecks: string[];
};

export type FidelitySummary = {
  score: number | null;
  completeness: number;
  confidence: "insufficient" | "provisional" | "validated";
  components: {
    technical: number | null;
    visual: number | null;
    human: number | null;
  };
  pendingChecks: string[];
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function clampScore(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function strings(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit);
}

function behaviorLevel(value: unknown): BehaviorLevel {
  const normalized = String(value ?? "medium").toLowerCase();
  return normalized === "low" || normalized === "high" ? normalized : "medium";
}

function postureStyle(value: unknown): BehaviorDNA["postureStyle"] {
  const normalized = String(value ?? "mixed").toLowerCase();
  return normalized === "upright" || normalized === "relaxed" ? normalized : "mixed";
}

function presentationStyle(value: unknown): BehaviorDNA["presentationStyle"] {
  const normalized = String(value ?? "balanced").toLowerCase();
  return normalized === "calm" || normalized === "energetic" ? normalized : "balanced";
}

function safeJson(text: string): JsonRecord {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return asRecord(JSON.parse(cleaned));
}

function responseText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  if (!Array.isArray(response?.output)) return "";
  const texts: string[] = [];
  for (const item of response.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const part of item.content) {
      if (typeof part?.text === "string") texts.push(part.text);
    }
  }
  return texts.join("\n").trim();
}

async function loadImageDataUrl(tenantId: string, assetId: string): Promise<string> {
  const result = await pool.query(
    `SELECT storage_url, mime_type
       FROM media_assets
      WHERE tenant_id = $1 AND id = $2 AND type = 'image'
      LIMIT 1`,
    [tenantId, assetId],
  );
  const asset = result.rows[0];
  if (!asset) throw new Error("Referência facial autorizada não encontrada");
  const file = await objectStorage.getObjectEntityFile(String(asset.storage_url ?? ""));
  const [buffer] = await file.download();
  if (!buffer.length) throw new Error("Referência facial autorizada está vazia");
  const rawMimeType = typeof asset.mime_type === "string" ? asset.mime_type : "";
  const mimeType = rawMimeType.startsWith("image/") ? rawMimeType : "image/jpeg";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function sampleVideoFrames(videoPath: string, durationSeconds: number): Promise<string[]> {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1) throw new Error("Vídeo de referência sem duração válida");
  const workDir = await mkdtemp(join(tmpdir(), "vendorai-fidelity-"));
  const positions = [0.08, 0.22, 0.38, 0.54, 0.70, 0.86];
  const frames: string[] = [];
  try {
    for (let index = 0; index < positions.length; index += 1) {
      const second = Math.max(0, Math.min(durationSeconds - 0.05, durationSeconds * positions[index]!));
      const output = join(workDir, `frame-${index + 1}.jpg`);
      await execFileAsync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-ss", second.toFixed(3),
        "-i", videoPath,
        "-frames:v", "1",
        "-vf", "scale=960:-2",
        "-q:v", "3",
        output,
      ], { maxBuffer: 4 * 1024 * 1024 });
      const buffer = await readFile(output);
      if (buffer.length) frames.push(`data:image/jpeg;base64,${buffer.toString("base64")}`);
    }
    return frames;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function normalizeDeepResult(parsed: JsonRecord, model: string, sampledFrames: number): DeepFidelityResult {
  const rawScores = asRecord(parsed["scores"]);
  const componentScores = {
    faceConsistency: clampScore(rawScores["faceConsistency"]),
    expressionCoverage: clampScore(rawScores["expressionCoverage"]),
    gazeCoverage: clampScore(rawScores["gazeCoverage"]),
    lipMotionCoverage: clampScore(rawScores["lipMotionCoverage"]),
    gestureCoverage: clampScore(rawScores["gestureCoverage"]),
    postureStability: clampScore(rawScores["postureStability"]),
    naturalness: clampScore(rawScores["naturalness"]),
  };
  const visualScore = clampScore(
    componentScores.faceConsistency * 0.25
      + componentScores.expressionCoverage * 0.15
      + componentScores.gazeCoverage * 0.10
      + componentScores.lipMotionCoverage * 0.15
      + componentScores.gestureCoverage * 0.15
      + componentScores.postureStability * 0.10
      + componentScores.naturalness * 0.10,
  );
  const rawDna = asRecord(parsed["behaviorDNA"]);
  return {
    status: "complete",
    analyzedAt: new Date().toISOString(),
    model,
    sampledFrames,
    scores: { ...componentScores, visualScore },
    behaviorDNA: {
      gestureIntensity: behaviorLevel(rawDna["gestureIntensity"]),
      expressionIntensity: behaviorLevel(rawDna["expressionIntensity"]),
      smileFrequency: behaviorLevel(rawDna["smileFrequency"]),
      gazeVariation: behaviorLevel(rawDna["gazeVariation"]),
      movementEnergy: behaviorLevel(rawDna["movementEnergy"]),
      postureStyle: postureStyle(rawDna["postureStyle"]),
      presentationStyle: presentationStyle(rawDna["presentationStyle"]),
      notes: strings(rawDna["notes"], 6),
    },
    observations: strings(parsed["observations"], 8),
    recommendations: strings(parsed["recommendations"], 8),
    pendingAutomaticChecks: ["prosody_similarity", "voice_identity_similarity"],
  };
}

export async function analyzeVendorAiDeepFidelity(input: {
  tenantId: string;
  faceReferenceAssetId: string;
  videoPath: string;
  videoDurationSeconds: number;
}): Promise<DeepFidelityResult> {
  const [referenceImage, frames] = await Promise.all([
    loadImageDataUrl(input.tenantId, input.faceReferenceAssetId),
    sampleVideoFrames(input.videoPath, input.videoDurationSeconds),
  ]);
  if (frames.length < 4) throw new Error("Não foi possível extrair quadros suficientes do vídeo de referência");

  const openai = await getOpenAIForTenant(input.tenantId);
  const model = process.env["VENDORAI_VISION_MODEL"]?.trim() || "gpt-5.6-luna";
  const frameContent = frames.map((imageUrl) => ({ type: "input_image", image_url: imageUrl, detail: "high" }));
  const response = await (openai.responses.create as any)({
    model,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: "Você é o analisador de qualidade audiovisual do VendorAI. Avalie somente consistência visual e cobertura observável para geração de um dublê digital autorizado. Não faça autenticação biométrica, não determine identidade civil e não infira atributos sensíveis, saúde, etnia, religião, orientação, política ou personalidade psicológica. Use apenas sinais visíveis de apresentação: enquadramento, expressão, olhar, boca, gestos, postura e naturalidade. Responda somente JSON válido.",
        }],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "A primeira imagem é a referência visual autorizada da pessoa. As imagens seguintes são amostras temporais do vídeo de treinamento autorizado. Avalie se o conjunto fornece boa consistência visual e variedade suficiente para treinar/operar um dublê digital. Retorne JSON: scores {faceConsistency, expressionCoverage, gazeCoverage, lipMotionCoverage, gestureCoverage, postureStability, naturalness}, todos 0-100; behaviorDNA {gestureIntensity, expressionIntensity, smileFrequency, gazeVariation, movementEnergy: low|medium|high; postureStyle: upright|relaxed|mixed; presentationStyle: calm|balanced|energetic; notes: string[]}; observations: string[]; recommendations: string[]. faceConsistency significa consistência de aparência com a referência autorizada entre os quadros, não autenticação ou identificação da pessoa. Penalize pouca variedade de ângulos, expressões, olhar, boca ou gestos e explique nas recomendações.",
          },
          { type: "input_image", image_url: referenceImage, detail: "high" },
          ...frameContent,
        ],
      },
    ],
  });

  const text = responseText(response);
  if (!text) throw new Error("O motor de visão não retornou análise de fidelidade");
  return normalizeDeepResult(safeJson(text), model, frames.length);
}

export function buildVendorAiFidelitySummary(input: {
  technicalScore: number | null;
  deepFidelity?: DeepFidelityResult | null;
  latestHumanEvaluation?: { average?: number | null } | null;
}): FidelitySummary {
  const technical = typeof input.technicalScore === "number" ? clampScore(input.technicalScore) : null;
  const visual = input.deepFidelity?.status === "complete" ? clampScore(input.deepFidelity.scores.visualScore) : null;
  const humanAverage = Number(input.latestHumanEvaluation?.average ?? NaN);
  const human = Number.isFinite(humanAverage) ? clampScore(humanAverage * 20) : null;

  const weighted: Array<{ score: number; weight: number }> = [];
  if (technical !== null) weighted.push({ score: technical, weight: 30 });
  if (visual !== null) weighted.push({ score: visual, weight: 50 });
  if (human !== null) weighted.push({ score: human, weight: 20 });
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const score = totalWeight > 0
    ? clampScore(weighted.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight)
    : null;

  const completeness = Math.min(100,
    (technical !== null ? 30 : 0)
      + (visual !== null ? 50 : 0)
      + (human !== null ? 20 : 0),
  );
  const pendingChecks: string[] = [];
  if (technical === null) pendingChecks.push("technical_capture");
  if (visual === null) pendingChecks.push("deep_visual_fidelity");
  if (human === null) pendingChecks.push("human_duble_test");
  if (input.deepFidelity?.pendingAutomaticChecks?.length) pendingChecks.push(...input.deepFidelity.pendingAutomaticChecks);

  return {
    score,
    completeness,
    confidence: completeness < 50 ? "insufficient" : human !== null && visual !== null ? "validated" : "provisional",
    components: { technical, visual, human },
    pendingChecks: Array.from(new Set(pendingChecks)),
  };
}
