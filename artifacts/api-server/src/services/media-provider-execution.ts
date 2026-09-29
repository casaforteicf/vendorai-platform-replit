import type { Logger } from "pino";
import { toFile } from "openai";
import sharp from "sharp";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { callReplicateVeo31 } from "../lib/arch-render-pipeline.js";
import { callGoogleVertexVeo } from "../lib/google-veo-direct.js";
import { resolveMediaProvider } from "./media-provider-router.js";

function decodeDataUrl(imageDataUrl: string, label: string): { source: Buffer; mime: string } {
  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error(`Imagem base inválida para ${label}`);
  const mime = match[1] || "image/png";
  const source = Buffer.from(match[2], "base64");
  if (!source.length) throw new Error(`Imagem base vazia para ${label}`);
  return { source, mime };
}

function arqdorImageModel(): string {
  return process.env["VENDORAI_IMAGE_MODEL_PREMIUM"]?.trim() || "gpt-image-2";
}

async function normalizeOpenAiMask(maskDataUrl: string): Promise<{ source: Buffer; mime: string }> {
  const decoded = decodeDataUrl(maskDataUrl, "máscara do Render Premium");
  const meta = await sharp(decoded.source).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) throw new Error("Máscara do Render Premium sem dimensões válidas");

  // A máscara interna do Arqdor usa branco=editar e preto=preservar.
  // A API de edição de imagens exige PNG com canal alpha, onde
  // transparente=editar e opaco=preservar. Convertemos sem alterar a
  // máscara usada depois pelo compositing/QA.
  const gray = await sharp(decoded.source)
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const value = gray[i] ?? 0;
    const p = i * 4;
    rgba[p] = 255;
    rgba[p + 1] = 255;
    rgba[p + 2] = 255;
    rgba[p + 3] = 255 - value;
  }

  const source = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();

  return { source, mime: "image/png" };
}

export async function generateRenderPremiumOpenAI(input: {
  tenantId: string;
  imageDataUrl: string;
  prompt: string;
  maskDataUrl?: string;
  referenceImageDataUrls?: string[];
  logger?: Logger;
}): Promise<{ base64: string; provider: "openai"; model: string }> {
  const { source, mime } = decodeDataUrl(input.imageDataUrl, "Render Premium");
  const openai = await getOpenAIForTenant(input.tenantId);
  const model = arqdorImageModel();
  const baseImage = await toFile(source, "arqdor-reference.png", { type: mime });

  const extraReferences = await Promise.all(
    (input.referenceImageDataUrls ?? []).slice(0, 3).map(async (dataUrl, index) => {
      const decoded = decodeDataUrl(dataUrl, `referência visual ${index + 1}`);
      return toFile(decoded.source, `arqdor-material-reference-${index + 1}.png`, { type: decoded.mime });
    }),
  );
  const image = extraReferences.length > 0 ? [baseImage, ...extraReferences] : baseImage;

  let mask: any;
  if (input.maskDataUrl) {
    const decodedMask = await normalizeOpenAiMask(input.maskDataUrl);
    mask = await toFile(decodedMask.source, "arqdor-mask.png", { type: decodedMask.mime });
  }

  input.logger?.info(
    { provider: "openai", model, operation: mask ? "masked-edit" : "edit", referenceCount: extraReferences.length },
    "Arqdor Premium: submitting OpenAI image edit",
  );

  const request: Record<string, unknown> = {
    model,
    image,
    prompt: input.prompt,
    n: 1,
    size: "auto",
    quality: "high",
    output_format: "png",
  };
  if (mask) request["mask"] = mask;

  // GPT Image 2 already processes image inputs at high fidelity. Do not send
  // input_fidelity here because the model does not accept an override.
  const result = await (openai.images.edit as Function)(request);
  const encoded = result?.data?.[0]?.b64_json as string | undefined;
  if (!encoded) throw new Error(`${model} não retornou imagem para o Render Premium`);

  input.logger?.info({ provider: "openai", model }, "Arqdor Premium: image edit succeeded");
  return { base64: encoded, provider: "openai", model };
}

export async function generateRenderCreateOpenAI(input: {
  tenantId: string;
  prompt: string;
  logger?: Logger;
}): Promise<{ base64: string; provider: "openai"; model: string }> {
  const openai = await getOpenAIForTenant(input.tenantId);
  const model = arqdorImageModel();

  input.logger?.info({ provider: "openai", model }, "Arqdor Premium: submitting OpenAI image generation");
  const result = await (openai.images.generate as Function)({
    model,
    prompt: input.prompt,
    n: 1,
    size: "1536x1024",
    quality: "high",
    output_format: "png",
  });

  const encoded = result?.data?.[0]?.b64_json as string | undefined;
  if (!encoded) throw new Error(`${model} não retornou imagem para o Render Premium`);

  input.logger?.info({ provider: "openai", model }, "Arqdor Premium: image generation succeeded");
  return { base64: encoded, provider: "openai", model };
}

export async function generateVeoVideo(input: {
  prompt: string;
  cinema?: boolean;
  aspectRatio?: "16:9" | "9:16";
  duration?: 4 | 6 | 8;
  resolution?: "720p" | "1080p";
  generateAudio?: boolean;
  negativePrompt?: string;
  image?: string;
  lastFrame?: string;
  referenceImages?: string[];
  logger?: Logger;
}): Promise<{
  buffer: Buffer;
  provider: "google-vertex" | "replicate";
  model: string;
  providerJobId: string;
}> {
  const workload = input.cinema ? "video_cinema" : "video_standard";
  const route = resolveMediaProvider(workload);

  if (route.provider === "google-vertex") {
    try {
      const direct = await callGoogleVertexVeo({
        prompt: input.prompt,
        model: input.cinema ? "veo-3.1-generate-001" : "veo-3.1-fast-generate-001",
        aspectRatio: input.aspectRatio,
        duration: input.duration,
        resolution: input.resolution,
        negativePrompt: input.negativePrompt,
        image: input.image,
        logger: input.logger,
      });
      return {
        buffer: direct.buffer,
        provider: "google-vertex",
        model: direct.model,
        providerJobId: direct.operationId,
      };
    } catch (error) {
      if (!route.route.fallbacks.includes("replicate") || !process.env["REPLICATE_API_TOKEN"]) throw error;
      input.logger?.warn({ err: error }, "Google Vertex Veo failed; falling back to Replicate");
    }
  }

  const model = input.cinema ? "google/veo-3.1" : "google/veo-3.1-lite";
  const fallback = await callReplicateVeo31({
    prompt: input.prompt,
    model,
    aspectRatio: input.aspectRatio,
    duration: input.duration,
    resolution: input.resolution,
    generateAudio: input.generateAudio,
    negativePrompt: input.negativePrompt,
    image: input.image,
    lastFrame: input.lastFrame,
    referenceImages: input.referenceImages,
    logger: input.logger,
  });
  return {
    buffer: fallback.buffer,
    provider: "replicate",
    model: fallback.model,
    providerJobId: fallback.predictionId,
  };
}
