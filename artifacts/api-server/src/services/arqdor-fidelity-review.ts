import { z } from "zod/v4";
import type { Logger } from "pino";
import type OpenAI from "openai";
import { callOpenAI } from "../lib/ai-gateway.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const FIDELITY_MODEL = "gpt-4o-mini";

const fidelityDimensionSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).max(6).default([]),
});

const fidelityIssueSchema = z.object({
  category: z.enum(["CAMERA", "GEOMETRY", "OPENINGS", "VOLUMETRY", "MATERIAL", "LIGHTING", "OTHER"]),
  severity: z.enum(["MINOR", "MAJOR", "CRITICAL"]),
  description: z.string().min(1),
  evidence: z.string().min(1),
  unsolicited: z.boolean(),
});

export const arqdorFidelityReviewSchema = z.object({
  overallScore: z.number().min(0).max(100),
  camera: fidelityDimensionSchema,
  geometry: fidelityDimensionSchema,
  openings: fidelityDimensionSchema,
  volumetry: fidelityDimensionSchema,
  materials: fidelityDimensionSchema,
  lighting: fidelityDimensionSchema,
  unsolicitedChanges: z.array(fidelityIssueSchema).default([]),
  acceptedChanges: z.array(fidelityIssueSchema).default([]),
  summary: z.string().min(1),
  requiresHumanReview: z.boolean(),
});

export type ArqdorFidelityReview = z.infer<typeof arqdorFidelityReviewSchema>;

async function privateObjectToDataUrl(objectPath: string): Promise<string> {
  const storage = new ObjectStorageService();
  const file = await storage.getObjectEntityFile(objectPath);
  const [[buffer], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
  const mime = metadata.contentType || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function toVisionUrl(url: string): Promise<string> {
  if (url.startsWith("data:image/")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/objects/")) return privateObjectToDataUrl(url);
  if (url.startsWith("/api/storage/objects/")) {
    const objectPath = `/objects/${url.replace(/^\/api\/storage\/objects\//, "")}`;
    return privateObjectToDataUrl(objectPath);
  }
  throw new Error(`URL de imagem não suportada no Fidelity Review: ${url.slice(0, 80)}`);
}

function parseJsonPayload(content: string): unknown {
  const trimmed = content.trim().replace(/^\`\`\`json\s*/i, "").replace(/\`\`\`$/i, "").trim();
  return JSON.parse(trimmed);
}

export async function reviewArqdorFidelity(input: {
  tenantId: string;
  baseImageUrl: string;
  renderImageUrl: string;
  requestedChange?: string | null;
  log?: Logger;
}) {
  const [baseImageUrl, renderImageUrl] = await Promise.all([
    toVisionUrl(input.baseImageUrl),
    toVisionUrl(input.renderImageUrl),
  ]);
  const requestedChange = input.requestedChange?.trim() || "Nenhuma alteração específica informada; trate toda mudança estrutural como potencialmente não solicitada.";
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: "text", text: [
      "Compare rigorosamente as duas imagens de arquitetura/interiores.",
      "A primeira é a IMAGEM BASE e a segunda é a VERSÃO GERADA.",
      `Alteração solicitada ao render: ${requestedChange}`,
      "Avalie fidelidade visual, não qualidade estética.",
      "Pontue 0-100 câmera/perspectiva, geometria, aberturas (portas/janelas/vãos), volumetria, materiais e iluminação.",
      "Marque como unsolicited=true qualquer alteração visível que não seja necessária para cumprir a alteração solicitada.",
      "Cada conclusão deve ter evidência visual concreta. Se não houver evidência suficiente, reduza confidence em vez de inventar.",
      "Retorne SOMENTE JSON válido no formato solicitado.",
    ].join("\n") },
    { type: "image_url", image_url: { url: baseImageUrl, detail: "high" } },
    { type: "image_url", image_url: { url: renderImageUrl, detail: "high" } },
  ];
  const result = await callOpenAI(input.tenantId, "intelligence_analysis", [
    { role: "system", content: "Você é um revisor técnico de fidelidade arquitetônica. Compare somente o que é visível nas imagens, seja conservador e nunca invente diferenças. O resultado deve ser auditável por evidências." },
    { role: "user", content: userContent } as any,
  ], {
    model: FIDELITY_MODEL,
    temperature: 0.1,
    maxTokens: 1600,
    responseFormat: { type: "json_object" },
    log: input.log,
  });
  const review = arqdorFidelityReviewSchema.parse(parseJsonPayload(result.content));
  return { review, model: FIDELITY_MODEL, costUsd: result.costUsd, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}
