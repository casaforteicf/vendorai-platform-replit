import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";

const execFileAsync = promisify(execFile);
const objectStorage = new ObjectStorageService();

type BrollAsset = {
  id: string;
  storage_url: string;
  type: "image" | "video";
  role: string | null;
  source: string | null;
  original_filename: string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string | null;
};

export type BrandBrollInsertion = {
  assetId: string;
  start: number;
  end: number;
  reason: "context_match" | "own_media" | "recent";
};

export type BrandBrollResult = {
  outputPath: string;
  applied: boolean;
  assetIds: string[];
  insertions: BrandBrollInsertion[];
  warning: string | null;
  cleanup: () => Promise<void>;
};

type BrollConfig = {
  enabled: boolean;
  maxInsertions: number;
  preferOwnMedia: boolean;
  durationSeconds: number;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeConfig(value: unknown): BrollConfig {
  const config = record(value);
  return {
    enabled: booleanValue(config["enabled"], true),
    maxInsertions: Math.round(clampNumber(config["maxInsertions"], 4, 0, 8)),
    preferOwnMedia: booleanValue(config["preferOwnMedia"], true),
    durationSeconds: clampNumber(config["durationSeconds"], 2.6, 1, 6),
  };
}

function tokenize(value: string): string[] {
  return Array.from(new Set(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  ));
}

function assetSearchText(asset: BrollAsset): string {
  const metadata = record(asset.metadata);
  const searchable = [
    asset.original_filename ?? "",
    asset.role ?? "",
    metadata["title"],
    metadata["description"],
    metadata["alt"],
    metadata["category"],
    metadata["tags"],
    metadata["keywords"],
    metadata["productName"],
    metadata["campaignName"],
    metadata["aiRole"],
  ];
  return searchable
    .map((value) => Array.isArray(value) ? value.join(" ") : String(value ?? ""))
    .join(" ");
}

function scoreAsset(asset: BrollAsset, contextTokens: string[], preferOwnMedia: boolean): {
  score: number;
  overlap: number;
  own: boolean;
} {
  const assetTokens = new Set(tokenize(assetSearchText(asset)));
  const overlap = contextTokens.reduce((count, token) => count + (assetTokens.has(token) ? 1 : 0), 0);
  const own = asset.source === "upload" || asset.source === "imported";
  const generatedPenalty = asset.source === "generated" ? 75 : 0;
  const brollRoleBonus = asset.role === "broll" ? 20 : 0;
  const score = overlap * 100 + (preferOwnMedia && own ? 35 : 0) + brollRoleBonus - generatedPenalty;
  return { score, overlap, own };
}

async function mediaDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Não foi possível determinar a duração do vídeo para B-roll");
  }
  return duration;
}

async function videoDimensions(path: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=s=x:p=0",
    path,
  ]);
  const [widthRaw, heightRaw] = stdout.trim().split("x");
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Não foi possível determinar a resolução do vídeo para B-roll");
  }
  return { width, height };
}

function safeExtension(asset: BrollAsset): string {
  const ext = (asset.original_filename ?? "").split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (ext && ext.length <= 6) return ext;
  return asset.type === "image" ? "jpg" : "mp4";
}

async function downloadAsset(asset: BrollAsset, path: string): Promise<void> {
  const file = await objectStorage.getObjectEntityFile(asset.storage_url);
  const [buffer] = await file.download();
  if (!buffer.length) throw new Error(`B-roll ${asset.id} está vazio`);
  await writeFile(path, buffer);
}

function computeInsertions(
  assets: BrollAsset[],
  duration: number,
  clipDuration: number,
): { asset: BrollAsset; start: number; end: number }[] {
  const margin = Math.min(3, Math.max(1.5, duration * 0.14));
  const usable = duration - margin * 2;
  if (usable < clipDuration) return [];

  const maxByDuration = Math.max(1, Math.floor(usable / (clipDuration + 0.75)));
  const count = Math.min(assets.length, maxByDuration);
  if (count <= 0) return [];

  const step = usable / (count + 1);
  return assets.slice(0, count).map((asset, index) => {
    const center = margin + step * (index + 1);
    const start = Math.max(margin, Math.min(duration - margin - clipDuration, center - clipDuration / 2));
    return {
      asset,
      start: Number(start.toFixed(3)),
      end: Number(Math.min(duration - margin, start + clipDuration).toFixed(3)),
    };
  });
}

