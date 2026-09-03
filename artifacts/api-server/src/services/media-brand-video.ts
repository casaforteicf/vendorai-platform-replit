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
  introAssetId: string | null;
  outroAssetId: string | null;
  introApplied: boolean;
  outroApplied: boolean;
  cleanup: () => Promise<void>;
};

type VideoAsset = {
  id: string;
  storage_url: string;
};

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

async function downloadAsset(asset: VideoAsset, path: string): Promise<void> {
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

export async function applyBrandIntroOutro(input: {
  tenantId: string;
  sourcePath: string;
  jobId?: string;
}): Promise<BrandVideoResult> {
  const result = await pool.query(
    `SELECT intro_asset_id, outro_asset_id
       FROM media_brand_video_kits
      WHERE tenant_id = $1 AND status = 'active'
      LIMIT 1`,
    [input.tenantId],
  );
  const introAssetId = result.rows[0]?.intro_asset_id ? String(result.rows[0].intro_asset_id) : null;
  const outroAssetId = result.rows[0]?.outro_asset_id ? String(result.rows[0].outro_asset_id) : null;

  if (!introAssetId && !outroAssetId) {
    return {
      outputPath: input.sourcePath,
      introAssetId: null,
      outroAssetId: null,
      introApplied: false,
      outroApplied: false,
      cleanup: async () => undefined,
    };
  }

  const ids = [introAssetId, outroAssetId].filter((value): value is string => Boolean(value));
  const assetResult = await pool.query(
    `SELECT id, storage_url
       FROM media_assets
      WHERE tenant_id = $1
        AND id = ANY($2::text[])
        AND type = 'video'`,
    [input.tenantId, ids],
  );
  const assets = new Map<string, VideoAsset>(assetResult.rows.map((row) => [String(row.id), {
    id: String(row.id),
    storage_url: String(row.storage_url),
  }]));

  if (introAssetId && !assets.has(introAssetId)) throw new Error("Abertura do Brand Video Kit não está disponível");
  if (outroAssetId && !assets.has(outroAssetId)) throw new Error("Encerramento do Brand Video Kit não está disponível");

  const token = input.jobId ?? randomUUID();
  const tempPaths: string[] = [];
  const dimensions = await videoDimensions(input.sourcePath);
  const normalizedMain = join(tmpdir(), `brand-main-${token}.mp4`);
  tempPaths.push(normalizedMain);
  await normalizeSegment(input.sourcePath, normalizedMain, dimensions.width, dimensions.height);

  const ordered: string[] = [];
  if (introAssetId) {
    const rawIntro = join(tmpdir(), `brand-intro-raw-${token}.mp4`);
    const normalizedIntro = join(tmpdir(), `brand-intro-${token}.mp4`);
    tempPaths.push(rawIntro, normalizedIntro);
    await downloadAsset(assets.get(introAssetId)!, rawIntro);
    await normalizeSegment(rawIntro, normalizedIntro, dimensions.width, dimensions.height);
    ordered.push(normalizedIntro);
  }

  ordered.push(normalizedMain);

  if (outroAssetId) {
    const rawOutro = join(tmpdir(), `brand-outro-raw-${token}.mp4`);
    const normalizedOutro = join(tmpdir(), `brand-outro-${token}.mp4`);
    tempPaths.push(rawOutro, normalizedOutro);
    await downloadAsset(assets.get(outroAssetId)!, rawOutro);
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
    introAssetId,
    outroAssetId,
    introApplied: Boolean(introAssetId),
    outroApplied: Boolean(outroAssetId),
    cleanup: async () => {
      await Promise.all(tempPaths.map((path) => unlink(path).catch(() => undefined)));
    },
  };
}
