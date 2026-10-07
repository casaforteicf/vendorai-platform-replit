import sharp from "sharp";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getOpenAIForTenant } from "./agent-engine.js";

export type RealEnvironmentKind = "auto" | "terreno" | "cozinha" | "banheiro" | "sala" | "quarto" | "fachada" | "area_externa" | "piscina" | "escritorio" | "outro";
export type RealEnvironmentUseMode = "existing" | "reference" | "modify";
export type RealEnvironmentAction = "preserve" | "remove" | "replace" | "relocate" | "review";

export type RealEnvironmentElement = {
  id: string;
  label: string;
  category: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  action: RealEnvironmentAction;
  suggestedAction: RealEnvironmentAction;
  reason: string;
  source: "ai" | "user";
};

export type RealEnvironmentAnalysis = {
  version: 1;
  kind: Exclude<RealEnvironmentKind, "auto">;
  useMode: RealEnvironmentUseMode;
  summary: string;
  confidence: number;
  elements: RealEnvironmentElement[];
  warnings: string[];
  analyzedAt: string;
  sourceModel: string;
};

type JsonRecord = Record<string, unknown>;
const KINDS = new Set(["terreno","cozinha","banheiro","sala","quarto","fachada","area_externa","piscina","escritorio","outro"]);
const ACTIONS = new Set<RealEnvironmentAction>(["preserve","remove","replace","relocate","review"]);

function rec(v: unknown): JsonRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? v as JsonRecord : {};
}
function clamp(v: unknown, min=0, max=1, fallback=0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function responseText(response: any) {
  if (typeof response?.output_text === "string") return response.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (typeof part?.text === "string") parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}
function safeJson(text: string): JsonRecord {
  return rec(JSON.parse(text.trim().replace(/^\x60\x60\x60json\s*/i, "").replace(/\x60\x60\x60$/i, "").trim()));
}

export function normalizeRealEnvironment(raw: unknown, input: { requestedKind: RealEnvironmentKind; useMode: RealEnvironmentUseMode; sourceModel?: string }): RealEnvironmentAnalysis {
  const root = rec(raw);
  const detected = String(root.kind ?? "").toLowerCase();
  const kind = (input.requestedKind !== "auto" ? input.requestedKind : (KINDS.has(detected) ? detected : "outro")) as Exclude<RealEnvironmentKind,"auto">;
  const elements: RealEnvironmentElement[] = [];
  const rawElements = Array.isArray(root.elements) ? root.elements : [];

  for (let index = 0; index < Math.min(rawElements.length, 80); index += 1) {
    const item = rec(rawElements[index]);
    const box = rec(item.bbox);
    const suggested = String(item.suggestedAction ?? item.action ?? "preserve") as RealEnvironmentAction;
    const action = ACTIONS.has(suggested) ? suggested : "review";
    elements.push({
      id: String(item.id ?? ("env-" + (index + 1))).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80) || ("env-" + (index + 1)),
      label: String(item.label ?? item.category ?? ("Elemento " + (index + 1))).trim().slice(0,120),
      category: String(item.category ?? "outro").trim().toLowerCase().slice(0,80),
      confidence: clamp(item.confidence,0,1,0.5),
      bbox: { x: clamp(box.x), y: clamp(box.y), width: clamp(box.width,0,1,0.1), height: clamp(box.height,0,1,0.1) },
      action,
      suggestedAction: action,
      reason: String(item.reason ?? "").trim().slice(0,500),
      source: "ai",
    });
  }

  return {
    version: 1,
    kind,
    useMode: input.useMode,
    summary: String(root.summary ?? "").trim().slice(0,1000) || "Ambiente real analisado.",
    confidence: clamp(root.confidence,0,1,0.5),
    elements,
    warnings: (Array.isArray(root.warnings) ? root.warnings : []).map(v => String(v).slice(0,500)).slice(0,20),
    analyzedAt: new Date().toISOString(),
    sourceModel: input.sourceModel ?? "unknown",
  };
}

