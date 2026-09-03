import { and, eq } from "drizzle-orm";
import { db, mediaJobsTable } from "@workspace/db";

export type MediaJobStatus = "running" | "done" | "error";

export interface MediaJobResultItem {
  name: string;
  status: "pending" | "generating" | "done" | "error";
  videoUrl?: string;
  error?: string;
}

export interface MediaJobSnapshot {
  status: MediaJobStatus;
  progress?: number;
  total?: number;
  videoUrl?: string;
  clips?: string[];
  results?: MediaJobResultItem[];
  error?: string;
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

function snapshotOutput(snapshot: MediaJobSnapshot): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  if (snapshot.videoUrl !== undefined) output.videoUrl = snapshot.videoUrl;
  if (snapshot.clips !== undefined) output.clips = snapshot.clips;
  if (snapshot.results !== undefined) output.results = snapshot.results;
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

  return {
    status,
    ...(job.progress !== null ? { progress: job.progress } : {}),
    ...(job.total !== null ? { total: job.total } : {}),
    ...(typeof output.videoUrl === "string" ? { videoUrl: output.videoUrl } : {}),
    ...(Array.isArray(output.clips) ? { clips: output.clips.filter((value): value is string => typeof value === "string") } : {}),
    ...(Array.isArray(output.results) ? { results: output.results as MediaJobResultItem[] } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}
