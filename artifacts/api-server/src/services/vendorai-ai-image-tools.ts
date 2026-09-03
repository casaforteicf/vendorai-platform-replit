import { and, eq } from "drizzle-orm";
import { toFile } from "openai";
import { db, mediaAssetsTable } from "@workspace/db";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { createMediaJob, updateMediaJob } from "./media-jobs.js";
import {
  createProcessingMediaProject,
  registerGeneratedMediaOutput,
  setMediaProjectStatus,
} from "./media-library.js";
import { randomUUID } from "crypto";

const objectStorage = new ObjectStorageService();

type AiImageOperation = "image_remove_background" | "image_variations";
type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

export class AiImageToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiImageToolValidationError";
  }
}

function extractBuffer(result: { data?: Array<{ b64_json?: string | null }> | null }): Buffer {
  const encoded = result.data?.[0]?.b64_json ?? undefined;
  if (!encoded) throw new Error("O gerador de imagens não retornou conteúdo");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw new Error("A imagem gerada ficou vazia");
  return buffer;
}

function isModelAvailabilityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("model") && (message.includes("not found") || message.includes("does not exist") || message.includes("unsupported") || message.includes("access"));
}

async function resolveSource(tenantId: string, assetId: string) {
  const [asset] = await db.select().from(mediaAssetsTable).where(and(
    eq(mediaAssetsTable.id, assetId),
    eq(mediaAssetsTable.tenantId, tenantId),
    eq(mediaAssetsTable.type, "image"),
  )).limit(1);
  if (!asset) throw new AiImageToolValidationError("Imagem não encontrada neste tenant");
  if (!asset.storageUrl?.startsWith("/objects/")) throw new AiImageToolValidationError("A imagem precisa estar no Object Storage do VendorAI");
  const file = await objectStorage.getObjectEntityFile(asset.storageUrl);
  const [buffer] = await file.download();
  if (!buffer.length) throw new AiImageToolValidationError("A imagem de origem está vazia");
  return { asset, buffer };
}

async function editImage(input: {
  tenantId: string;
  source: Buffer;
  prompt: string;
  size: ImageSize;
  transparent?: boolean;
}) {
  const openai = await getOpenAIForTenant(input.tenantId);
  const sourceFile = await toFile(input.source, "source-image.png", { type: "image/png" });
  const preferredModel = process.env["VENDORAI_IMAGE_MODEL"]?.trim() || "gpt-image-2";
  const call = async (model: string) => {
    const result = await openai.images.edit({
      model,
      image: sourceFile,
      prompt: input.prompt,
      n: 1,
      size: input.size,
      quality: "medium",
      ...(input.transparent ? { background: "transparent", output_format: "png" } : {}),
    });
    return { buffer: extractBuffer(result), model };
  };
  try {
    return await call(preferredModel);
  } catch (error) {
    if (preferredModel === "gpt-image-1" || !isModelAvailabilityError(error)) throw error;
    return call("gpt-image-1");
  }
}

export async function startVendorAiAiImageTool(input: {
  tenantId: string;
  userId?: string | null;
  assetId: string;
  title: string;
  operation: AiImageOperation;
  prompt?: string;
  count?: number;
  size?: ImageSize;
}) {
  const { asset, buffer } = await resolveSource(input.tenantId, input.assetId);
  const count = input.operation === "image_variations" ? Math.max(1, Math.min(4, Math.round(input.count ?? 2))) : 1;
  const size: ImageSize = input.size === "1024x1536" || input.size === "1536x1024" ? input.size : "1024x1024";
  const prompt = input.operation === "image_remove_background"
    ? "Preserve the subject/product exactly. Remove only the background and return the isolated subject on a fully transparent background. Do not add shadows, text, logos, borders or new objects. Preserve colors, geometry, materials and identifying details."
    : `Create a distinct professional variation of the supplied image while preserving the main subject/product identity, geometry, colors, materials, logo and recognizable details. ${input.prompt?.trim() || "Improve composition, lighting and presentation without changing the product itself."} Do not invent text or watermarks.`;

  const projectId = await createProcessingMediaProject({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title,
    operation: input.operation,
    context: { engine: "vendorai", sourceAssetId: asset.id, count, size, prompt, generatedByAi: true },
  });
  const jobId = randomUUID();
  await createMediaJob({
    id: jobId,
    tenantId: input.tenantId,
    projectId,
    operation: input.operation,
    provider: "vendorai",
    input: { title: input.title, sourceAssetId: asset.id, count, size, prompt, userId: input.userId ?? null },
    snapshot: { status: "running", progress: 0 },
  });

  void (async () => {
    const outputs: Array<Record<string, unknown>> = [];
    try {
      for (let index = 0; index < count; index += 1) {
        const result = await editImage({
          tenantId: input.tenantId,
          source: buffer,
          prompt: count > 1 ? `${prompt} Variation ${index + 1} of ${count}; make the composition meaningfully distinct from the other variations.` : prompt,
          size,
          transparent: input.operation === "image_remove_background",
        });
        const filename = `${input.operation}-${asset.id}-${index + 1}.png`;
        const storageUrl = await objectStorage.savePrivateBuffer(result.buffer, "image/png", filename);
        const registered = await registerGeneratedMediaOutput({
          tenantId: input.tenantId,
          projectId,
          userId: input.userId ?? null,
          storageUrl,
          mimeType: "image/png",
          type: "image",
          originalFilename: filename,
          operation: input.operation,
          label: count > 1 ? `${input.title} ${index + 1}` : input.title,
          metadata: {
            sourceAssetId: asset.id,
            model: result.model,
            prompt,
            variationIndex: index,
            generatedByAi: true,
            treated: true,
            transparentBackground: input.operation === "image_remove_background",
            size,
          },
        });
        outputs.push({ storageUrl, assetId: registered.assetId, versionId: registered.versionId, model: result.model });
        await updateMediaJob(jobId, input.tenantId, { status: "running", progress: Math.round(((index + 1) / count) * 95), outputs });
      }
      await updateMediaJob(jobId, input.tenantId, { status: "done", progress: 100, outputs });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no tratamento de imagem por IA";
      await setMediaProjectStatus(input.tenantId, projectId, "draft").catch(() => undefined);
      await updateMediaJob(jobId, input.tenantId, { status: "error", error: message, outputs }).catch(() => undefined);
    }
  })();

  return { projectId, jobId, operation: input.operation, provider: "vendorai" as const };
}
