import { and, eq } from "drizzle-orm";
import sharp, { type Sharp } from "sharp";
import { db, mediaAssetsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  createProcessingMediaProject,
  registerGeneratedMediaOutput,
} from "./media-library.js";

export type VendorAiNativeImageOperation =
  | "image_resize"
  | "image_crop"
  | "image_optimize"
  | "image_enhance"
  | "image_convert";

export interface NativeImageToolOptions {
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  position?: "centre" | "north" | "south" | "east" | "west" | "northeast" | "northwest" | "southeast" | "southwest";
  left?: number;
  top?: number;
  quality?: number;
  format?: "jpeg" | "png" | "webp";
  brightness?: number;
  saturation?: number;
  sharpen?: number;
}

export class MediaImageAssetNotFoundError extends Error {
  constructor() {
    super("Ativo de imagem não encontrado para este tenant");
    this.name = "MediaImageAssetNotFoundError";
  }
}

export class MediaImageToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaImageToolValidationError";
  }
}

const objectStorage = new ObjectStorageService();

function boundedInt(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function boundedNumber(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function extensionFor(format: "jpeg" | "png" | "webp"): string {
  return format === "jpeg" ? "jpg" : format;
}

function mimeFor(format: "jpeg" | "png" | "webp"): string {
  return `image/${format}`;
}

async function applyOutputFormat(
  pipeline: Sharp,
  format: "jpeg" | "png" | "webp",
  quality: number,
): Promise<Buffer> {
  if (format === "png") return pipeline.png({ compressionLevel: 9 }).toBuffer();
  if (format === "webp") return pipeline.webp({ quality }).toBuffer();
  return pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
}

export async function processVendorAiImageTool(input: {
  tenantId: string;
  userId?: string | null;
  assetId: string;
  title: string;
  operation: VendorAiNativeImageOperation;
  options?: NativeImageToolOptions;
}) {
  const [asset] = await db
    .select()
    .from(mediaAssetsTable)
    .where(
      and(
        eq(mediaAssetsTable.id, input.assetId),
        eq(mediaAssetsTable.tenantId, input.tenantId),
        eq(mediaAssetsTable.type, "image"),
      ),
    )
    .limit(1);

  if (!asset) throw new MediaImageAssetNotFoundError();
  if (!asset.storageUrl?.startsWith("/objects/")) {
    throw new MediaImageToolValidationError("A imagem precisa estar no Object Storage do VendorAI");
  }

  const sourceFile = await objectStorage.getObjectEntityFile(asset.storageUrl);
  const [sourceBuffer] = await sourceFile.download();
  const sourceMetadata = await sharp(sourceBuffer).metadata();
  const options = input.options ?? {};
  const width = boundedInt(options.width, 1, 12000);
  const height = boundedInt(options.height, 1, 12000);
  const quality = boundedInt(options.quality, 35, 100) ?? 90;
  const format = options.format ?? (sourceMetadata.format === "png" ? "png" : sourceMetadata.format === "webp" ? "webp" : "jpeg");

  let pipeline = sharp(sourceBuffer).rotate();

  switch (input.operation) {
    case "image_resize": {
      if (!width && !height) {
        throw new MediaImageToolValidationError("Informe width e/ou height para redimensionar");
      }
      pipeline = pipeline.resize({
        width,
        height,
        fit: options.fit ?? "inside",
        position: options.position ?? "centre",
        withoutEnlargement: false,
      });
      break;
    }
    case "image_crop": {
      const left = boundedInt(options.left, 0, 12000);
      const top = boundedInt(options.top, 0, 12000);
      if (left === undefined || top === undefined || !width || !height) {
        throw new MediaImageToolValidationError("Corte exige left, top, width e height válidos");
      }
      const sourceWidth = sourceMetadata.width ?? 0;
      const sourceHeight = sourceMetadata.height ?? 0;
      if (left + width > sourceWidth || top + height > sourceHeight) {
        throw new MediaImageToolValidationError("Área de corte ultrapassa os limites da imagem");
      }
      pipeline = pipeline.extract({ left, top, width, height });
      break;
    }
    case "image_optimize": {
      if (width || height) {
        pipeline = pipeline.resize({ width, height, fit: options.fit ?? "inside", position: options.position ?? "centre", withoutEnlargement: true });
      }
      break;
    }
    case "image_enhance": {
      const brightness = boundedNumber(options.brightness, 0.7, 1.4) ?? 1;
      const saturation = boundedNumber(options.saturation, 0, 2) ?? 1.05;
      const sharpenSigma = boundedNumber(options.sharpen, 0.3, 3) ?? 0.8;
      pipeline = pipeline
        .normalize()
        .modulate({ brightness, saturation })
        .sharpen({ sigma: sharpenSigma });
      break;
    }
    case "image_convert":
      break;
    default:
      throw new MediaImageToolValidationError("Operação nativa de imagem inválida");
  }

  const outputBuffer = await applyOutputFormat(pipeline, format, quality);
  const projectId = await createProcessingMediaProject({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title,
    operation: input.operation,
    kind: "mixed",
    context: {
      engine: "vendorai",
      sourceAssetId: asset.id,
      native: true,
      options,
    },
  });

  const filename = `${input.operation}-${asset.id}.${extensionFor(format)}`;
  const storageUrl = await objectStorage.savePrivateBuffer(outputBuffer, mimeFor(format), filename);
  const outputMetadata = await sharp(outputBuffer).metadata();
  const registered = await registerGeneratedMediaOutput({
    tenantId: input.tenantId,
    projectId,
    userId: input.userId ?? null,
    storageUrl,
    mimeType: mimeFor(format),
    type: "image",
    originalFilename: filename,
    operation: input.operation,
    label: input.title,
    metadata: {
      sourceAssetId: asset.id,
      sourceProjectId: asset.projectId ?? null,
      width: outputMetadata.width ?? null,
      height: outputMetadata.height ?? null,
      format,
      quality,
      native: true,
      options,
    },
  });

  return {
    projectId,
    ...registered,
    storageUrl,
    mimeType: mimeFor(format),
    width: outputMetadata.width ?? null,
    height: outputMetadata.height ?? null,
    operation: input.operation,
  };
}
