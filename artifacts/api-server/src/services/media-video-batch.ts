import { randomUUID } from "crypto";
import { pool } from "@workspace/db";
import type { Logger } from "pino";
import { setMediaProjectStatus } from "./media-library.js";
import { synthesizeVendorAiVoice } from "./vendorai-voice-engine.js";
import { generateVendorAiLipSync } from "./vendorai-lipsync-engine.js";
import {
  refreshVendorAiWorkerCapabilities,
  vendorAiMediaEngineCapabilities,
} from "./vendorai-media-engine.js";

type BatchRow = Record<string, string>;

type BatchResult = {
  name: string;
  status: "pending" | "generating" | "done" | "error";
  videoUrl?: string;
  videoAssetId?: string;
  voiceAssetId?: string;
  voiceJobId?: string;
  lipsyncJobId?: string;
  error?: string;
};

type BatchInput = {
  userId?: string | null;
  identityId?: string;
  voiceProfileId?: string;
  template?: string;
  rows?: BatchRow[];
  language?: string;
  bboxShift?: number;
  title?: string;
};

type ClaimedBatch = {
  id: string;
  tenantId: string;
  projectId: string | null;
  input: BatchInput;
  output: Record<string, unknown>;
};

const LEASE_MINUTES = 30;
const DEFAULT_POLL_MS = 5_000;
const MAX_ROWS = 50;
const MAX_COLUMNS = 40;
const MAX_CELL_LENGTH = 500;
const MAX_TEXT_LENGTH = 5_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeRow(value: unknown): BatchRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length || entries.length > MAX_COLUMNS) return null;
  const row: BatchRow = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!key || key.length > 120) return null;
    const cell = rawValue === null || rawValue === undefined ? "" : String(rawValue).trim();
    if (cell.length > MAX_CELL_LENGTH) return null;
    row[key] = cell;
  }
  return row;
}

function parseRows(value: unknown): BatchRow[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ROWS) return null;
  const rows = value.map(normalizeRow);
  return rows.every((row): row is BatchRow => row !== null) ? rows : null;
}

function resultName(row: BatchRow, index: number): string {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]));
  return normalized.get("nome") || normalized.get("name") || normalized.get("email") || `Item ${index + 1}`;
}

function interpolateTemplate(template: string, row: BatchRow): string {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]));
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawKey: string) => {
    return normalized.get(String(rawKey).trim().toLowerCase()) ?? "";
  }).replace(/\s+/g, " ").trim();
}

function clampBboxShift(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(-20, Math.min(20, parsed)) : 0;
}

function parseResults(output: Record<string, unknown>, rows: BatchRow[]): BatchResult[] {
  const raw = Array.isArray(output["results"]) ? output["results"] : [];
  return rows.map((row, index) => {
    const item = asRecord(raw[index]);
    const status = item["status"] === "done" || item["status"] === "error" || item["status"] === "generating"
      ? item["status"]
      : "pending";
    const result: BatchResult = {
      name: stringValue(item["name"]) ?? resultName(row, index),
      status,
    };
    const fields = ["videoUrl", "videoAssetId", "voiceAssetId", "voiceJobId", "lipsyncJobId", "error"] as const;
    for (const field of fields) {
      const value = stringValue(item[field]);
      if (value) result[field] = value;
    }
    return result;
  });
}

async function claimNextBatch(runnerToken: string): Promise<ClaimedBatch | null> {
  const result = await pool.query(
    `WITH candidate AS (
       SELECT id
       FROM media_jobs
       WHERE operation = 'video_batch'
         AND status = 'running'
         AND (
           output->>'runnerToken' = $1
           OR output->>'runnerToken' IS NULL
           OR output->>'leaseUntil' IS NULL
           OR NULLIF(output->>'leaseUntil', '')::timestamptz < NOW()
         )
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE media_jobs j
     SET output = COALESCE(j.output, '{}'::jsonb) || jsonb_build_object(
           'runnerToken', $1::text,
           'leaseUntil', (NOW() + ($2::text || ' minutes')::interval)::text
         ),
         updated_at = NOW()
     FROM candidate
     WHERE j.id = candidate.id
     RETURNING j.id, j.tenant_id, j.project_id, j.input, j.output`,
    [runnerToken, LEASE_MINUTES],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row["id"]),
    tenantId: String(row["tenant_id"]),
    projectId: row["project_id"] ? String(row["project_id"]) : null,
    input: asRecord(row["input"]) as BatchInput,
    output: asRecord(row["output"]),
  };
}

