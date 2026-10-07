import crypto from "node:crypto";
import { callOpenAIFileExtraction } from "./ai-gateway.js";

type JsonRecord = Record<string, unknown>;

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
        sourcePages: []
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
