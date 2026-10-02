import { and, eq } from "drizzle-orm";
import { db, mediaJobsTable } from "@workspace/db";

export type MediaJobStatus = "running" | "done" | "error";

export interface MediaJobResultItem {
  name?: string;
  status: "pending" | "generating" | "done" | "error";
  videoUrl?: string;
  error?: string;
  [key: string]: unknown;
}

export interface MediaJobSnapshot {
  status: MediaJobStatus;
  progress?: number;
  total?: number;
  videoUrl?: string;
  audioUrl?: string;
  clips?: string[];
  results?: MediaJobResultItem[];
  error?: string;
  [key: string]: unknown;
}

export interface CreateMediaJobInput {
  id: string;
  tenantId: string;
  operation: string;
  provider?: string;
  projectId?: string | null;
  providerJobId?: string | null;
  input?: Record<string, unknown>;
  snapshot?: MediaJobSnapshot;
}

const SNAPSHOT_CONTROL_FIELDS = new Set(["status", "progress", "total", "error"]);

function snapshotOutput(snapshot: MediaJobSnapshot): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (SNAPSHOT_CONTROL_FIELDS.has(key) || value === undefined) continue;
    output[key] = value;
  }
  return output;
}

export async function createMediaJob(input: CreateMediaJobInput): Promise<void> {
  const snapshot = input.snapshot ?? { status: "running" };
  await db.insert(mediaJobsTable).values({
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId ?? null,
    operation: input.operation,
    provider: input.provider ?? "vendorai",
    providerJobId: input.providerJobId ?? null,
    status: snapshot.status,
    progress: snapshot.progress ?? null,
    total: snapshot.total ?? null,
    input: input.input ?? {},
    output: snapshotOutput(snapshot),
    error: snapshot.error ?? null,
    startedAt: new Date(),
    completedAt: snapshot.status === "running" ? null : new Date(),
    updatedAt: new Date(),
  });
}

export async function updateMediaJob(
  jobId: string,
  tenantId: string,
  snapshot: MediaJobSnapshot,
): Promise<void> {
  await db
    .update(mediaJobsTable)
    .set({
      status: snapshot.status,
      progress: snapshot.progress ?? null,
      total: snapshot.total ?? null,
      output: snapshotOutput(snapshot),
      error: snapshot.error ?? null,
      completedAt: snapshot.status === "running" ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(mediaJobsTable.id, jobId), eq(mediaJobsTable.tenantId, tenantId)));
}

export async function getMediaJob(
  jobId: string,
  tenantId: string,
): Promise<MediaJobSnapshot | null> {
  const [job] = await db
    .select({
      status: mediaJobsTable.status,
      progress: mediaJobsTable.progress,
      total: mediaJobsTable.total,
      output: mediaJobsTable.output,
      error: mediaJobsTable.error,
    })
    .from(mediaJobsTable)
    .where(and(eq(mediaJobsTable.id, jobId), eq(mediaJobsTable.tenantId, tenantId)))
    .limit(1);

  if (!job) return null;

  const output = (job.output ?? {}) as Record<string, unknown>;
  const status: MediaJobStatus = job.status === "done" || job.status === "error" ? job.status : "running";
  const snapshot: MediaJobSnapshot = {
    status,
    ...output,
  };

  if (job.progress !== null) snapshot.progress = job.progress;
  if (job.total !== null) snapshot.total = job.total;
  if (job.error) snapshot.error = job.error;

  return snapshot;
}