async function persistClaimedBatch(input: {
  batch: ClaimedBatch;
  runnerToken: string;
  results: BatchResult[];
  status?: "running" | "done" | "error";
  fatalError?: string | null;
}): Promise<void> {
  const completedCount = input.results.filter((item) => item.status === "done").length;
  const failedCount = input.results.filter((item) => item.status === "error").length;
  const settled = completedCount + failedCount;
  const total = input.results.length;
  const status = input.status ?? "running";
  const nextIndex = input.results.findIndex((item) => item.status === "pending" || item.status === "generating");
  const progress = total > 0 ? Math.round((settled / total) * 100) : 0;
  const publicOutput = {
    results: input.results,
    completedCount,
    failedCount,
    currentIndex: nextIndex >= 0 ? nextIndex : null,
  };

  if (status === "running") {
    await pool.query(
      `UPDATE media_jobs
       SET status = 'running', progress = $3, total = $4,
           output = $5::jsonb || jsonb_build_object(
             'runnerToken', $2::text,
             'leaseUntil', (NOW() + ($6::text || ' minutes')::interval)::text
           ),
           error = NULL, completed_at = NULL, updated_at = NOW()
       WHERE id = $1 AND output->>'runnerToken' = $2`,
      [input.batch.id, input.runnerToken, progress, total, JSON.stringify(publicOutput), LEASE_MINUTES],
    );
    return;
  }

  await pool.query(
    `UPDATE media_jobs
     SET status = $3, progress = $4, total = $5,
         output = $6::jsonb,
         error = $7, completed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND output->>'runnerToken' = $2`,
    [input.batch.id, input.runnerToken, status, status === "done" ? 100 : progress, total, JSON.stringify(publicOutput), input.fatalError ?? null],
  );
}

async function releaseBatchLease(batch: ClaimedBatch, runnerToken: string, results: BatchResult[]): Promise<void> {
  const normalized = results.map((item) => item.status === "generating" ? { ...item, status: "pending" as const } : item);
  const completedCount = normalized.filter((item) => item.status === "done").length;
  const failedCount = normalized.filter((item) => item.status === "error").length;
  const total = normalized.length;
  const progress = total ? Math.round(((completedCount + failedCount) / total) * 100) : 0;
  await pool.query(
    `UPDATE media_jobs
     SET progress = $3, total = $4,
         output = $5::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND output->>'runnerToken' = $2`,
    [batch.id, runnerToken, progress, total, JSON.stringify({ results: normalized, completedCount, failedCount })],
  );
}

async function finishIfSettled(batch: ClaimedBatch, runnerToken: string, results: BatchResult[]): Promise<boolean> {
  if (results.some((item) => item.status === "pending" || item.status === "generating")) return false;
  const failedCount = results.filter((item) => item.status === "error").length;
  const finalStatus = failedCount === results.length ? "error" : "done";
  await persistClaimedBatch({
    batch,
    runnerToken,
    results,
    status: finalStatus,
    fatalError: finalStatus === "error" ? "Todos os itens do lote falharam" : null,
  });
  if (batch.projectId) {
    await setMediaProjectStatus(batch.tenantId, batch.projectId, finalStatus === "done" ? "ready" : "draft");
  }
  return true;
}

