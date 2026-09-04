import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { assessMediaAudioUsage, normalizeMediaAudioRights } from "./media-rights.js";

export type VideoGenerationMode = "ai_only" | "hybrid" | "media_only";
export type MediaInputType = "image" | "video" | "audio" | "document";
export type MediaInputImportance = "required" | "preferred" | "reference";
export type MediaInputRole =
  | "auto"
  | "main_scene"
  | "broll"
  | "visual_reference"
  | "product"
  | "person"
  | "environment"
  | "opening"
  | "closing"
  | "music"
  | "voiceover"
  | "sfx"
  | "briefing";

export type VideoGenerationMediaInputSpec = {
  assetId: string;
  type?: MediaInputType;
  role?: MediaInputRole;
  importance?: MediaInputImportance;
  order?: number;
  note?: string;
};

export type ResolvedVideoGenerationMediaInput = {
  assetId: string;
  type: MediaInputType;
  role: MediaInputRole;
  importance: MediaInputImportance;
  order: number;
  note: string | null;
  storageUrl: string;
  originalFilename: string;
  mimeType: string | null;
  metadata: Record<string, unknown>;
  buffer: Buffer;
  documentText: string | null;
};

const MAX_INPUTS = 20;
const MAX_DOCUMENT_CHARS = 12_000;
const MAX_TOTAL_DOCUMENT_CHARS = 24_000;
const objectStorage = new ObjectStorageService();

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max = 1000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeMode(value: unknown): VideoGenerationMode {
  return value === "hybrid" || value === "media_only" ? value : "ai_only";
}

export function videoGenerationMode(value: unknown): VideoGenerationMode {
  return normalizeMode(value);
}

function normalizeType(value: unknown, fallback: string): MediaInputType | null {
  const candidate = String(value ?? fallback).toLowerCase();
  return candidate === "image" || candidate === "video" || candidate === "audio" || candidate === "document"
    ? candidate
    : null;
}

function normalizeImportance(value: unknown): MediaInputImportance {
  return value === "required" || value === "reference" ? value : "preferred";
}

function normalizeRole(value: unknown, type: MediaInputType): MediaInputRole {
  const raw = String(value ?? "auto") as MediaInputRole;
  if (type === "document") return "briefing";
  if (type === "audio") return raw === "music" || raw === "voiceover" || raw === "sfx" ? raw : "auto";
  const visual = new Set<MediaInputRole>([
    "auto", "main_scene", "broll", "visual_reference", "product", "person", "environment", "opening", "closing",
  ]);
  return visual.has(raw) ? raw : "auto";
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { return record(JSON.parse(value)); } catch { return {}; }
  }
  return record(value);
}

async function extractDocumentText(input: {
  buffer: Buffer;
  mimeType: string | null;
  filename: string;
}): Promise<string | null> {
  const mime = (input.mimeType ?? "").toLowerCase();
  const name = input.filename.toLowerCase();
  try {
    if (mime === "application/pdf" || name.endsWith(".pdf")) {
      const parsed = await pdfParse(input.buffer);
      return text(parsed.text, MAX_DOCUMENT_CHARS);
    }
    if (mime.includes("wordprocessingml") || name.endsWith(".docx")) {
      const parsed = await mammoth.extractRawText({ buffer: input.buffer });
      return text(parsed.value, MAX_DOCUMENT_CHARS);
    }
    if (mime.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
      return text(input.buffer.toString("utf8"), MAX_DOCUMENT_CHARS);
    }
  } catch {
    return null;
  }
  return null;
}

function validateMusicRights(input: ResolvedVideoGenerationMediaInput): void {
  if (input.type !== "audio" || input.role !== "music") return;
  const rights = normalizeMediaAudioRights(input.metadata["rights"]);
  const usage = assessMediaAudioUsage(rights);
  if (!usage.organicAllowed) {
    throw new Error(`A trilha “${input.originalFilename}” não está liberada para uso comercial/orgânico. Revise o Passaporte de Direitos em Mídias antes de gerar.`);
  }
}

