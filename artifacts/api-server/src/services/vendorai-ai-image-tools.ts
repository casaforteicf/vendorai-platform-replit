import { and, eq } from "drizzle-orm";
import { toFile } from "openai";
import { db, mediaAssetsTable, pool } from "@workspace/db";
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

export type AiImageOperation =
  | "image_remove_background"
  | "image_variations"
  | "image_replace_background"
  | "image_remove_object"
  | "image_outpaint";
export type VendorAiImageSize = "1024x1024" | "1024x1536" | "1536x1024";

type DubleVisualReferenceType = "scenario" | "outfit" | "environment";
type DubleVisualReference = {
  assetId: string;
  type: DubleVisualReferenceType;
  label: string;
  buffer: Buffer;
  mimeType: string | null;
};

export class AiImageToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiImageToolValidationError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

async function resolveDubleVisualReferences(tenantId: string, faceAssetId: string): Promise<DubleVisualReference[]> {
  const identityResult = await pool.query(
    `SELECT id
       FROM media_identities
      WHERE tenant_id = $1
        AND face_reference_asset_id = $2
        AND status = 'active'
      LIMIT 1`,
    [tenantId, faceAssetId],
  );
  const identityId = identityResult.rows[0]?.id ? String(identityResult.rows[0].id) : "";
  if (!identityId) return [];

  const referenceResult = await pool.query(
    `SELECT id, metadata, created_at
       FROM media_assets
      WHERE tenant_id = $1
        AND type = 'image'
        AND metadata->>'usage' = 'duble_style_visual_reference'
        AND metadata->>'identityId' = $2
      ORDER BY created_at DESC
      LIMIT 100`,
    [tenantId, identityId],
  );

  const rows = referenceResult.rows as Array<{ id: string; metadata?: unknown }>;
  const selected: Array<{ assetId: string; type: DubleVisualReferenceType; label: string }> = [];
  const typeOrder: DubleVisualReferenceType[] = ["environment", "scenario", "outfit"];

  for (const type of typeOrder) {
    const row = rows.find((candidate) => {
      const metadata = asRecord(candidate.metadata);
      return metadata["referenceType"] === type
        && metadata["active"] !== false
        && metadata["approvedForGeneration"] !== false;
    });
    if (!row) continue;
    const metadata = asRecord(row.metadata);
    selected.push({
      assetId: String(row.id),
      type,
      label: String(metadata["label"] ?? metadata["referenceType"] ?? type),
    });
  }

  const resolved: DubleVisualReference[] = [];
  for (const item of selected) {
    try {
      const source = await resolveSource(tenantId, item.assetId);
      resolved.push({
        ...item,
        buffer: source.buffer,
        mimeType: source.asset.mimeType ?? null,
      });
    } catch {
      // A referência visual é complementar. Uma imagem removida/corrompida
      // não pode impedir o Dublê de usar a referência facial principal.
    }
  }
  return resolved;
}

function buildDubleVisualReferenceInstructions(references: DubleVisualReference[]): string {
  if (!references.length) return "";
  const descriptions = references.map((reference, index) => {
    const imageNumber = index + 2;
    if (reference.type === "environment") {
      return `Image ${imageNumber} is the REAL ENVIRONMENT reference named \"${reference.label}\". Reproduce its architecture, materials, color relationships, spatial character and believable atmosphere as closely as possible while adapting perspective to the spokesperson shot.`;
    }
    if (reference.type === "scenario") {
      return `Image ${imageNumber} is a SCENARIO STYLE reference named \"${reference.label}\". Use it to guide background composition, décor, depth, palette and visual mood.`;
    }
    return `Image ${imageNumber} is a WARDROBE reference named \"${reference.label}\". Apply the garment style, cut, material impression and overall clothing composition to the authorized person, adapting fit naturally to their body.`;
  });

  return [
    "MULTI-IMAGE REFERENCE RULES:",
    "Image 1 is the ONLY identity source. Preserve the face, skin, age, hair and recognizable identity from Image 1. Never copy or blend faces, bodies, skin, tattoos, accessories or identity traits from the other images.",
    ...descriptions,
    "Visual references have priority over generic scene or wardrobe wording when they conflict. For the background, a real environment reference has priority over a scenario-style reference. Use wardrobe references only for clothing, never for identity.",
    "Do not copy people, readable text, logos, watermarks, badges or protected brand marks from any style reference. The result must remain a photorealistic photograph of the authorized person in a coherent, physically plausible setting.",
  ].join(" ");
}

