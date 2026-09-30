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
  alignmentScore?: number;
  alignmentCorrection?: {
    scale: number;
    translateX: number;
    translateY: number;
  };
  topologyRepairs?: number;
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

function isRetryableRateLimit(error: any) {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (
    message.includes("insufficient_quota")
    || message.includes("exceeded your current quota")
    || message.includes("billing hard limit")
  ) return false;
  return status === 429 || message.includes("rate limit") || message.includes("too many requests");
}

async function withTransientRateLimitRetry<T>(
  work: () => Promise<T>,
  delaysMs = [1500, 3500, 7000],
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (!isRetryableRateLimit(error) || attempt >= delaysMs.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
  throw lastError;
}


function refineWallTopology(
  walls: ReferenceTraceWall[],
  tolerance = 0.16,
): { walls: ReferenceTraceWall[]; repairs: number } {
  if (walls.length < 2) return { walls, repairs: 0 };

  const next = walls.map((wall) => ({ ...wall }));
  let repairs = 0;

  const endpoint = (wall: ReferenceTraceWall, which: "start" | "end") =>
    which === "start" ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 };

  const assignEndpoint = (
    wall: ReferenceTraceWall,
    which: "start" | "end",
    point: { x: number; y: number },
  ) => {
    const horizontal = Math.abs(wall.y1 - wall.y2) < 0.001;
    if (horizontal) {
      if (which === "start") {
        wall.x1 = point.x;
        wall.y1 = point.y;
        wall.y2 = point.y;
      } else {
        wall.x2 = point.x;
        wall.y2 = point.y;
        wall.y1 = point.y;
      }
    } else {
      if (which === "start") {
        wall.x1 = point.x;
        wall.y1 = point.y;
        wall.x2 = point.x;
      } else {
        wall.x2 = point.x;
        wall.y2 = point.y;
        wall.x1 = point.x;
      }
    }
  };

  for (let i = 0; i < next.length; i += 1) {
    const wall = next[i];
    for (const which of ["start", "end"] as const) {
      const point = endpoint(wall, which);
      let best:
        | { x: number; y: number; distance: number; priority: number }
        | undefined;

      for (let j = 0; j < next.length; j += 1) {
        if (i === j) continue;
        const other = next[j];
        const wallHorizontal = Math.abs(wall.y1 - wall.y2) < 0.001;
        const otherHorizontal = Math.abs(other.y1 - other.y2) < 0.001;

        for (const otherWhich of ["start", "end"] as const) {
          const candidate = endpoint(other, otherWhich);
          const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
          if (
            distance <= tolerance
            && (!best || best.priority > 1 || (best.priority === 1 && distance < best.distance))
          ) {
            best = { ...candidate, distance, priority: 1 };
          }
        }

        if (wallHorizontal !== otherHorizontal) {
          const projected = wallHorizontal
            ? { x: other.x1, y: wall.y1 }
            : { x: wall.x1, y: other.y1 };
          const withinOther = otherHorizontal
            ? projected.x >= Math.min(other.x1, other.x2) - 0.01 && projected.x <= Math.max(other.x1, other.x2) + 0.01
            : projected.y >= Math.min(other.y1, other.y2) - 0.01 && projected.y <= Math.max(other.y1, other.y2) + 0.01;
          if (withinOther) {
            const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
            if (
              distance <= tolerance
              && (!best || best.priority > 0 || (best.priority === 0 && distance < best.distance))
            ) {
              best = { ...projected, distance, priority: 0 };
            }
          }
        }
      }

      if (best && best.distance > 0.003) {
        assignEndpoint(wall, which, best);
        repairs += 1;
      }
    }
  }

  // Depois de encaixar junções, arredondamos apenas ruído milimétrico.
  for (const wall of next) {
    wall.x1 = Math.round(wall.x1 * 1000) / 1000;
    wall.y1 = Math.round(wall.y1 * 1000) / 1000;
    wall.x2 = Math.round(wall.x2 * 1000) / 1000;
    wall.y2 = Math.round(wall.y2 * 1000) / 1000;
  }

  return { walls: next, repairs };
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
    if (major < 0.2 || minor / major > 0.18) {
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

  const refinedTopology = refineWallTopology(walls);
  walls.splice(0, walls.length, ...refinedTopology.walls);

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
  if (refinedTopology.repairs) warnings.push(`${refinedTopology.repairs} junção(ões) foram encaixadas automaticamente sem alterar a distribuição da planta.`);
  if (!walls.length) warnings.push("Nenhuma parede confiável foi identificada na imagem.");

  return {
    summary: String(parsed.summary ?? "Leitura visual concluída.").slice(0, 500),
    confidence: clamp(parsed.confidence, 0, 1, walls.length ? 0.6 : 0),
    walls,
    openings,
    warnings,
    skippedWalls,
    sourceModel,
    topologyRepairs: refinedTopology.repairs,
  };
}


type TraceRegistration = {
  raw: JsonRecord;
  score: number;
  correction: { scale: number; translateX: number; translateY: number };
};

function wallInkScore(
  raw: JsonRecord,
  pixels: Buffer,
  width: number,
  height: number,
  scale: number,
  translateX: number,
  translateY: number,
) {
  const rawWalls = Array.isArray(raw.walls) ? raw.walls.slice(0, 160) : [];
  if (!rawWalls.length || width < 2 || height < 2) return 0;

  let total = 0;
  let samples = 0;
  for (const value of rawWalls) {
    const wall = asRecord(value);
    const x1 = Number(wall.x1);
    const y1 = Number(wall.y1);
    const x2 = Number(wall.x2);
    const y2 = Number(wall.y2);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

    const tx1 = 0.5 + (x1 - 0.5) * scale + translateX;
    const ty1 = 0.5 + (y1 - 0.5) * scale + translateY;
    const tx2 = 0.5 + (x2 - 0.5) * scale + translateX;
    const ty2 = 0.5 + (y2 - 0.5) * scale + translateY;
    const lengthPx = Math.hypot((tx2 - tx1) * width, (ty2 - ty1) * height);
    const steps = Math.max(5, Math.min(28, Math.round(lengthPx / 32)));

    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const nx = tx1 + (tx2 - tx1) * t;
      const ny = ty1 + (ty2 - ty1) * t;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
      const px = Math.max(0, Math.min(width - 1, Math.round(nx * (width - 1))));
      const py = Math.max(0, Math.min(height - 1, Math.round(ny * (height - 1))));
      let darkest = 255;
      for (let oy = -2; oy <= 2; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
          const sx = Math.max(0, Math.min(width - 1, px + ox));
          const sy = Math.max(0, Math.min(height - 1, py + oy));
          darkest = Math.min(darkest, pixels[sy * width + sx] ?? 255);
        }
      }
      total += 1 - darkest / 255;
      samples += 1;
    }
  }
  return samples ? total / samples : 0;
}

