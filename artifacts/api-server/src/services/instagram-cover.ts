import sharp from "sharp";

export type InstagramCoverCrop = {
  zoom: number;
  x: number;
  y: number;
};

const PROFILE_ASPECT = 3 / 4;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeInstagramCoverCrop(input?: Partial<InstagramCoverCrop> | null): InstagramCoverCrop {
  return {
    zoom: clamp(Number(input?.zoom ?? 1), 1, 3),
    x: clamp(Number(input?.x ?? 0), -1, 1),
    y: clamp(Number(input?.y ?? 0), -1, 1),
  };
}

export function computeInstagramCoverCropRegion(
  width: number,
  height: number,
  input?: Partial<InstagramCoverCrop> | null,
) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Dimensões inválidas para a capa.");
  }

  const crop = normalizeInstagramCoverCrop(input);
  const sourceAspect = width / height;

  let baseWidth: number;
  let baseHeight: number;

  if (sourceAspect > PROFILE_ASPECT) {
    baseHeight = height;
    baseWidth = height * PROFILE_ASPECT;
  } else {
    baseWidth = width;
    baseHeight = width / PROFILE_ASPECT;
  }

  const cropWidth = Math.max(1, Math.min(width, Math.round(baseWidth / crop.zoom)));
  const cropHeight = Math.max(1, Math.min(height, Math.round(baseHeight / crop.zoom)));
  const maxLeft = Math.max(0, width - cropWidth);
  const maxTop = Math.max(0, height - cropHeight);
  const left = Math.round(((crop.x + 1) / 2) * maxLeft);
  const top = Math.round(((crop.y + 1) / 2) * maxTop);

  return {
    left,
    top,
    width: cropWidth,
    height: cropHeight,
    crop,
  };
}

export async function renderInstagramProfileCover(
  sourceBuffer: Buffer,
  input?: Partial<InstagramCoverCrop> | null,
): Promise<{ buffer: Buffer; crop: InstagramCoverCrop }> {
  const normalized = await sharp(sourceBuffer)
    .rotate()
    .toColorspace("srgb")
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toBuffer({ resolveWithObject: true });

  const region = computeInstagramCoverCropRegion(normalized.info.width, normalized.info.height, input);
  const buffer = await sharp(normalized.data)
    .extract({
      left: region.left,
      top: region.top,
      width: region.width,
      height: region.height,
    })
    .resize(900, 1200, { fit: "fill" })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();

  return { buffer, crop: region.crop };
}

export async function normalizeInstagramCoverSource(sourceBuffer: Buffer): Promise<Buffer> {
  return sharp(sourceBuffer)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .toColorspace("srgb")
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
