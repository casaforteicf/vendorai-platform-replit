import crypto from "node:crypto";
import { callOpenAIFileExtraction } from "./ai-gateway.js";

type JsonRecord = Record<string, unknown>;

export type ArqdorImportedWall = {
  id?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
  classification?: "internal" | "external" | "unknown";
  material?: string | null;
  confidence?: number;
  evidence?: string[];
};

export type ArqdorImportedOpening = {
  id?: string;
  code?: string | null;
  wallIndex?: number | null;
  wallId?: string | null;
  type: "door" | "window" | "opening";
  offset?: number | null;
  width?: number | null;
  height?: number | null;
  sillHeight?: number | null;
  confidence?: number;
  evidence?: string[];
};

export type ArqdorImportedFloorPlan = {
  page: number;
  label?: string | null;
  confidence: number;
  widthMeters?: number | null;
  depthMeters?: number | null;
  requiresCalibration: boolean;
  walls: ArqdorImportedWall[];
  openings: ArqdorImportedOpening[];
  rooms: Array<JsonRecord>;
  dimensions: Array<JsonRecord>;
  warnings: string[];
};

export type ArqdorProjectImportMemory = {
  summary: string;
  projectType?: string | null;
  totalAreaM2?: number | null;
  floors?: number | null;
  rooms: Array<JsonRecord>;
  openings: Array<JsonRecord>;
  materials: Array<JsonRecord>;
  roof?: JsonRecord | null;
  technicalNotes: Array<string>;
  inconsistencies: Array<string>;
  sourcePages: Array<JsonRecord>;
  floorPlans: ArqdorImportedFloorPlan[];
  facades: Array<{
    page: number;
    label?: string | null;
    orientation?: "front" | "rear" | "left" | "right" | "unknown";
    confidence: number;
    style?: string | null;
    materials: Array<JsonRecord>;
    openings: Array<JsonRecord>;
    architecturalFeatures: Array<JsonRecord>;
    heights: Array<JsonRecord>;
    evidence: string[];
  }>;
  sections: Array<{
    page: number;
    label?: string | null;
    confidence: number;
    levels: Array<JsonRecord>;
    heights: Array<JsonRecord>;
    roof: JsonRecord | null;
    evidence: string[];
  }>;
};

export type ArqdorUniversalCandidate = {
  kind: "pre_project" | "facade" | "roof" | "opening" | "room" | "complete_project";
  title: string;
  description?: string | null;
  confidence: number;
  architecture: JsonRecord;
  metadata: JsonRecord;
  provenance: JsonRecord;
};

export type ArqdorIntelligentProjectImport = {
  version: 1;
  document: {
    pages: number | null;
    detectedSheets: Array<{
      page: number;
      type: "site_plan" | "floor_plan" | "roof_plan" | "section" | "facade" | "schedule" | "detail" | "notes" | "render" | "other";
      label?: string | null;
      confidence: number;
    }>;
  };
  memory: ArqdorProjectImportMemory;
  universalCandidates: ArqdorUniversalCandidate[];
  warnings: string[];
};

const PII_KEYS = new Set([
  "owner", "owners", "proprietario", "proprietarios", "cliente", "client", "name", "nome_proprietario",
  "cpf", "cnpj", "email", "telefone", "phone", "address", "endereco", "street", "rua", "matricula",
]);

