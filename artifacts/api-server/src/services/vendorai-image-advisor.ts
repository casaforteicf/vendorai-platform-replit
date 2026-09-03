import { and, eq } from "drizzle-orm";
import { db, mediaAssetsTable } from "@workspace/db";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const objectStorage = new ObjectStorageService();

export class ImageAdvisorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageAdvisorValidationError";
  }
}

export type ImageImprovementSuggestion = {
  id: string;
  title: string;
  description: string;
  category: "lighting" | "color" | "sharpness" | "composition" | "background" | "perspective" | "cleanup" | "marketing" | "other";
  priority: "high" | "medium" | "low";
  recommendedIntensity: number;
  prompt: string;
};

export type ImageAdvisorResult = {
  summary: string;
  strengths: string[];
  issues: string[];
  suggestions: ImageImprovementSuggestion[];
  technicalPreset: {
    brightness: number;
    saturation: number;
    sharpen: number;
    quality: number;
  };
  recommendedPrompt: string;
};

function safeJson(text: string): Record<string, unknown> {
  const stripped = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    throw new Error("A análise visual retornou um formato inválido");
  }
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function strings(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit);
}

function suggestions(value: unknown): ImageImprovementSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((raw, index) => {
    const item = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const category = String(item.category ?? "other") as ImageImprovementSuggestion["category"];
    const priority = String(item.priority ?? "medium") as ImageImprovementSuggestion["priority"];
    return {
      id: String(item.id ?? `suggestion-${index + 1}`),
      title: String(item.title ?? "Melhoria sugerida").slice(0, 120),
      description: String(item.description ?? "").slice(0, 500),
      category: ["lighting", "color", "sharpness", "composition", "background", "perspective", "cleanup", "marketing", "other"].includes(category) ? category : "other",
      priority: ["high", "medium", "low"].includes(priority) ? priority : "medium",
      recommendedIntensity: Math.round(clamp(item.recommendedIntensity, 0, 100, 50)),
      prompt: String(item.prompt ?? item.description ?? "Improve the image professionally while preserving the original subject.").slice(0, 1200),
    };
  });
}

export async function analyzeMediaImage(input: {
  tenantId: string;
  assetId: string;
  goal?: string | null;
}): Promise<ImageAdvisorResult> {
  const [asset] = await db.select().from(mediaAssetsTable).where(and(
    eq(mediaAssetsTable.id, input.assetId),
    eq(mediaAssetsTable.tenantId, input.tenantId),
    eq(mediaAssetsTable.type, "image"),
  )).limit(1);

  if (!asset) throw new ImageAdvisorValidationError("Imagem não encontrada neste tenant");
  if (!asset.storageUrl?.startsWith("/objects/")) throw new ImageAdvisorValidationError("A imagem precisa estar no Object Storage do VendorAI");

  const file = await objectStorage.getObjectEntityFile(asset.storageUrl);
  const [buffer] = await file.download();
  if (!buffer.length) throw new ImageAdvisorValidationError("A imagem está vazia");

  const mimeType = asset.mimeType?.startsWith("image/") ? asset.mimeType : "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const openai = await getOpenAIForTenant(input.tenantId);
  const goal = input.goal?.trim() || "uso profissional em marketing, catálogo, site e redes sociais";

  const response = await (openai.chat.completions.create as any)({
    model: process.env["VENDORAI_VISION_MODEL"]?.trim() || "gpt-5.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Você é o Diretor de Arte e especialista em tratamento de imagem do VendorAI. Analise imagens de forma conservadora: preserve produto, arquitetura, materiais, logotipos, texto real, geometria, proporções e identidade. Nunca sugira mudanças que falseiem o produto. Responda somente JSON válido.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analise esta imagem para ${goal}. Retorne JSON com: summary (string), strengths (array), issues (array), suggestions (array de até 8 itens com id,title,description,category,priority,recommendedIntensity 0-100,prompt), technicalPreset {brightness 0.7-1.4,saturation 0-2,sharpen 0.3-3,quality 35-100}, recommendedPrompt. As sugestões devem ser práticas e separáveis, permitindo o usuário escolher quais aplicar e ajustar intensidade.`,
          },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
  });

  const text = String(response.choices?.[0]?.message?.content ?? "");
  const parsed = safeJson(text);
  const preset = parsed.technicalPreset && typeof parsed.technicalPreset === "object" && !Array.isArray(parsed.technicalPreset)
    ? parsed.technicalPreset as Record<string, unknown>
    : {};

  return {
    summary: String(parsed.summary ?? "Análise concluída."),
    strengths: strings(parsed.strengths),
    issues: strings(parsed.issues),
    suggestions: suggestions(parsed.suggestions),
    technicalPreset: {
      brightness: clamp(preset.brightness, 0.7, 1.4, 1.04),
      saturation: clamp(preset.saturation, 0, 2, 1.05),
      sharpen: clamp(preset.sharpen, 0.3, 3, 0.8),
      quality: Math.round(clamp(preset.quality, 35, 100, 92)),
    },
    recommendedPrompt: String(parsed.recommendedPrompt ?? "Improve lighting, color balance, clarity and presentation while preserving the original subject exactly.").slice(0, 2500),
  };
}