export async function resolveVideoGenerationMediaInputs(input: {
  tenantId: string;
  specs: unknown;
}): Promise<ResolvedVideoGenerationMediaInput[]> {
  if (!Array.isArray(input.specs) || input.specs.length === 0) return [];
  const specs = input.specs.slice(0, MAX_INPUTS).map((raw, index) => {
    const item = record(raw);
    return {
      assetId: text(item["assetId"], 100),
      type: item["type"],
      role: item["role"],
      importance: item["importance"],
      order: Number.isFinite(Number(item["order"])) ? Number(item["order"]) : index,
      note: text(item["note"], 500),
    };
  }).filter((item) => Boolean(item.assetId));

  const uniqueIds = Array.from(new Set(specs.map((item) => item.assetId!)));
  if (!uniqueIds.length) return [];
  const result = await pool.query(
    `SELECT id, type, role, storage_url, original_filename, mime_type, metadata
       FROM media_assets
      WHERE tenant_id = $1 AND id::text = ANY($2::text[])`,
    [input.tenantId, uniqueIds],
  );
  const byId = new Map(result.rows.map((row) => [String(row.id), row]));
  const resolved: ResolvedVideoGenerationMediaInput[] = [];
  let totalDocumentChars = 0;

  for (const spec of specs.sort((a, b) => a.order - b.order)) {
    const row = byId.get(spec.assetId!);
    if (!row) throw new Error(`Mídia ${spec.assetId} não encontrada neste tenant`);
    const type = normalizeType(spec.type, String(row.type ?? ""));
    if (!type || String(row.type) !== type) throw new Error(`Tipo da mídia ${spec.assetId} é incompatível com a geração`);
    const storageUrl = String(row.storage_url ?? "");
    if (!storageUrl.startsWith("/objects/")) throw new Error(`Mídia “${row.original_filename ?? row.id}” não está disponível no Object Storage`);
    const file = await objectStorage.getObjectEntityFile(storageUrl);
    const [buffer] = await file.download();
    if (!buffer.length) throw new Error(`Mídia “${row.original_filename ?? row.id}” está vazia`);
    const originalFilename = String(row.original_filename ?? row.id);
    const mimeType = row.mime_type ? String(row.mime_type) : null;
    const metadata = metadataObject(row.metadata);
    let documentText: string | null = null;
    if (type === "document" && totalDocumentChars < MAX_TOTAL_DOCUMENT_CHARS) {
      documentText = await extractDocumentText({ buffer, mimeType, filename: originalFilename });
      if (documentText) {
        const remaining = MAX_TOTAL_DOCUMENT_CHARS - totalDocumentChars;
        documentText = documentText.slice(0, remaining);
        totalDocumentChars += documentText.length;
      }
    }
    const item: ResolvedVideoGenerationMediaInput = {
      assetId: spec.assetId!,
      type,
      role: normalizeRole(spec.role, type),
      importance: normalizeImportance(spec.importance),
      order: spec.order,
      note: spec.note,
      storageUrl,
      originalFilename,
      mimeType,
      metadata,
      buffer,
      documentText,
    };
    validateMusicRights(item);
    resolved.push(item);
  }
  return resolved;
}

export function visualGenerationInputs(inputs: ResolvedVideoGenerationMediaInput[]): ResolvedVideoGenerationMediaInput[] {
  return inputs.filter((item) =>
    (item.type === "image" || item.type === "video")
    && item.role !== "visual_reference",
  );
}

export function referenceImageInput(inputs: ResolvedVideoGenerationMediaInput[]): ResolvedVideoGenerationMediaInput | null {
  return inputs.find((item) => item.type === "image" && (item.role === "visual_reference" || item.importance === "reference")) ?? null;
}

export function videoGenerationBriefing(input: {
  prompt: string | null;
  inputs: ResolvedVideoGenerationMediaInput[];
  mode: VideoGenerationMode;
}): { prompt: string; documentSources: string[] } {
  const documents = input.inputs.filter((item) => item.type === "document" && item.documentText);
  const notes = input.inputs
    .filter((item) => item.note)
    .map((item) => `${item.originalFilename}: ${item.note}`)
    .join("\n");
  const docText = documents.map((item) => `[${item.originalFilename}]\n${item.documentText}`).join("\n\n");
  const base = input.prompt
    || (input.mode === "media_only"
      ? "Monte um vídeo profissional usando somente as mídias fornecidas. Preserve fielmente produtos, pessoas, ambientes e informações presentes nos arquivos."
      : "Crie um vídeo profissional usando as mídias fornecidas como contexto e referência.");
  const combined = [
    base,
    notes ? `Orientações específicas das mídias:\n${notes}` : "",
    docText ? `Informações confirmadas dos documentos anexados. Use apenas fatos presentes abaixo e não invente preço, prazo, garantia, certificação ou condição comercial:\n${docText}` : "",
  ].filter(Boolean).join("\n\n");
  return {
    prompt: combined.slice(0, 28_000),
    documentSources: documents.map((item) => item.originalFilename),
  };
}

export function extensionForMediaInput(input: ResolvedVideoGenerationMediaInput): string {
  const nameExtension = input.originalFilename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (nameExtension && nameExtension.length <= 5) return nameExtension;
  const mime = input.mimeType ?? "";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg")) return input.type === "audio" ? "mp3" : "mp4";
  return input.type === "video" ? "mp4" : input.type === "audio" ? "mp3" : "bin";
}