async function editImage(input: {
  tenantId: string;
  source: Buffer;
  sourceMimeType?: string | null;
  referenceSources?: Array<{ buffer: Buffer; mimeType?: string | null; name: string }>;
  prompt: string;
  size: VendorAiImageSize;
  transparent?: boolean;
}) {
  const openai = await getOpenAIForTenant(input.tenantId);
  const normalizeMime = (value: string | null | undefined) => value?.startsWith("image/") ? value : "image/png";
  const sourceFile = await toFile(input.source, "identity-source.png", { type: normalizeMime(input.sourceMimeType) });
  const referenceFiles = await Promise.all((input.referenceSources ?? []).map((reference, index) =>
    toFile(reference.buffer, `style-reference-${index + 1}.png`, { type: normalizeMime(reference.mimeType) }),
  ));
  const imageInput = referenceFiles.length ? [sourceFile, ...referenceFiles] : sourceFile;
  const preferredModel = process.env["VENDORAI_IMAGE_MODEL"]?.trim() || "gpt-image-2";
  const call = async (model: string) => {
    const result = await openai.images.edit({
      model,
      image: imageInput as any,
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

/**
 * Low-level image-reference edit used by the Media Engine itself.
 * It intentionally does not create a Media Project or asset. Callers that
 * compose higher-level workflows (such as Dublê Digital) own registration,
 * metadata and consent semantics for the generated output.
 *
 * For the Dublê style workflow this function also discovers, tenant-scoped,
 * the active visual references uploaded in the Style Library. Those files are
 * sent as additional image inputs so environment and wardrobe are grounded in
 * real references instead of depending only on text prompts.
 */
export async function editVendorAiImageReference(input: {
  tenantId: string;
  assetId: string;
  prompt: string;
  size?: VendorAiImageSize;
}) {
  const { asset, buffer } = await resolveSource(input.tenantId, input.assetId);
  const visualReferences = await resolveDubleVisualReferences(input.tenantId, input.assetId);
  const visualInstructions = buildDubleVisualReferenceInstructions(visualReferences);
  const prompt = visualInstructions ? `${input.prompt} ${visualInstructions}` : input.prompt;
  const result = await editImage({
    tenantId: input.tenantId,
    source: buffer,
    sourceMimeType: asset.mimeType ?? null,
    referenceSources: visualReferences.map((reference) => ({
      buffer: reference.buffer,
      mimeType: reference.mimeType,
      name: reference.label,
    })),
    prompt,
    size: input.size ?? "1024x1536",
  });
  return {
    sourceAsset: asset,
    buffer: result.buffer,
    model: result.model,
    visualReferences: visualReferences.map(({ buffer: _buffer, mimeType: _mimeType, ...reference }) => reference),
  };
}

function buildPrompt(operation: AiImageOperation, instruction: string): string {
  const preserve = "Preserve all unaffected real geometry, proportions, materials, colors, logos, text and identifying details exactly. Do not invent unrelated objects, text or branding.";
  if (operation === "image_remove_background") {
    return `Preserve the subject/product exactly. Remove only the background and return the isolated subject on a fully transparent background. Do not add shadows, text, logos, borders or new objects. Preserve colors, geometry, materials and identifying details.`;
  }
  if (operation === "image_replace_background") {
    if (!instruction) throw new AiImageToolValidationError("Descreva o novo fundo desejado");
    return `Replace only the background of the supplied image with this background: ${instruction}. Keep the foreground subject/product/building exactly unchanged. Match realistic lighting and perspective without altering the subject. ${preserve}`;
  }
  if (operation === "image_remove_object") {
    if (!instruction) throw new AiImageToolValidationError("Descreva exatamente o objeto ou elemento que deve ser removido");
    return `Remove only this object/element from the supplied image: ${instruction}. Reconstruct the area naturally from the surrounding scene. Do not move, redesign or alter any other object or architectural/product detail. ${preserve}`;
  }
  if (operation === "image_outpaint") {
    return `Expand the supplied image naturally beyond its current framing to create a wider, complete composition. Continue the real scene, architecture, materials, landscape, lighting and perspective consistently. ${instruction ? `Expansion direction/details: ${instruction}.` : "Extend the surrounding scene naturally."} ${preserve}`;
  }
  return `Create a distinct professional variation of the supplied image while preserving the main subject/product identity, geometry, colors, materials, logo and recognizable details. ${instruction || "Improve composition, lighting and presentation without changing the product itself."} Do not invent text or watermarks.`;
}

export async function startVendorAiAiImageTool(input: {
  tenantId: string;
  userId?: string | null;
  assetId: string;
  title: string;
  operation: AiImageOperation;
  prompt?: string;
  count?: number;
  size?: VendorAiImageSize;
}) {
  const { asset, buffer } = await resolveSource(input.tenantId, input.assetId);
  const instruction = input.prompt?.trim() ?? "";
  const count = input.operation === "image_variations" ? Math.max(1, Math.min(4, Math.round(input.count ?? 2))) : 1;
  const size: VendorAiImageSize = input.size === "1024x1536" || input.size === "1536x1024" ? input.size : "1024x1024";
  const prompt = buildPrompt(input.operation, instruction);

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
          sourceMimeType: asset.mimeType ?? null,
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
