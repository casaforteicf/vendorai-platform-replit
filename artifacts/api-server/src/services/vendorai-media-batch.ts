import { randomUUID } from "crypto";
import { createMediaJob, updateMediaJob, type MediaJobResultItem } from "./media-jobs.js";
import { createProcessingMediaProject, setMediaProjectStatus } from "./media-library.js";
import {
  processVendorAiImageTool,
  type NativeImageToolOptions,
  type VendorAiNativeImageOperation,
} from "./vendorai-image-tools.js";

export interface MediaBatchItem {
  assetId: string;
  operation: VendorAiNativeImageOperation;
  options?: NativeImageToolOptions;
}

export class MediaBatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaBatchValidationError";
  }
}

const ALLOWED_OPERATIONS = new Set<VendorAiNativeImageOperation>([
  "image_resize",
  "image_crop",
  "image_optimize",
  "image_enhance",
  "image_convert",
]);

export async function startVendorAiMediaBatch(input: {
  tenantId: string;
  userId?: string | null;
  title: string;
  items: MediaBatchItem[];
}) {
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) {
    throw new MediaBatchValidationError("O lote deve conter de 1 a 30 itens");
  }
  for (const item of input.items) {
    if (!item.assetId?.trim() || !ALLOWED_OPERATIONS.has(item.operation)) {
      throw new MediaBatchValidationError("Cada item precisa de assetId e operação nativa válida");
    }
  }

  const projectId = await createProcessingMediaProject({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title,
    operation: "media_batch",
    context: {
      engine: "vendorai",
      native: true,
      itemCount: input.items.length,
      operations: [...new Set(input.items.map((item) => item.operation))],
    },
  });
  const jobId = randomUUID();
  await createMediaJob({
    id: jobId,
    tenantId: input.tenantId,
    projectId,
    operation: "media_batch",
    provider: "vendorai",
    input: {
      title: input.title,
      itemCount: input.items.length,
      userId: input.userId ?? null,
    },
    snapshot: { status: "running", progress: 0 },
  });

  void (async () => {
    const results: Array<MediaJobResultItem & {
      index: number; sourceAssetId: string; operation: VendorAiNativeImageOperation;
      projectId?: string; assetId?: string; versionId?: string; storageUrl?: string;
    }> = [];
    let successCount = 0;
    let failureCount = 0;

    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index]!;
      try {
        const output = await processVendorAiImageTool({
          tenantId: input.tenantId,
          userId: input.userId ?? null,
          assetId: item.assetId,
          title: `${input.title} — ${index + 1}`,
          operation: item.operation,
          options: item.options,
        });
        successCount += 1;
        results.push({
          name: `${input.title} — ${index + 1}`,
          index,
          sourceAssetId: item.assetId,
          operation: item.operation,
          status: "done",
          projectId: output.projectId,
          assetId: output.assetId,
          versionId: output.versionId,
          storageUrl: output.storageUrl,
        });
      } catch (error) {
        failureCount += 1;
        results.push({
          name: `${input.title} — ${index + 1}`,
          index,
          sourceAssetId: item.assetId,
          operation: item.operation,
          status: "error",
          error: error instanceof Error ? error.message : "Falha no item do lote",
        });
      }

      const progress = Math.round(((index + 1) / input.items.length) * 95);
      await updateMediaJob(jobId, input.tenantId, {
        status: "running",
        progress,
        successCount,
        failureCount,
        results,
      }).catch(() => undefined);
    }

    if (successCount === 0) {
      await setMediaProjectStatus(input.tenantId, projectId, "draft").catch(() => undefined);
      await updateMediaJob(jobId, input.tenantId, {
        status: "error",
        error: "Nenhum item do lote foi processado com sucesso",
        progress: 100,
        successCount,
        failureCount,
        results,
      }).catch(() => undefined);
      return;
    }

    await setMediaProjectStatus(input.tenantId, projectId, "ready").catch(() => undefined);
    await updateMediaJob(jobId, input.tenantId, {
      status: "done",
      progress: 100,
      successCount,
      failureCount,
      partial: failureCount > 0,
      results,
    }).catch(() => undefined);
  })();

  return { projectId, jobId, operation: "media_batch" as const, provider: "vendorai" as const };
}