async function registerTraceToImage(raw: JsonRecord, image: Buffer): Promise<TraceRegistration> {
  const { data, info } = await sharp(image)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;

  let best = {
    score: wallInkScore(raw, data, width, height, 1, 0, 0),
    scale: 1,
    translateX: 0,
    translateY: 0,
  };

  // A leitura visual pode deslocar alguns pontos percentuais. Refinamos somente
  // uma transformação global pequena, sem mudar a distribuição arquitetônica.
  const scales = [0.96, 0.98, 1, 1.02, 1.04];
  const shifts = [-0.04, -0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04];
  for (const scale of scales) {
    for (const translateX of shifts) {
      for (const translateY of shifts) {
        const score = wallInkScore(raw, data, width, height, scale, translateX, translateY);
        if (score > best.score + 0.006) {
          best = { score, scale, translateX, translateY };
        }
      }
    }
  }

  if (best.scale === 1 && best.translateX === 0 && best.translateY === 0) {
    return { raw, score: best.score, correction: { scale: 1, translateX: 0, translateY: 0 } };
  }

  const nextWalls = (Array.isArray(raw.walls) ? raw.walls : []).map((value) => {
    const wall = asRecord(value);
    const transform = (v: unknown, shift: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return v;
      return Math.max(0, Math.min(1, 0.5 + (n - 0.5) * best.scale + shift));
    };
    return {
      ...wall,
      x1: transform(wall.x1, best.translateX),
      y1: transform(wall.y1, best.translateY),
      x2: transform(wall.x2, best.translateX),
      y2: transform(wall.y2, best.translateY),
    };
  });

  return {
    raw: { ...raw, walls: nextWalls },
    score: best.score,
    correction: { scale: best.scale, translateX: best.translateX, translateY: best.translateY },
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

  const response = await withTransientRateLimitRetry(() => (openai.responses.create as any)({
    model,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: [
            "Você é um especialista em vetorização fiel de plantas arquitetônicas residenciais brasileiras, incluindo pré-plantas e croquis desenhados à mão ou digitalizados.",
            "Sua tarefa é reconstruir como geometria editável somente o que está visível na imagem, sem projetar, melhorar, completar ou reinterpretar a planta.",
            "NÃO invente paredes, portas, janelas, ambientes, alinhamentos ou dimensões ausentes. Se algo estiver encoberto, cortado ou ambíguo, omita e registre em warnings.",
            "Mantenha a posição dos elementos exatamente no sistema de coordenadas da IMAGEM INTEIRA, incluindo margens em branco, carimbo, textos e áreas vazias.",
            "Esta versão gera paredes ortogonais horizontais/verticais. Em croquis, tolere pequenas inclinações de traço quando a intenção ortogonal for clara e normalize-as para horizontal/vertical; diagonais arquitetônicas reais ou curvas devem ser omitidas e citadas em warnings.",
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
              "Identifique paredes e aberturas VISÍVEIS no croqui, pré-planta ou planta técnica e reproduza o desenho como uma planta vetorial editável sem alterar sua distribuição.",
              "Todas as coordenadas devem ser normalizadas entre 0 e 1 em relação à imagem inteira, nunca em relação apenas ao retângulo da planta.",
              "Use x=0 na borda esquerda da imagem, x=1 na borda direita, y=0 no topo e y=1 na base. Preserve margens e deslocamentos existentes na imagem.",
              "Para cada parede informe x1,y1,x2,y2, thickness em metros e confidence 0..1.",
              "Use preferencialmente o eixo central da espessura visual da parede para x1,y1,x2,y2, mantendo encontros T e cruzamentos coincidentes.",
              "Retorne somente paredes claramente observáveis ou claramente pretendidas como ortogonais. Ignore mobiliário, textos, hachuras, setas, rabiscos soltos e muros sem definição. Cotas legíveis podem ajudar a validar proporções, mas nunca justificam criar geometria não desenhada.",
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
  }));

  const text = responseText(response);
  if (!text) throw new Error("A IA não retornou um traçado utilizável.");
  let parsed: JsonRecord;
  try {
    parsed = safeJson(text);
  } catch {
    throw new Error("A IA retornou um formato inválido ao interpretar a planta.");
  }
  const registration = await registerTraceToImage(parsed, normalized);
  const result = normalizeReferenceTrace(registration.raw, input.bounds, model);
  const correctionMagnitude =
    Math.abs(registration.correction.scale - 1)
    + Math.abs(registration.correction.translateX)
    + Math.abs(registration.correction.translateY);
  if (correctionMagnitude > 0.001) {
    result.warnings.push(
      "O Arqdor refinou automaticamente escala/posição do traçado para coincidir melhor com as linhas da imagem.",
    );
  }
  result.alignmentScore = Math.round(registration.score * 1000) / 1000;
  result.alignmentCorrection = registration.correction;
  if (result.alignmentScore < 0.22) {
    result.warnings.push("A coincidência visual ainda está baixa. Confira a calibração e use Sobreposição antes de aplicar.");
  }
  return result;
}
