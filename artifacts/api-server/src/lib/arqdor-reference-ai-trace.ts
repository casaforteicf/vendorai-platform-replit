import sharp from "sharp";
import { getOpenAIForTenant } from "./agent-engine.js";

export type ReferenceTraceBounds = {
  x: number;
  y: number;
  width: number;
  depth: number;
};

export type ReferenceTraceWall = {
  id: string;
  floor: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  confidence: number;
};

export type ReferenceTraceOpening = {
  id: string;
  wallId: string;
  floor: number;
  type: "door" | "window";
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  confidence: number;
};

export type ReferenceTraceResult = {
  summary: string;
  confidence: number;
  walls: ReferenceTraceWall[];
  openings: ReferenceTraceOpening[];
  warnings: string[];
  skippedWalls: number;
  sourceModel: string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function safeJson(text: string): JsonRecord {
  const cleaned = text.trim().replace(/^\`\`\`json\s*/i, "").replace(/\`\`\`$/i, "").trim();
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

export function normalizeReferenceTrace(raw: unknown, bounds: ReferenceTraceBounds, sourceModel = "test"): ReferenceTraceResult {
  const parsed = asRecord(raw);
  const rawWalls = Array.isArray(parsed.walls) ? parsed.walls.slice(0, 500) : [];
  const walls: ReferenceTraceWall[] = [];
  const wallIndexMap = new Map<number, string>();
  let skippedWalls = 0;

  rawWalls.forEach((value, index) => {
    const wall = asRecord(value);
    const nx1 = clamp(wall.x1, 0, 1, NaN);
    const ny1 = clamp(wall.y1, 0, 1, NaN);
    const nx2 = clamp(wall.x2, 0, 1, NaN);
    const ny2 = clamp(wall.y2, 0, 1, NaN);
    if (![nx1, ny1, nx2, ny2].every(Number.isFinite)) {
      skippedWalls += 1;
      return;
    }

    let x1 = bounds.x + nx1 * bounds.width;
    let y1 = bounds.y + ny1 * bounds.depth;
    let x2 = bounds.x + nx2 * bounds.width;
    let y2 = bounds.y + ny2 * bounds.depth;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const major = Math.max(Math.abs(dx), Math.abs(dy));
    const minor = Math.min(Math.abs(dx), Math.abs(dy));
    if (major < 0.2 || minor / major > 0.08) {
      skippedWalls += 1;
      return;
    }

    if (Math.abs(dx) >= Math.abs(dy)) y2 = y1;
    else x2 = x1;

    const id = `trace-wall-${walls.length + 1}`;
    walls.push({
      id,
      floor: 0,
      x1: Math.round(x1 * 1000) / 1000,
      y1: Math.round(y1 * 1000) / 1000,
      x2: Math.round(x2 * 1000) / 1000,
      y2: Math.round(y2 * 1000) / 1000,
      thickness: Math.round(clamp(wall.thickness, 0.08, 0.4, 0.14) * 1000) / 1000,
      confidence: clamp(wall.confidence, 0, 1, 0.5),
    });
    wallIndexMap.set(index, id);
  });

  const openings: ReferenceTraceOpening[] = [];
  const rawOpenings = Array.isArray(parsed.openings) ? parsed.openings.slice(0, 250) : [];
  rawOpenings.forEach((value) => {
    const opening = asRecord(value);
    const sourceWallIndex = Math.round(Number(opening.wallIndex));
    const wallId = wallIndexMap.get(sourceWallIndex);
    if (!wallId) return;
    const type = String(opening.type ?? "").toLowerCase() === "window" ? "window" : "door";
    openings.push({
      id: `trace-opening-${openings.length + 1}`,
      wallId,
      floor: 0,
      type,
      offset: Math.round(clamp(opening.offset, 0.02, 0.98, 0.5) * 10000) / 10000,
      width: Math.round(clamp(opening.width, 0.3, 4, type === "door" ? 0.9 : 1.2) * 1000) / 1000,
      height: Math.round(clamp(opening.height, 0.5, 4.5, type === "door" ? 2.1 : 1.2) * 1000) / 1000,
      sillHeight: Math.round(clamp(opening.sillHeight, 0, 2.5, type === "window" ? 1 : 0) * 1000) / 1000,
      confidence: clamp(opening.confidence, 0, 1, 0.5),
    });
  });

  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 10)
    : [];
  if (skippedWalls) warnings.push(`${skippedWalls} segmento(s) foram descartados por baixa compatibilidade geométrica.`);
  if (!walls.length) warnings.push("Nenhuma parede confiável foi identificada na imagem.");

  return {
    summary: String(parsed.summary ?? "Leitura visual concluída.").slice(0, 500),
    confidence: clamp(parsed.confidence, 0, 1, walls.length ? 0.6 : 0),
    walls,
    openings,
    warnings,
    skippedWalls,
    sourceModel,
  };
}

export async function traceReferencePlanImage(input: {
  tenantId: string;
  buffer: Buffer;
  mimeType: string;
  bounds: ReferenceTraceBounds;
}): Promise<ReferenceTraceResult> {
  const normalized = await sharp(input.buffer)
    .flatten({ background: "#ffffff" })
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const dataUrl = `data:image/jpeg;base64,${normalized.toString("base64")}`;
  const openai = await getOpenAIForTenant(input.tenantId);
  const model = process.env["ARQDOR_PLAN_VISION_MODEL"]?.trim()
    || process.env["VENDORAI_VISION_MODEL"]?.trim()
    || "gpt-5.6-luna";

  const response = await (openai.responses.create as any)({
    model,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: [
            "Você é um especialista em vetorização fiel de plantas arquitetônicas residenciais brasileiras.",
            "Sua tarefa é copiar a geometria visível da imagem, não projetar, melhorar, completar ou reinterpretar a planta.",
            "NÃO invente paredes, portas, janelas, ambientes, alinhamentos ou dimensões ausentes. Se algo estiver encoberto, cortado ou ambíguo, omita e registre em warnings.",
            "Mantenha a posição dos elementos exatamente no sistema de coordenadas da IMAGEM INTEIRA, incluindo margens em branco, carimbo, textos e áreas vazias.",
            "Esta versão aceita somente paredes ortogonais horizontais/verticais; segmentos diagonais ou curvos devem ser omitidos e citados em warnings.",
            "Responda SOMENTE JSON válido, sem markdown.",
          ].join(" "),
        }],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Identifique paredes e aberturas VISÍVEIS e reproduza o desenho sem alterar sua distribuição.",
              "Todas as coordenadas devem ser normalizadas entre 0 e 1 em relação à imagem inteira, nunca em relação apenas ao retângulo da planta.",
              "Use x=0 na borda esquerda da imagem, x=1 na borda direita, y=0 no topo e y=1 na base. Preserve margens e deslocamentos existentes na imagem.",
              "Para cada parede informe x1,y1,x2,y2, thickness em metros e confidence 0..1.",
              "Use preferencialmente o eixo central da espessura visual da parede para x1,y1,x2,y2, mantendo encontros T e cruzamentos coincidentes.",
              "Retorne somente paredes claramente observáveis e ortogonais. Ignore mobiliário, cotas, textos, hachuras, setas e muros sem definição.",
              "Não redistribua cômodos e não feche automaticamente lacunas que não estejam desenhadas.",
              "Para cada porta/janela use wallIndex apontando para o índice ZERO-BASED da parede no array walls,",
              "type door|window, offset 0..1 ao longo da parede, width/height/sillHeight em metros, confidence 0..1.",
              "JSON: {summary:string, confidence:number, walls:[{x1,y1,x2,y2,thickness,confidence}], openings:[{wallIndex,type,offset,width,height,sillHeight,confidence}], warnings:string[]}.",
              "Se houver dúvida relevante, omita o elemento e explique em warnings.",
            ].join(" "),
          },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
  });

  const text = responseText(response);
  if (!text) throw new Error("A IA não retornou um traçado utilizável.");
  let parsed: JsonRecord;
  try {
    parsed = safeJson(text);
  } catch {
    throw new Error("A IA retornou um formato inválido ao interpretar a planta.");
  }
  return normalizeReferenceTrace(parsed, input.bounds, model);
}
