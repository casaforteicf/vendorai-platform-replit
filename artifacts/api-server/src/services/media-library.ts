import { and, eq } from "drizzle-orm";
import {
  db,
  mediaAssetsTable,
  mediaProjectsTable,
  mediaVersionsTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";

const generatedMediaStorage = new ObjectStorageService();

export interface CreateProcessingProjectInput {
  tenantId: string;
  userId?: string | null;
  title: string;
  operation: string;
  context?: Record<string, unknown>;
  kind?: string;
}

export interface RegisterMediaOutputInput {
  tenantId: string;
  projectId: string;
  userId?: string | null;
  storageUrl: string;
  mimeType: string;
  fileSize?: number | null;
  type?: "video" | "audio" | "image" | "document";
  originalFilename?: string | null;
  operation: string;
  label?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createProcessingMediaProject(
  input: CreateProcessingProjectInput,
): Promise<string> {
  const [project] = await db
    .insert(mediaProjectsTable)
    .values({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      title: input.title,
      kind: input.kind ?? "video",
      status: "processing",
      source: "content_studio",
      context: {
        operation: input.operation,
        ...(input.context ?? {}),
      },
      updatedAt: new Date(),
    })
    .returning({ id: mediaProjectsTable.id });

  if (!project) throw new Error("Falha ao criar projeto de mídia");
  return project.id;
}

export async function registerGeneratedMediaOutput(
  input: RegisterMediaOutputInput,
): Promise<{ assetId: string; versionId: string }> {
  const [asset] = await db
    .insert(mediaAssetsTable)
    .values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      userId: input.userId ?? null,
      type: input.type ?? "video",
      role: "output",
      storageUrl: input.storageUrl,
      mimeType: input.mimeType,
      fileSize: input.fileSize ?? null,
      originalFilename: input.originalFilename ?? null,
      source: "generated",
      metadata: input.metadata ?? {},
    })
    .returning({ id: mediaAssetsTable.id });

  if (!asset) throw new Error("Falha ao registrar ativo de mídia");

  const [version] = await db
    .insert(mediaVersionsTable)
    .values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      assetId: asset.id,
      operation: input.operation,
      label: input.label ?? null,
      metadata: input.metadata ?? {},
    })
    .returning({ id: mediaVersionsTable.id });

  if (!version) throw new Error("Falha ao registrar versão de mídia");

  await db
    .update(mediaProjectsTable)
    .set({ status: "ready", updatedAt: new Date() })
    .where(
      and(
        eq(mediaProjectsTable.id, input.projectId),
        eq(mediaProjectsTable.tenantId, input.tenantId),
      ),
    );

  return { assetId: asset.id, versionId: version.id };
}

export async function setMediaProjectStatus(
  tenantId: string,
  projectId: string,
  status: "draft" | "processing" | "ready" | "archived",
): Promise<void> {
  await db
    .update(mediaProjectsTable)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(mediaProjectsTable.id, projectId),
        eq(mediaProjectsTable.tenantId, tenantId),
      ),
    );
}


export interface CaptureGeneratedMediaInput {
  tenantId: string;
  userId?: string | null;
  projectId?: string | null;
  title: string;
  operation: string;
  buffer: Buffer;
  mimeType: string;
  type?: "video" | "audio" | "image" | "document";
  originalFilename?: string | null;
  kind?: string;
  label?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Regra global do VendorAI: toda saída de mídia gerada deve ser persistida
 * no Object Storage e registrada na Biblioteca de Mídias do tenant.
 *
 * Callers may reuse an existing media project; otherwise a lightweight
 * project is created automatically so the asset also has version history.
 */
export async function captureGeneratedMedia(
  input: CaptureGeneratedMediaInput,
): Promise<{ projectId: string; assetId: string; versionId: string; storageUrl: string }> {
  const projectId = input.projectId ?? await createProcessingMediaProject({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    title: input.title,
    operation: input.operation,
    kind: input.kind ?? (input.type === "audio" ? "audio" : input.type === "video" ? "video" : "mixed"),
    context: {
      generatedMediaCapture: true,
      ...(input.metadata ?? {}),
    },
  });

  const fallbackExtension = input.type === "video"
    ? "mp4"
    : input.type === "audio"
      ? "mp3"
      : input.type === "document"
        ? "bin"
        : input.mimeType.includes("jpeg")
          ? "jpg"
          : input.mimeType.includes("webp")
            ? "webp"
            : "png";
  const filename = input.originalFilename?.trim()
    || `${input.operation}-${Date.now()}.${fallbackExtension}`;

  const storageUrl = await generatedMediaStorage.savePrivateBuffer(
    input.buffer,
    input.mimeType,
    filename,
  );

  const registered = await registerGeneratedMediaOutput({
    tenantId: input.tenantId,
    projectId,
    userId: input.userId ?? null,
    storageUrl,
    mimeType: input.mimeType,
    fileSize: input.buffer.length,
    type: input.type ?? "image",
    originalFilename: filename,
    operation: input.operation,
    label: input.label ?? input.title,
    metadata: {
      generatedMediaCapture: true,
      ...(input.metadata ?? {}),
    },
  });

  return {
    projectId,
    assetId: registered.assetId,
    versionId: registered.versionId,
    storageUrl,
  };
}