function clamp01(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function cleanJson(text: string): JsonRecord {
  const normalized = text.trim().replace(/^\`\`\`json\s*/i, "").replace(/\`\`\`$/i, "").trim();
  return record(JSON.parse(normalized));
}

function sanitizeUniversalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeUniversalValue);
  if (!value || typeof value !== "object") return value;
  const output: JsonRecord = {};
  for (const [key, item] of Object.entries(value as JsonRecord)) {
    const normalizedKey = key.trim().toLowerCase();
    if (PII_KEYS.has(normalizedKey) || normalizedKey.includes("cpf") || normalizedKey.includes("telefone") || normalizedKey.includes("email")) {
      continue;
    }
    output[key] = sanitizeUniversalValue(item);
  }
  return output;
}

function stringList(value: unknown, limit = 100): string[] {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit)
    : [];
}

function normalizeImportedWall(value: unknown): ArqdorImportedWall | null {
  const raw = record(value);
  const x1 = Number(raw.x1);
  const y1 = Number(raw.y1);
  const x2 = Number(raw.x2);
  const y2 = Number(raw.y2);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const classification = ["internal", "external"].includes(String(raw.classification))
    ? String(raw.classification) as "internal" | "external"
    : "unknown";
  return {
    id: raw.id == null ? undefined : String(raw.id).slice(0, 120),
    x1: clamp01(x1),
    y1: clamp01(y1),
    x2: clamp01(x2),
    y2: clamp01(y2),
    thickness: Number.isFinite(Number(raw.thickness)) ? Math.max(0.05, Math.min(0.6, Number(raw.thickness))) : undefined,
    classification,
    material: raw.material == null ? null : String(raw.material).slice(0, 180),
    confidence: clamp01(raw.confidence, 0.5),
    evidence: stringList(raw.evidence, 20),
  };
}

function normalizeImportedOpening(value: unknown): ArqdorImportedOpening | null {
  const raw = record(value);
  const typeRaw = String(raw.type ?? "opening").toLowerCase();
  const type: ArqdorImportedOpening["type"] = typeRaw === "door" ? "door" : typeRaw === "window" ? "window" : "opening";
  const width = Number(raw.width);
  const height = Number(raw.height);
  const sillHeight = Number(raw.sillHeight);
  const offset = Number(raw.offset);
  const wallIndex = Number(raw.wallIndex);
  return {
    id: raw.id == null ? undefined : String(raw.id).slice(0, 120),
    code: raw.code == null ? null : String(raw.code).slice(0, 60),
    wallIndex: Number.isFinite(wallIndex) ? Math.max(0, Math.round(wallIndex)) : null,
    wallId: raw.wallId == null ? null : String(raw.wallId).slice(0, 120),
    type,
    offset: Number.isFinite(offset) ? clamp01(offset, 0.5) : null,
    width: Number.isFinite(width) ? Math.max(0.1, Math.min(12, width)) : null,
    height: Number.isFinite(height) ? Math.max(0.1, Math.min(8, height)) : null,
    sillHeight: Number.isFinite(sillHeight) ? Math.max(0, Math.min(5, sillHeight)) : null,
    confidence: clamp01(raw.confidence, 0.5),
    evidence: stringList(raw.evidence, 20),
  };
}

function normalizeFloorPlan(value: unknown): ArqdorImportedFloorPlan | null {
  const raw = record(value);
  const page = Math.max(1, Math.round(Number(raw.page) || 1));
  const widthMeters = Number(raw.widthMeters);
  const depthMeters = Number(raw.depthMeters);
  const walls = Array.isArray(raw.walls)
    ? raw.walls.map(normalizeImportedWall).filter(Boolean) as ArqdorImportedWall[]
    : [];
  const openings = Array.isArray(raw.openings)
    ? raw.openings.map(normalizeImportedOpening).filter(Boolean) as ArqdorImportedOpening[]
    : [];
  const calibrated = Number.isFinite(widthMeters) && widthMeters > 0 && Number.isFinite(depthMeters) && depthMeters > 0;
  return {
    page,
    label: raw.label == null ? null : String(raw.label).slice(0, 180),
    confidence: clamp01(raw.confidence, walls.length ? 0.6 : 0),
    widthMeters: calibrated ? widthMeters : null,
    depthMeters: calibrated ? depthMeters : null,
    requiresCalibration: raw.requiresCalibration === true || !calibrated,
    walls: walls.slice(0, 800),
    openings: openings.slice(0, 500),
    rooms: Array.isArray(raw.rooms) ? raw.rooms.map(record).slice(0, 300) : [],
    dimensions: Array.isArray(raw.dimensions) ? raw.dimensions.map(record).slice(0, 1000) : [],
    warnings: stringList(raw.warnings, 100),
  };
}

function normalizeCandidate(value: unknown, sourceFileName: string): ArqdorUniversalCandidate | null {
  const raw = record(value);
  const allowed = new Set(["pre_project", "facade", "roof", "opening", "room", "complete_project"]);
  const kind = String(raw.kind ?? "").trim();
  if (!allowed.has(kind)) return null;
  const title = String(raw.title ?? "").trim().slice(0, 180);
  if (!title) return null;
  return {
    kind: kind as ArqdorUniversalCandidate["kind"],
    title,
    description: raw.description == null ? null : String(raw.description).trim().slice(0, 1000),
    confidence: clamp01(raw.confidence, 0.5),
    architecture: sanitizeUniversalValue(record(raw.architecture)) as JsonRecord,
    metadata: sanitizeUniversalValue(record(raw.metadata)) as JsonRecord,
    provenance: {
      ...sanitizeUniversalValue(record(raw.provenance)) as JsonRecord,
      sourceFileName,
      generatedFromImport: true,
    },
  };
}

export function normalizeArqdorIntelligentProjectImport(
  raw: unknown,
  sourceFileName: string,
): ArqdorIntelligentProjectImport {
  const value = record(raw);
  const document = record(value.document);
  const memory = record(value.memory);
  const sourcePages = Array.isArray(memory.sourcePages) ? memory.sourcePages.map(record).slice(0, 100) : [];
  const detectedSheets = Array.isArray(document.detectedSheets)
    ? document.detectedSheets.map((item) => {
        const row = record(item);
        const allowed = new Set(["site_plan","floor_plan","roof_plan","section","facade","schedule","detail","notes","render","other"]);
        const type = allowed.has(String(row.type)) ? String(row.type) : "other";
        return {
          page: Math.max(1, Math.round(Number(row.page) || 1)),
          type: type as ArqdorIntelligentProjectImport["document"]["detectedSheets"][number]["type"],
          label: row.label == null ? null : String(row.label).slice(0, 180),
          confidence: clamp01(row.confidence, 0.5),
        };
      }).slice(0, 100)
    : [];

  const floorPlans = Array.isArray(memory.floorPlans)
    ? memory.floorPlans.map(normalizeFloorPlan).filter(Boolean) as ArqdorImportedFloorPlan[]
    : [];

  const facades = Array.isArray(memory.facades)
    ? memory.facades.map((item) => {
        const row = record(item);
        const orientationRaw = String(row.orientation ?? "unknown");
        const orientation = ["front","rear","left","right"].includes(orientationRaw)
          ? orientationRaw as "front" | "rear" | "left" | "right"
          : "unknown";
        return {
          page: Math.max(1, Math.round(Number(row.page) || 1)),
          label: row.label == null ? null : String(row.label).slice(0, 180),
          orientation,
          confidence: clamp01(row.confidence, 0.5),
          style: row.style == null ? null : String(row.style).slice(0, 180),
          materials: Array.isArray(row.materials) ? row.materials.map(record).slice(0, 100) : [],
          openings: Array.isArray(row.openings) ? row.openings.map(record).slice(0, 300) : [],
          architecturalFeatures: Array.isArray(row.architecturalFeatures) ? row.architecturalFeatures.map(record).slice(0, 200) : [],
          heights: Array.isArray(row.heights) ? row.heights.map(record).slice(0, 200) : [],
          evidence: stringList(row.evidence, 100),
        };
      }).slice(0, 20)
    : [];

  const sections = Array.isArray(memory.sections)
    ? memory.sections.map((item) => {
        const row = record(item);
        return {
          page: Math.max(1, Math.round(Number(row.page) || 1)),
          label: row.label == null ? null : String(row.label).slice(0, 180),
          confidence: clamp01(row.confidence, 0.5),
          levels: Array.isArray(row.levels) ? row.levels.map(record).slice(0, 100) : [],
          heights: Array.isArray(row.heights) ? row.heights.map(record).slice(0, 200) : [],
          roof: row.roof && typeof row.roof === "object" ? record(row.roof) : null,
          evidence: stringList(row.evidence, 100),
        };
      }).slice(0, 30)
    : [];

  const candidates = Array.isArray(value.universalCandidates)
    ? value.universalCandidates.map((item) => normalizeCandidate(item, sourceFileName)).filter(Boolean) as ArqdorUniversalCandidate[]
    : [];

  return {
    version: 1,
    document: {
      pages: Number.isFinite(Number(document.pages)) ? Math.max(1, Math.round(Number(document.pages))) : null,
      detectedSheets,
    },
    memory: {
      summary: String(memory.summary ?? "Projeto importado e interpretado.").slice(0, 3000),
      projectType: memory.projectType == null ? null : String(memory.projectType).slice(0, 120),
      totalAreaM2: Number.isFinite(Number(memory.totalAreaM2)) ? Number(memory.totalAreaM2) : null,
      floors: Number.isFinite(Number(memory.floors)) ? Math.max(1, Math.round(Number(memory.floors))) : null,
      rooms: Array.isArray(memory.rooms) ? memory.rooms.map(record).slice(0, 250) : [],
      openings: Array.isArray(memory.openings) ? memory.openings.map(record).slice(0, 500) : [],
      materials: Array.isArray(memory.materials) ? memory.materials.map(record).slice(0, 300) : [],
      roof: memory.roof && typeof memory.roof === "object" ? record(memory.roof) : null,
      technicalNotes: stringList(memory.technicalNotes, 200),
      inconsistencies: stringList(memory.inconsistencies, 100),
      sourcePages,
      floorPlans,
      facades,
      sections,
    },
    universalCandidates: candidates,
    warnings: stringList(value.warnings, 100),
  };
}

export function universalModelDedupeKey(candidate: ArqdorUniversalCandidate) {
  return crypto.createHash("sha256")
    .update(JSON.stringify({
      kind: candidate.kind,
      title: candidate.title.toLowerCase(),
      architecture: candidate.architecture,
      metadata: candidate.metadata,
    }))
    .digest("hex");
}

export async function analyzeArqdorProjectDocument(input: {
  tenantId: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<ArqdorIntelligentProjectImport> {
  const instruction = [
    "Você está lendo um projeto arquitetônico para o Arqdor. Analise o arquivo completo, folha por folha.",
    "O objetivo é gerar duas saídas simultâneas: (1) Memória Técnica fiel da obra específica; (2) modelos arquitetônicos reutilizáveis para uma Biblioteca Universal anonimizada.",
    "Não invente medidas, materiais, paredes, ambientes, aberturas ou elementos que não estejam suportados pelo documento.",
    "Cruze planta baixa, cotas, quadro de esquadrias, cortes, fachadas, cobertura, detalhes e notas. Quando houver conflito, registre em inconsistencies/warnings.",
    "Para esquadrias, preserve código (J1/J01/P1 etc.), dimensões, peitoril, tipologia, material, acabamento, vidro, quantidade e páginas de origem quando presentes.",
    "Para paredes, registre quando disponível espessura, material, pavimento, classificação interna/externa e evidência de origem. Não trate linhas de cota, terreno ou anotação como paredes.",
    "Para cada planta baixa detectada, gere memory.floorPlans. As coordenadas x1,y1,x2,y2 de walls devem estar normalizadas de 0 a 1 no retângulo EXATO da planta baixa, excluindo carimbo e outras pranchas da folha. Preserve recuos e forma do perímetro.",
    "Quando as cadeias de cotas permitirem determinar com segurança a largura/profundidade total do retângulo da planta, preencha widthMeters/depthMeters. Caso contrário deixe null e requiresCalibration=true; nunca estime.",
    "dimensions deve registrar cotas explícitas legíveis com valor em metros, orientação, pontos/trecho associados e evidência. Cota explícita tem prioridade sobre proporção visual.",
    "openings deve ligar cada abertura à parede por wallIndex (índice em walls, base zero) quando isso estiver inequívoco e cruzar o código J/P com o quadro de esquadrias e detalhes.",
    "Gere memory.facades para cada elevação/fachada: orientação quando identificável, estilo somente se suportado, materiais, aberturas/códigos, elementos arquitetônicos (arcos, molduras, clapboard, floreiras, mansardas, marquises, pergolados etc.), alturas e evidências por página.",
    "Gere memory.sections para cada corte: níveis, alturas explícitas, pé-direito quando legível, lajes, fundações apenas como referência, cobertura/inclinação, cumeeira e demais relações verticais. Não estime alturas ausentes.",
    "Para a Biblioteca Universal, remova/ignore nomes de pessoas, CPF/CNPJ, e-mails, telefones, endereço, matrícula e qualquer dado identificável do cliente ou obra.",
    "Crie candidatos automaticamente, sem pedir autorização: pre_project para plantas reutilizáveis, facade para fachadas, roof para coberturas, opening para esquadrias especiais, room para ambientes relevantes e complete_project quando planta+fachadas+cortes forem coerentes.",
    "architecture deve conter apenas informação arquitetônica reutilizável. metadata deve conter área aproximada, pavimentos, quartos/suítes, estilo, cobertura, dimensões e tags quando suportado.",
    "provenance deve registrar páginas e evidências técnicas, nunca PII.",
    "Responda SOMENTE JSON válido no formato:",
    JSON.stringify({
      document: { pages: 1, detectedSheets: [{ page: 1, type: "floor_plan", label: "Planta baixa", confidence: 0.99 }] },
      memory: {
        summary: "",
        projectType: "",
        totalAreaM2: null,
        floors: null,
        rooms: [],
        openings: [],
        materials: [],
        roof: null,
        technicalNotes: [],
        inconsistencies: [],
        sourcePages: [],
        facades: [],
        sections: [],
        floorPlans: [{
          page: 1,
          label: "Planta baixa",
          confidence: 0.9,
          widthMeters: null,
          depthMeters: null,
          requiresCalibration: true,
          walls: [{ x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1, thickness: 0.15, classification: "external", confidence: 0.95, evidence: ["parede visível + cota"] }],
          openings: [{ code: "J04", wallIndex: 0, type: "window", offset: 0.5, width: 1.2, height: 2.2, sillHeight: 0.7, confidence: 0.98, evidence: ["quadro de esquadrias"] }],
          rooms: [],
          dimensions: [],
          warnings: []
        }]
      },
      universalCandidates: [{
        kind: "pre_project",
        title: "",
        description: "",
        confidence: 0.9,
        architecture: {},
        metadata: {},
        provenance: {}
      }],
      warnings: []
    }),
  ].join("\n");

  const result = await callOpenAIFileExtraction(
    input.tenantId,
    "document_extraction",
    { buffer: input.buffer, mimeType: input.mimeType, filename: input.filename },
    instruction,
    { maxTokens: 12000 },
  );

  return normalizeArqdorIntelligentProjectImport(cleanJson(result.content), input.filename);
}
