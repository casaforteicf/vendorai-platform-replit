import { and, eq, or, sql } from "drizzle-orm";
import { agentActionsLogTable, db, mediaJobsTable, tenantsTable } from "@workspace/db";
import { createVendorAiMediaGenerationJob } from "./vendorai-media-engine.js";
import { logger } from "../lib/logger.js";

type BootstrapCommand = {
  command: "media.video.generate";
  requestId: string;
  tenantId?: string;
  tenantSlug?: string;
  tenantCode?: string;
  parameters: {
    title: string;
    prompt: string;
    aspectRatio?: "landscape" | "portrait" | "square";
    duration?: number;
    style?: string;
    generationMode?: "ai_only" | "guided";
    source?: string;
    metadata?: Record<string, unknown>;
  };
};

let started = false;

async function alreadyExecuted(requestId: string) {
  const [existingJob] = await db.select({ id: mediaJobsTable.id })
    .from(mediaJobsTable)
    .where(and(
      eq(mediaJobsTable.operation, "video_generate"),
      sql`${mediaJobsTable.input}->>'remoteCommandId' = ${requestId}`,
    ))
    .limit(1);
  return existingJob ?? null;
}

async function resolveTenant(command: BootstrapCommand) {
  const conditions = [];
  if (command.tenantId) conditions.push(eq(tenantsTable.id, command.tenantId));
  if (command.tenantSlug) conditions.push(eq(tenantsTable.slug, command.tenantSlug));
  if (command.tenantCode) conditions.push(eq(tenantsTable.tenantCode, command.tenantCode));
  if (conditions.length === 0) throw new Error("bootstrap_tenant_selector_required");

  const [tenant] = await db.select({
    id: tenantsTable.id,
    name: tenantsTable.name,
    slug: tenantsTable.slug,
    tenantCode: tenantsTable.tenantCode,
    status: tenantsTable.status,
  }).from(tenantsTable).where(or(...conditions)).limit(1);

  if (!tenant) throw new Error("bootstrap_tenant_not_found");
  if (tenant.status !== "active") throw new Error(`bootstrap_tenant_not_active:${tenant.status}`);
  return tenant;
}

async function audit(
  tenantId: string,
  command: BootstrapCommand,
  status: "executed" | "rejected",
  payload: Record<string, unknown>,
) {
  await db.insert(agentActionsLogTable).values({
    tenantId,
    leadId: null,
    agentName: "internal-command-bootstrap",
    actionType: command.command,
    status,
    payload: {
      requestId: command.requestId,
      source: "railway-bootstrap",
      ...payload,
    },
  });
}

async function executeBootstrapCommand(command: BootstrapCommand) {
  if (command.command !== "media.video.generate") throw new Error("bootstrap_command_not_supported");
  if (!command.requestId || command.requestId.length < 8) throw new Error("bootstrap_request_id_invalid");

  const duplicate = await alreadyExecuted(command.requestId);
  if (duplicate) {
    logger.info({ requestId: command.requestId, jobId: duplicate.id }, "Bootstrap command already executed; skipping");
    return;
  }

  const tenant = await resolveTenant(command);
  const p = command.parameters;
  if (!p?.title || !p?.prompt) throw new Error("bootstrap_video_parameters_invalid");

  try {
    const result = await createVendorAiMediaGenerationJob({
      tenantId: tenant.id,
      userId: null,
      title: p.title,
      operation: "video_generate",
      context: {
        prompt: p.prompt,
        style: p.style ?? "premium SaaS technology, photorealistic, polished commercial production",
        aspectRatio: p.aspectRatio ?? "landscape",
        duration: Math.max(4, Math.min(60, Math.round(p.duration ?? 15))),
        generationMode: p.generationMode ?? "ai_only",
        mediaInputs: [],
        source: p.source ?? "internal-command-bootstrap",
        remoteControl: true,
        remoteRequestedAt: new Date().toISOString(),
        remoteCommandId: command.requestId,
        remoteIdempotencyKey: command.requestId,
        bootstrapCommand: true,
        ...(p.metadata ?? {}),
      },
    });

    await audit(tenant.id, command, "executed", {
      jobId: result.jobId,
      projectId: result.projectId,
      tenantSlug: tenant.slug,
    });

    logger.info({
      requestId: command.requestId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      jobId: result.jobId,
      projectId: result.projectId,
    }, "Internal bootstrap command executed");
  } catch (error) {
    await audit(tenant.id, command, "rejected", {
      reason: error instanceof Error ? error.message.slice(0, 300) : String(error),
    }).catch(() => undefined);
    throw error;
  }
}

export function startInternalCommandBootstrap() {
  if (started) return;
  started = true;

  const raw = process.env["VENDORAI_INTERNAL_COMMAND_JSON"]?.trim();
  if (!raw) return;

  setTimeout(() => {
    let command: BootstrapCommand;
    try {
      command = JSON.parse(raw) as BootstrapCommand;
    } catch (error) {
      logger.error({ error }, "Invalid VENDORAI_INTERNAL_COMMAND_JSON");
      return;
    }

    void executeBootstrapCommand(command).catch((error) => {
      logger.error(
        { error, requestId: command.requestId, command: command.command },
        "Internal bootstrap command failed",
      );
    });
  }, 3000).unref?.();
}
