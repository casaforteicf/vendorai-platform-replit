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

type BrandVideoResult = {
  outputPath: string;
  logoAssetId: string | null;
  introAssetId: string | null;
  outroAssetId: string | null;
  logoApplied: boolean;
  introApplied: boolean;
  outroApplied: boolean;
  logoWarning: string | null;
  cleanup: () => Promise<void>;
};

type MediaAsset = {
  id: string;
  storage_url: string;
  type: "image" | "video";
  original_filename: string | null;
};

type LogoPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type LogoConfig = {
  enabled: boolean;
  position: LogoPosition;
  widthPercent: number;
  opacity: number;
  marginPercent: number;
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

function normalizeLogoConfig(value: unknown): LogoConfig {
  const visual = record(value);
  const nestedLogo = record(visual["logo"]);
  const merged = { ...visual, ...nestedLogo };
  const rawPosition = String(
    merged["position"] ?? merged["logoPosition"] ?? "top-right",
  ).trim().toLowerCase();
  const positions = new Set<LogoPosition>(["top-left", "top-right", "bottom-left", "bottom-right"]);
  const position = positions.has(rawPosition as LogoPosition)
    ? rawPosition as LogoPosition
    : "top-right";

  return {
    enabled: booleanValue(merged["enabled"] ?? merged["logoEnabled"], true),
    position,
    widthPercent: clampNumber(merged["widthPercent"] ?? merged["logoWidthPercent"], 16, 5, 35),
    opacity: clampNumber(merged["opacity"] ?? merged["logoOpacity"], 0.92, 0.1, 1),
    marginPercent: clampNumber(merged["marginPercent"] ?? merged["logoMarginPercent"], 3, 0, 10),
  };
}

async function hasAudio(path: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=index",
      "-of", "csv=p=0",
      path,
    ]);
    return Boolean(stdout.trim());
  } catch {
    return false;
  }
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
    throw new Error("Não foi possível identificar a resolução do vídeo principal");
  }
  return { width, height };
}

function safeExtension(asset: MediaAsset): string {
  const ext = (asset.original_filename ?? "")
    .split(".")
    .pop()
    ?.replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  if (ext && ext.length <= 6) return ext;
  return asset.type === "image" ? "png" : "mp4";
}

async function downloadAsset(asset: MediaAsset, path: string): Promise<void> {
  const file = await objectStorage.getObjectEntityFile(asset.storage_url);
  const [buffer] = await file.download();
  if (!buffer.length) throw new Error(`Asset ${asset.id} está vazio`);
  await writeFile(path, buffer);
}

async function normalizeSegment(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number,
): Promise<void> {
  const audio = await hasAudio(inputPath);
  const baseArgs = ["-y", "-i", inputPath];
  if (!audio) {
    baseArgs.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  }
  baseArgs.push(
    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "20",
    "-c:a", "aac",
    "-ar", "48000",
    "-ac", "2",
    "-b:a", "192k",
  );
  if (!audio) baseArgs.push("-shortest");
  baseArgs.push("-movflags", "+faststart", outputPath);
  await execFileAsync("ffmpeg", baseArgs, { maxBuffer: 8 * 1024 * 1024 });
}

async function overlayLogo(input: {
  sourcePath: string;
  logoPath: string;
  outputPath: string;
  width: number;
  height: number;
  config: LogoConfig;
}): Promise<void> {
  const targetWidth = Math.max(48, Math.round(input.width * (input.config.widthPercent / 100)));
  const marginX = Math.round(input.width * (input.config.marginPercent / 100));
  const marginY = Math.round(input.height * (input.config.marginPercent / 100));
  const position = (() => {
    switch (input.config.position) {
      case "top-left":
        return `${marginX}:${marginY}`;
      case "bottom-left":
        return `${marginX}:H-h-${marginY}`;
      case "bottom-right":
        return `W-w-${marginX}:H-h-${marginY}`;
      case "top-right":
      default:
        return `W-w-${marginX}:${marginY}`;
    }
  })();

  await execFileAsync("ffmpeg", [
    "-y",
    "-i", input.sourcePath,
    "-i", input.logoPath,
    "-filter_complex",
    `[1:v]scale=${targetWidth}:-1:flags=lanczos,format=rgba,colorchannelmixer=aa=${input.config.opacity.toFixed(3)}[logo];` +
      `[0:v][logo]overlay=${position}:format=auto[vout]`,
    "-map", "[vout]",
    "-map", "0:a?",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    "-movflags", "+faststart",
    input.outputPath,
  ], { maxBuffer: 8 * 1024 * 1024 });
}

