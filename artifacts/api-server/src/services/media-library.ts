import { and, eq } from "drizzle-orm";
import {
  db,
  mediaAssetsTable,
  mediaProjectsTable,
  mediaVersionsTable,
} from "@workspace/db";

export interface CreateProcessingProjectInput {
  tenantId: string;
  userId?: string | null;
  title: string;
  operation: string;
  context?: Record<string, unknown>;
}

export interface RegisterMediaOutputInput {
  tenantId: string;
  projectId: string;
  userId?: string | null;
  storageUrl: string;
  mimeType: string;
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
      kind: "video",
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
      type: "video",
      role: "output",
      storageUrl: input.storageUrl,
      mimeType: input.mimeType,
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