export function interventionPromptContext(analysis: RealEnvironmentAnalysis | null | undefined) {
  if (!analysis || analysis.useMode === "reference") return "";
  const pick = (action: RealEnvironmentAction) => analysis.elements.filter(e => e.action === action).map(e => e.label);
  const preserve = pick("preserve"), remove = pick("remove"), replace = pick("replace"), relocate = pick("relocate"), review = pick("review");
  return [
    "REAL ENVIRONMENT LOCK:",
    "Scene type: " + analysis.kind + ". This is a real existing place, not inspiration or a mockup.",
    preserve.length ? "PRESERVE exactly where visible: " + preserve.join(", ") + "." : "",
    remove.length ? "REMOVE only these user-confirmed existing elements when required by the designed intervention: " + remove.join(", ") + "." : "",
    replace.length ? "REPLACE only these user-confirmed elements: " + replace.join(", ") + "." : "",
    relocate.length ? "RELOCATE only these user-confirmed elements: " + relocate.join(", ") + "." : "",
    review.length ? "UNCONFIRMED - do not remove automatically: " + review.join(", ") + "." : "",
    "Never invent demolition, vegetation removal, wall removal or object removal. Anything not explicitly marked remove/replace/relocate must be preserved.",
    "Keep camera, perspective, neighbors, road, sidewalks, terrain cues and unaffected surroundings coherent with the source photo.",
  ].filter(Boolean).join(" ");
}

export async function analyzeRealEnvironmentImage(input: { tenantId: string; buffer: Buffer; mimeType: string; requestedKind: RealEnvironmentKind; useMode: RealEnvironmentUseMode }): Promise<RealEnvironmentAnalysis> {
  const normalized = await sharp(input.buffer).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  const b64 = normalized.toString("base64");
  const system = [
    "Voce e um arquiteto especialista em leitura fotografica de ambientes reais.",
    "Analise somente o que esta visivel. Nao invente medidas, objetos, limites, paredes ou vegetacao.",
    "A imagem sera usada como base real para projeto; fidelidade factual e mais importante que estetica.",
    "Detecte elementos existentes relevantes, com bbox normalizada 0..1 na imagem inteira.",
    "Use preserve por padrao e review quando houver duvida. Nunca sugira remocao apenas por estetica.",
    "Em terreno identifique vegetacao, arvores, muros, cercas, rua, calcada, acessos, postes, vizinhos, construcoes e desniveis aparentes.",
    "Em interiores identifique paredes, aberturas, bancadas, marcenaria, loucas, eletros, moveis e elementos fixos.",
    "Responda somente JSON valido."
  ].join(" ");
  const user = [
    "Tipo declarado: " + input.requestedKind + ". Uso: " + input.useMode + ".",
    "Retorne {kind,summary,confidence,elements,warnings}.",
    "elements: [{id,label,category,confidence,bbox:{x,y,width,height},suggestedAction,reason}].",
    "kind: terreno|cozinha|banheiro|sala|quarto|fachada|area_externa|piscina|escritorio|outro.",
    "suggestedAction: preserve|review. Nao ha autorizacao para remocoes nesta etapa.",
    "Nao estime dimensoes metricas pela foto."
  ].join(" ");

  let raw = "";
  let model = process.env["ARQDOR_ENVIRONMENT_VISION_MODEL"]?.trim() || "claude-sonnet-4-6";
  try {
    const message = await anthropic.messages.create({
      model,
      max_tokens: 5000,
      system,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
        { type: "text", text: user },
      ] }],
    } as any);
    raw = message.content.filter((p:any) => p?.type === "text").map((p:any) => String(p.text ?? "")).join("\n");
  } catch {
    const openai = await getOpenAIForTenant(input.tenantId);
    model = process.env["VENDORAI_VISION_MODEL"]?.trim() || "gpt-5.6-luna";
    const response = await (openai.responses.create as any)({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }, { type: "input_image", image_url: "data:image/jpeg;base64," + b64, detail: "high" }] },
      ],
    });
    raw = responseText(response);
  }

  if (!raw) throw new Error("A IA nao retornou uma leitura do ambiente.");
  return normalizeRealEnvironment(safeJson(raw), { requestedKind: input.requestedKind, useMode: input.useMode, sourceModel: model });
}
