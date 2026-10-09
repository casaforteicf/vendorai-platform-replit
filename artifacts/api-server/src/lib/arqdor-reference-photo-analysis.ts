import sharp from "sharp";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getOpenAIForTenant } from "./agent-engine.js";

export type ReferencePhotoKind = "plan" | "terrain" | "room" | "facade" | "inspiration" | "unknown";

export type ReferencePhotoAnalysis = {
  kind: ReferencePhotoKind;
  confidence: number;
  summary: string;
  perspective: "top_down" | "frontal" | "oblique" | "interior" | "unknown";
  needsScaleAnchor: boolean;
  suggestedAnchor?: string;
  detectedElements: string[];
  preserveElements: string[];
  removableElements: string[];
  projectHints: string[];
  sourceModel: string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function safeJson(text: string): JsonRecord {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return asRecord(JSON.parse(cleaned));
}

function clamp01(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function strings(value: unknown, max = 20) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, max)
    : [];
}

function responseText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  if (!Array.isArray(response?.output)) return "";
  const parts: string[] = [];
  for (const item of response.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const part of item.content) {
      if (typeof part?.text === "string") parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}

export function normalizeReferencePhotoAnalysis(raw: unknown, sourceModel: string): ReferencePhotoAnalysis {
  const parsed = asRecord(raw);
  const allowedKinds = new Set<ReferencePhotoKind>(["plan", "terrain", "room", "facade", "inspiration", "unknown"]);
  const allowedPerspectives = new Set(["top_down", "frontal", "oblique", "interior", "unknown"]);
  const kindValue = String(parsed.kind ?? "unknown").toLowerCase() as ReferencePhotoKind;
  const perspectiveValue = String(parsed.perspective ?? "unknown").toLowerCase();

  return {
    kind: allowedKinds.has(kindValue) ? kindValue : "unknown",
    confidence: clamp01(parsed.confidence, 0.5),
    summary: String(parsed.summary ?? "Imagem analisada.").slice(0, 700),
    perspective: allowedPerspectives.has(perspectiveValue)
      ? perspectiveValue as ReferencePhotoAnalysis["perspective"]
      : "unknown",
    needsScaleAnchor: parsed.needsScaleAnchor !== false,
    suggestedAnchor: typeof parsed.suggestedAnchor === "string"
      ? parsed.suggestedAnchor.slice(0, 240)
      : undefined,
    detectedElements: strings(parsed.detectedElements),
    preserveElements: strings(parsed.preserveElements),
    removableElements: strings(parsed.removableElements),
    projectHints: strings(parsed.projectHints),
    sourceModel,
  };
}

export async function analyzeReferencePhoto(input: {
  tenantId: string;
  buffer: Buffer;
}): Promise<ReferencePhotoAnalysis> {
  const normalized = await sharp(input.buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  const systemPrompt = [
    "Você é o módulo de percepção visual do Arqdor para pré-projeto arquitetônico.",
    "Classifique a imagem pelo uso arquitetônico real, sem tentar convertê-la automaticamente em planta.",
    "Diferencie: plan (planta/croqui visto de cima), terrain (foto real de terreno), room (foto real de ambiente interno), facade (foto real de fachada/exterior construído), inspiration (referência estética sem geometria utilizável), unknown.",
    "Para fotos reais, reconheça perspectiva, elementos que devem ser preservados e elementos potencialmente removíveis/substituíveis quando uma nova intervenção ocupar aquela área, como vegetação, móveis soltos ou objetos temporários.",
    "Não invente medidas. Quando não houver escala métrica confiável, needsScaleAnchor deve ser true e suggestedAnchor deve recomendar um elemento visível que o usuário possa medir.",
    "Responda somente JSON válido.",
  ].join(" ");

  const userPrompt = [
    "Analise a imagem para iniciar um pré-projeto.",
    "Retorne {kind,confidence,summary,perspective,needsScaleAnchor,suggestedAnchor,detectedElements,preserveElements,removableElements,projectHints}.",
    "confidence é 0..1.",
    "perspective: top_down|frontal|oblique|interior|unknown.",
    "detectedElements deve listar somente elementos realmente visíveis.",
    "preserveElements deve listar elementos que a edição deve manter por padrão.",
    "removableElements deve listar elementos que podem ser removidos SOMENTE se a nova geometria ocupar a mesma região.",
    "projectHints deve trazer observações curtas úteis para implantação/modelagem, sem criar projeto que não existe.",
  ].join(" ");

  const anthropicModel = process.env["ARQDOR_PHOTO_VISION_MODEL"]?.trim()
    || process.env["ARQDOR_PLAN_VISION_MODEL"]?.trim()
    || "claude-sonnet-4-6";

  try {
    const message = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: 2200,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: normalized.toString("base64"),
            },
          },
          { type: "text", text: userPrompt },
        ],
      }],
    } as any);
    const text = message.content
      .filter((item: any) => item?.type === "text")
      .map((item: any) => String(item.text ?? ""))
      .join("\n")
      .trim();
    if (text) return normalizeReferencePhotoAnalysis(safeJson(text), anthropicModel);
  } catch {
    // OpenAI fallback below.
  }

  const openai = await getOpenAIForTenant(input.tenantId);
  const model = process.env["ARQDOR_PHOTO_VISION_FALLBACK_MODEL"]?.trim()
    || process.env["VENDORAI_VISION_MODEL"]?.trim()
    || "gpt-5.6-luna";
  const dataUrl = `data:image/jpeg;base64,${normalized.toString("base64")}`;
  const response = await (openai.responses.create as any)({
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
      {
        role: "user",
        content: [
          { type: "input_text", text: userPrompt },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
  });
  const text = responseText(response);
  if (!text) throw new Error("A IA não conseguiu classificar a foto.");
  return normalizeReferencePhotoAnalysis(safeJson(text), model);
}
