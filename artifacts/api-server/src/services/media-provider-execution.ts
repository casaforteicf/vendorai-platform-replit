import type { Logger } from "pino";
import {
  callReplicateFluxKontext,
  callReplicateFluxUltraPro,
  callReplicateVeo31,
} from "../lib/arch-render-pipeline.js";
import { callBflFlux2Pro, callBflKontextPro } from "../lib/bfl-direct.js";
import { callGoogleVertexVeo } from "../lib/google-veo-direct.js";
import { resolveMediaProvider } from "./media-provider-router.js";

export async function generateRenderPreserve(input: {
  imageDataUrl: string;
  prompt: string;
  logger?: Logger;
  signal?: AbortSignal;
  resumePredictionId?: string;
  beforeSubmit?: () => Promise<void>;
  onPredictionCreated?: (id: string) => Promise<void>;
}): Promise<{ base64: string; provider: "bfl" | "replicate"; model: string }> {
  const route = resolveMediaProvider("render_preserve");
  if (route.provider === "bfl") {
    try {
      const base64 = await callBflKontextPro({
        imageDataUrl: input.imageDataUrl,
        prompt: input.prompt,
        logger: input.logger,
      });
      return { base64, provider: "bfl", model: "flux-kontext-pro" };
    } catch (error) {
      if (!route.route.fallbacks.includes("replicate") || !process.env["REPLICATE_API_TOKEN"]) throw error;
      input.logger?.warn({ err: error }, "BFL direct failed; falling back to Replicate");
    }
  }

  const base64 = await callReplicateFluxKontext({
    imageDataUrl: input.imageDataUrl,
    prompt: input.prompt,
    logger: input.logger,
    signal: input.signal,
    resumePredictionId: input.resumePredictionId,
    beforeSubmit: input.beforeSubmit,
    onPredictionCreated: input.onPredictionCreated,
  });
  return { base64, provider: "replicate", model: "black-forest-labs/flux-kontext-pro" };
}

export async function generateRenderCreate(input: {
  prompt: string;
  logger?: Logger;
}): Promise<{ base64: string; provider: "bfl" | "replicate"; model: string }> {
  const route = resolveMediaProvider("render_create");
  if (route.provider === "bfl") {
    try {
      const base64 = await callBflFlux2Pro({
        prompt: input.prompt,
        width: 1536,
        height: 1024,
        logger: input.logger,
      });
      return { base64, provider: "bfl", model: "flux-2-pro" };
    } catch (error) {
      if (!route.route.fallbacks.includes("replicate") || !process.env["REPLICATE_API_TOKEN"]) throw error;
      input.logger?.warn({ err: error }, "BFL direct failed; falling back to Replicate");
    }
  }

  const base64 = await callReplicateFluxUltraPro({ prompt: input.prompt, logger: input.logger });
  return { base64, provider: "replicate", model: "black-forest-labs/flux-1.1-pro-ultra" };
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