async function processClaimedBatch(batch: ClaimedBatch, runnerToken: string): Promise<void> {
  const rows = parseRows(batch.input.rows);
  const template = stringValue(batch.input.template);
  const identityId = stringValue(batch.input.identityId);
  const voiceProfileId = stringValue(batch.input.voiceProfileId);
  if (!rows || !template || template.length > MAX_TEXT_LENGTH || !identityId || !voiceProfileId) {
    await persistClaimedBatch({
      batch,
      runnerToken,
      results: rows ? parseResults(batch.output, rows) : [],
      status: "error",
      fatalError: `Lote inválido: use identityId, voiceProfileId, template de até ${MAX_TEXT_LENGTH} caracteres e 1 a ${MAX_ROWS} linhas`,
    });
    if (batch.projectId) await setMediaProjectStatus(batch.tenantId, batch.projectId, "draft");
    return;
  }

  const results = parseResults(batch.output, rows);
  if (await finishIfSettled(batch, runnerToken, results)) return;

  await refreshVendorAiWorkerCapabilities();
  if (
    vendorAiMediaEngineCapabilities.capabilities.voice_synthesize !== "ready"
    || vendorAiMediaEngineCapabilities.capabilities.avatar_lipsync !== "ready"
  ) {
    await releaseBatchLease(batch, runnerToken, results);
    return;
  }

  const nextIndex = results.findIndex((item) => item.status === "pending" || item.status === "generating");
  if (nextIndex < 0) return;
  const row = rows[nextIndex]!;
  results[nextIndex] = { ...results[nextIndex]!, status: "generating", error: undefined };
  await persistClaimedBatch({ batch, runnerToken, results });

  const personalizedText = interpolateTemplate(template, row);
  if (!personalizedText || personalizedText.length > MAX_TEXT_LENGTH) {
    results[nextIndex] = {
      ...results[nextIndex]!,
      status: "error",
      error: personalizedText ? `Texto personalizado excede ${MAX_TEXT_LENGTH} caracteres` : "Texto personalizado ficou vazio",
    };
    await persistClaimedBatch({ batch, runnerToken, results });
    return;
  }

  try {
    const itemTitle = `${stringValue(batch.input.title) ?? "Vídeo em lote"} — ${results[nextIndex]!.name}`;
    const voice = await synthesizeVendorAiVoice({
      tenantId: batch.tenantId,
      userId: batch.input.userId ?? null,
      identityId,
      voiceProfileId,
      text: personalizedText,
      language: stringValue(batch.input.language) ?? "pt-br",
      title: `${itemTitle} — voz`,
    });
    const video = await generateVendorAiLipSync({
      tenantId: batch.tenantId,
      userId: batch.input.userId ?? null,
      identityId,
      audioAssetId: voice.assetId,
      title: itemTitle,
      bboxShift: clampBboxShift(batch.input.bboxShift),
    });
    results[nextIndex] = {
      ...results[nextIndex]!,
      status: "done",
      videoUrl: video.videoUrl,
      videoAssetId: video.assetId,
      voiceAssetId: voice.assetId,
      voiceJobId: voice.jobId,
      lipsyncJobId: video.jobId,
      error: undefined,
    };
  } catch (error) {
    results[nextIndex] = {
      ...results[nextIndex]!,
      status: "error",
      error: (error instanceof Error ? error.message : "Falha ao gerar vídeo").slice(0, 800),
    };
  }

  if (!(await finishIfSettled(batch, runnerToken, results))) {
    await persistClaimedBatch({ batch, runnerToken, results });
  }
}

export function startMediaVideoBatchRunner(
  logger: Logger,
  pollMs = DEFAULT_POLL_MS,
): { stop: () => void } {
  const runnerToken = randomUUID();
  let stopped = false;
  let busy = false;

  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const batch = await claimNextBatch(runnerToken);
      if (batch) await processClaimedBatch(batch, runnerToken);
    } catch (error) {
      logger.error({ err: error }, "media-video-batch: runner falhou");
    } finally {
      busy = false;
    }
  };

  void tick();
  const timer = setInterval(() => { void tick(); }, Math.max(1_000, pollMs));
  timer.unref?.();
  logger.info("media-video-batch: runner iniciado");
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