export async function applyBrandBroll(input: {
  tenantId: string;
  sourcePath: string;
  jobId?: string;
  context?: string | null;
}): Promise<BrandBrollResult> {
  const kitResult = await pool.query(
    `SELECT broll_config
       FROM media_brand_video_kits
      WHERE tenant_id = $1 AND status = 'active'
      LIMIT 1`,
    [input.tenantId],
  );
  if (!kitResult.rowCount) {
    return {
      outputPath: input.sourcePath,
      applied: false,
      assetIds: [],
      insertions: [],
      warning: null,
      cleanup: async () => undefined,
    };
  }

  const config = normalizeConfig(kitResult.rows[0]?.broll_config);
  if (!config.enabled || config.maxInsertions <= 0) {
    return {
      outputPath: input.sourcePath,
      applied: false,
      assetIds: [],
      insertions: [],
      warning: null,
      cleanup: async () => undefined,
    };
  }

  // O Studio profissional usa toda a Biblioteca do tenant como fonte de B-roll.
  // Assets explicitamente marcados como broll ainda recebem bônus, mas uploads/importações
  // reais também podem ser escolhidos por contexto. Assets gerados por IA são penalizados.
  const assetResult = await pool.query(
    `SELECT id, storage_url, type, role, source, original_filename, metadata, created_at
       FROM media_assets
      WHERE tenant_id = $1
        AND type IN ('image', 'video')
      ORDER BY created_at DESC
      LIMIT 250`,
    [input.tenantId],
  );
  const candidates: BrollAsset[] = assetResult.rows.map((row): BrollAsset => ({
    id: String(row.id),
    storage_url: String(row.storage_url ?? ""),
    type: row.type === "image" ? "image" : "video",
    role: row.role ? String(row.role) : null,
    source: row.source ? String(row.source) : null,
    original_filename: row.original_filename ? String(row.original_filename) : null,
    metadata: record(row.metadata),
    created_at: row.created_at ?? null,
  })).filter((asset) => Boolean(asset.storage_url));

  if (!candidates.length) {
    return {
      outputPath: input.sourcePath,
      applied: false,
      assetIds: [],
      insertions: [],
      warning: null,
      cleanup: async () => undefined,
    };
  }

  const contextTokens = tokenize(input.context ?? "");
  const ranked = candidates
    .map((asset, index) => ({
      asset,
      index,
      ...scoreAsset(asset, contextTokens, config.preferOwnMedia),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .slice(0, config.maxInsertions);

  const token = input.jobId ?? randomUUID();
  const tempPaths: string[] = [];
  try {
    const [duration, dimensions] = await Promise.all([
      mediaDuration(input.sourcePath),
      videoDimensions(input.sourcePath),
    ]);
    if (duration < 6) {
      return {
        outputPath: input.sourcePath,
        applied: false,
        assetIds: [],
        insertions: [],
        warning: null,
        cleanup: async () => undefined,
      };
    }

    const downloaded: { asset: BrollAsset; path: string; overlap: number; own: boolean }[] = [];
    for (const item of ranked) {
      const path = join(tmpdir(), `brand-broll-${token}-${downloaded.length}.${safeExtension(item.asset)}`);
      try {
        await downloadAsset(item.asset, path);
        tempPaths.push(path);
        downloaded.push({ asset: item.asset, path, overlap: item.overlap, own: item.own });
      } catch {
        await unlink(path).catch(() => undefined);
      }
    }

    if (!downloaded.length) {
      return {
        outputPath: input.sourcePath,
        applied: false,
        assetIds: [],
        insertions: [],
        warning: "Nenhuma mídia coerente da Biblioteca pôde ser carregada para B-roll",
        cleanup: async () => {
          await Promise.all(tempPaths.map((path) => unlink(path).catch(() => undefined)));
        },
      };
    }

    const placements = computeInsertions(
      downloaded.map((item) => item.asset),
      duration,
      config.durationSeconds,
    );
    if (!placements.length) {
      return {
        outputPath: input.sourcePath,
        applied: false,
        assetIds: [],
        insertions: [],
        warning: null,
        cleanup: async () => {
          await Promise.all(tempPaths.map((path) => unlink(path).catch(() => undefined)));
        },
      };
    }

    const selectedById = new Map(downloaded.map((item) => [item.asset.id, item]));
    const args: string[] = ["-y", "-i", input.sourcePath];
    for (const placement of placements) {
      const selected = selectedById.get(placement.asset.id)!;
      if (placement.asset.type === "image") {
        args.push("-loop", "1", "-framerate", "30", "-i", selected.path);
      } else {
        args.push("-stream_loop", "-1", "-i", selected.path);
      }
    }

    const filters: string[] = ["[0:v]setpts=PTS-STARTPTS[vbase]"];
    let previous = "vbase";
    const insertions: BrandBrollInsertion[] = [];

    placements.forEach((placement, index) => {
      const inputIndex = index + 1;
      const prepared = `broll${index}`;
      const output = `v${index + 1}`;
      const clipDuration = Math.max(0.1, placement.end - placement.start);
      filters.push(
        `[${inputIndex}:v]` +
        `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=increase,` +
        `crop=${dimensions.width}:${dimensions.height},fps=30,` +
        `trim=duration=${clipDuration.toFixed(3)},` +
        `setpts=PTS-STARTPTS+${placement.start.toFixed(3)}/TB[${prepared}]`,
      );
      filters.push(
        `[${previous}][${prepared}]overlay=0:0:eof_action=pass:` +
        `enable='between(t,${placement.start.toFixed(3)},${placement.end.toFixed(3)})'[${output}]`,
      );
      previous = output;

      const selected = selectedById.get(placement.asset.id)!;
      insertions.push({
        assetId: placement.asset.id,
        start: placement.start,
        end: placement.end,
        reason: selected.overlap > 0 ? "context_match" : selected.own ? "own_media" : "recent",
      });
    });

    const outputPath = join(tmpdir(), `brand-broll-output-${token}.mp4`);
    tempPaths.push(outputPath);
    args.push(
      "-filter_complex", filters.join(";"),
      "-map", `[${previous}]`,
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "20",
      "-c:a", "copy",
      "-t", duration.toFixed(3),
      "-movflags", "+faststart",
      outputPath,
    );

    await execFileAsync("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
    const output = await readFile(outputPath);
    if (!output.length) throw new Error("Composição de B-roll gerou vídeo vazio");

    return {
      outputPath,
      applied: true,
      assetIds: insertions.map((item) => item.assetId),
      insertions,
      warning: null,
      cleanup: async () => {
        await Promise.all(tempPaths.map((path) => unlink(path).catch(() => undefined)));
      },
    };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "Falha desconhecida ao aplicar B-roll";
    return {
      outputPath: input.sourcePath,
      applied: false,
      assetIds: [],
      insertions: [],
      warning,
      cleanup: async () => {
        await Promise.all(tempPaths.map((path) => unlink(path).catch(() => undefined)));
      },
    };
  }
}