export async function applyBrandIntroOutro(input: {
  tenantId: string;
  sourcePath: string;
  jobId?: string;
}): Promise<BrandVideoResult> {
  const result = await pool.query(
    `SELECT logo_asset_id, intro_asset_id, outro_asset_id, visual_config
       FROM media_brand_video_kits
      WHERE tenant_id = $1 AND status = 'active'
      LIMIT 1`,
    [input.tenantId],
  );
  const row = result.rows[0];
  const logoAssetId = row?.logo_asset_id ? String(row.logo_asset_id) : null;
  const introAssetId = row?.intro_asset_id ? String(row.intro_asset_id) : null;
  const outroAssetId = row?.outro_asset_id ? String(row.outro_asset_id) : null;
  const logoConfig = normalizeLogoConfig(row?.visual_config);
  const shouldApplyLogo = Boolean(logoAssetId && logoConfig.enabled);

  if (!shouldApplyLogo && !introAssetId && !outroAssetId) {
    return {
      outputPath: input.sourcePath,
      logoAssetId,
      introAssetId: null,
      outroAssetId: null,
      logoApplied: false,
      introApplied: false,
      outroApplied: false,
      logoWarning: null,
      cleanup: async () => undefined,
    };
  }

  const ids = [
    shouldApplyLogo ? logoAssetId : null,
    introAssetId,
    outroAssetId,
  ].filter((value): value is string => Boolean(value));
  const assetResult = await pool.query(
    `SELECT id, storage_url, type, original_filename
       FROM media_assets
      WHERE tenant_id = $1
        AND id = ANY($2::text[])
        AND type IN ('image', 'video')`,
    [input.tenantId, ids],
  );
  const assets = new Map<string, MediaAsset>(assetResult.rows.map((asset) => [String(asset.id), {
    id: String(asset.id),
    storage_url: String(asset.storage_url),
    type: asset.type === "image" ? "image" : "video",
    original_filename: asset.original_filename ? String(asset.original_filename) : null,
  }]));

  if (introAssetId && (assets.get(introAssetId)?.type !== "video")) {
    throw new Error("Abertura do Brand Video Kit não está disponível");
  }
  if (outroAssetId && (assets.get(outroAssetId)?.type !== "video")) {
    throw new Error("Encerramento do Brand Video Kit não está disponível");
  }

  const token = input.jobId ?? randomUUID();
  const tempPaths: string[] = [];
  const dimensions = await videoDimensions(input.sourcePath);
  const normalizedMain = join(tmpdir(), `brand-main-${token}.mp4`);
  tempPaths.push(normalizedMain);
  await normalizeSegment(input.sourcePath, normalizedMain, dimensions.width, dimensions.height);

  let mainVideoPath = normalizedMain;
  let logoApplied = false;
  let logoWarning: string | null = null;

  if (shouldApplyLogo && logoAssetId) {
    const logoAsset = assets.get(logoAssetId);
    if (!logoAsset || logoAsset.type !== "image") {
      logoWarning = "Logo do Brand Video Kit não está disponível";
    } else {
      const rawLogo = join(tmpdir(), `brand-logo-${token}.${safeExtension(logoAsset)}`);
      const brandedMain = join(tmpdir(), `brand-main-logo-${token}.mp4`);
      tempPaths.push(rawLogo, brandedMain);
      try {
        await downloadAsset(logoAsset, rawLogo);
        await overlayLogo({
          sourcePath: normalizedMain,
          logoPath: rawLogo,
          outputPath: brandedMain,
          width: dimensions.width,
          height: dimensions.height,
          config: logoConfig,
        });
        const buffer = await readFile(brandedMain);
        if (!buffer.length) throw new Error("Overlay de logo gerou vídeo vazio");
        mainVideoPath = brandedMain;
        logoApplied = true;
      } catch (error) {
        logoWarning = error instanceof Error
          ? `Logo não aplicada: ${error.message}`
          : "Logo não aplicada por falha desconhecida";
      }
    }
  }

  if (!introAssetId && !outroAssetId) {
    if (!logoApplied) {
      return {
        outputPath: input.sourcePath,
        logoAssetId,
        introAssetId: null,
        outroAssetId: null,
        logoApplied: false,
        introApplied: false,
        outroApplied: false,
        logoWarning,
        cleanup: async () => {
          await Promise.all(tempPaths.map((path) => unlink(path).catch(() => undefined)));
        },
      };
    }
    return {
      outputPath: mainVideoPath,
      logoAssetId,
      introAssetId: null,
      outroAssetId: null,
      logoApplied: true,
      introApplied: false,
      outroApplied: false,
      logoWarning,
      cleanup: async () => {
        await Promise.all(tempPaths.map((path) => unlink(path).catch(() => undefined)));
      },
    };
  }

  const ordered: string[] = [];
  if (introAssetId) {
    const introAsset = assets.get(introAssetId)!;
    const rawIntro = join(tmpdir(), `brand-intro-raw-${token}.${safeExtension(introAsset)}`);
    const normalizedIntro = join(tmpdir(), `brand-intro-${token}.mp4`);
    tempPaths.push(rawIntro, normalizedIntro);
    await downloadAsset(introAsset, rawIntro);
    await normalizeSegment(rawIntro, normalizedIntro, dimensions.width, dimensions.height);
    ordered.push(normalizedIntro);
  }

  ordered.push(mainVideoPath);

  if (outroAssetId) {
    const outroAsset = assets.get(outroAssetId)!;
    const rawOutro = join(tmpdir(), `brand-outro-raw-${token}.${safeExtension(outroAsset)}`);
    const normalizedOutro = join(tmpdir(), `brand-outro-${token}.mp4`);
    tempPaths.push(rawOutro, normalizedOutro);
    await downloadAsset(outroAsset, rawOutro);
    await normalizeSegment(rawOutro, normalizedOutro, dimensions.width, dimensions.height);
    ordered.push(normalizedOutro);
  }

  const concatList = join(tmpdir(), `brand-concat-${token}.txt`);
  const outputPath = join(tmpdir(), `brand-output-${token}.mp4`);
  tempPaths.push(concatList, outputPath);
  await writeFile(concatList, ordered.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatList,
    "-c", "copy",
    "-movflags", "+faststart",
    outputPath,
  ], { maxBuffer: 8 * 1024 * 1024 });

  const finalBuffer = await readFile(outputPath);
  if (!finalBuffer.length) throw new Error("Concatenação do Brand Video Kit gerou vídeo vazio");

  return {
    outputPath,
    logoAssetId,
    introAssetId,
    outroAssetId,
    logoApplied,
    introApplied: Boolean(introAssetId),
    outroApplied: Boolean(outroAssetId),
    logoWarning,
    cleanup: async () => {
      await Promise.all(tempPaths.map((path) => unlink(path).catch(() => undefined)));
    },
  };
}
