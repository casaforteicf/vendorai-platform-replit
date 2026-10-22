import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod/v4";
import { agentActionsLogTable, db, mediaJobsTable, tenantsTable } from "@workspace/db";
import { createVendorAiMediaGenerationJob } from "../services/vendorai-media-engine.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

type TenantRef = {
  id: string;
  name: string;
  slug: string;
  tenantCode: string;
  status: "active" | "suspended" | "cancelled";
};

const COMMANDS = {
  "media.video.generate": {
    description: "Gera um vídeo no motor nativo de mídia do Vendor.ai.",
    mutating: true,
    approval: "caller",
  },
  "media.job.status": {
    description: "Consulta o estado e a saída de um job de mídia do tenant.",
    mutating: false,
    approval: "none",
  },
} as const;

type RemoteCommandName = keyof typeof COMMANDS;

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function requireRemoteControlKey(req: Request, res: Response, next: NextFunction) {
  const configured = process.env["VENDORAI_REMOTE_CONTROL_KEY"]?.trim();
  if (!configured) { res.status(503).json({ error: "remote_control_not_configured" }); return; }

  const header = req.header("x-vendorai-remote-key")?.trim() || "";
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const provided = header || bearer;
  if (!provided || !safeEqual(provided, configured)) {
    res.status(401).json({ error: "invalid_remote_control_key" }); return;
  }
  next();
}

const tenantSelectorShape = {
  tenantId: z.string().trim().min(1).optional(),
  tenantSlug: z.string().trim().min(1).optional(),
  tenantCode: z.string().trim().min(1).optional(),
};

const tenantSelectorSchema = z.object(tenantSelectorShape).refine(
  (value) => Boolean(value.tenantId || value.tenantSlug || value.tenantCode),
  { message: "tenantId, tenantSlug ou tenantCode é obrigatório" },
);

async function resolveTenant(selector: z.infer<typeof tenantSelectorSchema>): Promise<TenantRef | null> {
  const conditions = [];
  if (selector.tenantId) conditions.push(eq(tenantsTable.id, selector.tenantId));
  if (selector.tenantSlug) conditions.push(eq(tenantsTable.slug, selector.tenantSlug));
  if (selector.tenantCode) conditions.push(eq(tenantsTable.tenantCode, selector.tenantCode));

  const [tenant] = await db.select({
    id: tenantsTable.id,
    name: tenantsTable.name,
    slug: tenantsTable.slug,
    tenantCode: tenantsTable.tenantCode,
    status: tenantsTable.status,
  }).from(tenantsTable).where(or(...conditions)).limit(1);

  return tenant ?? null;
}

async function auditRemoteCommand(input: {
  tenantId: string;
  command: string;
  status: "executed" | "rejected";
  requestId?: string | null;
  payload?: Record<string, unknown>;
}) {
  await db.insert(agentActionsLogTable).values({
    tenantId: input.tenantId,
    leadId: null,
    agentName: "remote-control-api",
    actionType: input.command,
    status: input.status,
    payload: {
      requestId: input.requestId ?? null,
      source: "remote-control",
      ...(input.payload ?? {}),
    },
  }).catch((error) => {
    logger.warn({ error, tenantId: input.tenantId, command: input.command }, "Falha ao registrar auditoria do comando remoto");
  });
}

const videoParametersSchema = z.object({
  title: z.string().trim().min(3).max(120),
  prompt: z.string().trim().min(10).max(15000),
  aspectRatio: z.enum(["landscape", "portrait", "square"]).default("landscape"),
  duration: z.number().int().min(4).max(60).default(15),
  style: z.string().trim().max(500).optional(),
  generationMode: z.enum(["ai_only", "guided"]).default("ai_only"),
  source: z.string().trim().max(80).default("remote-control"),
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const generateVideoSchema = tenantSelectorSchema.and(videoParametersSchema);

const centralCommandSchema = z.object({
  ...tenantSelectorShape,
  command: z.enum(["media.video.generate", "media.job.status"]),
  requestId: z.string().trim().min(8).max(160).optional(),
  parameters: z.record(z.string(), z.unknown()).default({}),
}).refine(
  (value) => Boolean(value.tenantId || value.tenantSlug || value.tenantCode),
  { message: "tenantId, tenantSlug ou tenantCode é obrigatório" },
);

async function findDuplicateVideoJob(tenantId: string, idempotencyKey: string) {
  const candidates = await db.select({
    id: mediaJobsTable.id,
    projectId: mediaJobsTable.projectId,
    status: mediaJobsTable.status,
    output: mediaJobsTable.output,
    error: mediaJobsTable.error,
    input: mediaJobsTable.input,
  }).from(mediaJobsTable).where(and(
    eq(mediaJobsTable.tenantId, tenantId),
    eq(mediaJobsTable.operation, "video_generate"),
  )).limit(100);

  return candidates.find((candidate) => {
    const input = candidate.input as Record<string, unknown> | undefined;
    return input?.["remoteIdempotencyKey"] === idempotencyKey
      || input?.["remoteCommandId"] === idempotencyKey;
  }) ?? null;
}

async function generateVideo(tenant: TenantRef, input: z.infer<typeof videoParametersSchema>, requestId?: string) {
  const idempotencyKey = input.idempotencyKey ?? requestId;
  if (idempotencyKey) {
    const existing = await findDuplicateVideoJob(tenant.id, idempotencyKey);
    if (existing) {
      return {
        accepted: true,
        duplicate: true,
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, tenantCode: tenant.tenantCode },
        projectId: existing.projectId,
        jobId: existing.id,
        status: existing.status,
        output: existing.output,
        error: existing.error,
      };
    }
  }

  const result = await createVendorAiMediaGenerationJob({
    tenantId: tenant.id,
    userId: null,
    title: input.title,
    operation: "video_generate",
    context: {
      prompt: input.prompt,
      style: input.style ?? "premium SaaS technology, photorealistic, polished commercial production",
      aspectRatio: input.aspectRatio,
      duration: input.duration,
      generationMode: input.generationMode,
      mediaInputs: [],
      source: input.source,
      remoteControl: true,
      remoteRequestedAt: new Date().toISOString(),
      remoteIdempotencyKey: idempotencyKey ?? null,
      remoteCommandId: requestId ?? null,
      ...(input.metadata ?? {}),
    },
  });

  logger.info({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    jobId: result.jobId,
    projectId: result.projectId,
    source: input.source,
    requestId: requestId ?? null,
  }, "Comando remoto de geração de vídeo aceito");

  return {
    accepted: true,
    duplicate: false,
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, tenantCode: tenant.tenantCode },
    projectId: result.projectId,
    jobId: result.jobId,
    status: "queued",
  };
}

async function jobStatus(tenantId: string, jobId: string) {
  const [job] = await db.select().from(mediaJobsTable).where(and(
    eq(mediaJobsTable.id, jobId),
    eq(mediaJobsTable.tenantId, tenantId),
  )).limit(1);
  return job ?? null;
}

router.get("/internal/remote-control/health", requireRemoteControlKey, (_req, res) => {
  return res.json({
    ok: true,
    service: "vendorai-remote-control",
    capabilities: Object.keys(COMMANDS),
    commandEndpoint: "/internal/remote-control/commands",
  });
});

router.get("/internal/remote-control/commands", requireRemoteControlKey, (_req, res) => {
  return res.json({
    commands: Object.entries(COMMANDS).map(([name, config]) => ({ name, ...config })),
  });
});

router.post("/internal/remote-control/commands", requireRemoteControlKey, async (req, res) => {
  const parsed = centralCommandSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: "invalid_command", details: parsed.error.flatten() });
  }

  const tenant = await resolveTenant(parsed.data);
  if (!tenant) return res.status(404).json({ error: "tenant_not_found" });
  if (tenant.status !== "active") {
    await auditRemoteCommand({
      tenantId: tenant.id,
      command: parsed.data.command,
      status: "rejected",
      requestId: parsed.data.requestId,
      payload: { reason: "tenant_not_active", tenantStatus: tenant.status },
    });
    return res.status(409).json({ error: "tenant_not_active", status: tenant.status });
  }

  const command = parsed.data.command as RemoteCommandName;
  try {
    if (command === "media.video.generate") {
      const parameters = videoParametersSchema.safeParse(parsed.data.parameters);
      if (!parameters.success) {
        await auditRemoteCommand({
          tenantId: tenant.id,
          command,
          status: "rejected",
          requestId: parsed.data.requestId,
          payload: { reason: "invalid_parameters" },
        });
        return res.status(422).json({ error: "invalid_parameters", details: parameters.error.flatten() });
      }

      const result = await generateVideo(tenant, parameters.data, parsed.data.requestId);
      await auditRemoteCommand({
        tenantId: tenant.id,
        command,
        status: "executed",
        requestId: parsed.data.requestId,
        payload: { jobId: result.jobId, projectId: result.projectId, duplicate: result.duplicate },
      });
      return res.status(result.duplicate ? 200 : 202).json({ command, requestId: parsed.data.requestId ?? null, result });
    }

    if (command === "media.job.status") {
      const parameters = z.object({ jobId: z.string().trim().min(1) }).safeParse(parsed.data.parameters);
      if (!parameters.success) {
        return res.status(422).json({ error: "invalid_parameters", details: parameters.error.flatten() });
      }
      const job = await jobStatus(tenant.id, parameters.data.jobId);
      if (!job) return res.status(404).json({ error: "job_not_found" });
      await auditRemoteCommand({
        tenantId: tenant.id,
        command,
        status: "executed",
        requestId: parsed.data.requestId,
        payload: { jobId: job.id, jobStatus: job.status },
      });
      return res.json({ command, requestId: parsed.data.requestId ?? null, result: { job } });
    }

    return res.status(404).json({ error: "command_not_supported" });
  } catch (error) {
    await auditRemoteCommand({
      tenantId: tenant.id,
      command,
      status: "rejected",
      requestId: parsed.data.requestId,
      payload: { reason: error instanceof Error ? error.message.slice(0, 300) : "command_failed" },
    });
    logger.error({ error, tenantId: tenant.id, command, requestId: parsed.data.requestId }, "Comando remoto falhou");
    return res.status(500).json({ error: "remote_command_failed", command });
  }
});

router.post("/internal/remote-control/media/video/generate", requireRemoteControlKey, async (req, res) => {
  const parsed = generateVideoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: "invalid_command", details: parsed.error.flatten() });
  }

  const tenant = await resolveTenant(parsed.data);
  if (!tenant) return res.status(404).json({ error: "tenant_not_found" });
  if (tenant.status !== "active") return res.status(409).json({ error: "tenant_not_active", status: tenant.status });

  const result = await generateVideo(tenant, parsed.data, parsed.data.idempotencyKey);
  await auditRemoteCommand({
    tenantId: tenant.id,
    command: "media.video.generate",
    status: "executed",
    requestId: parsed.data.idempotencyKey,
    payload: { jobId: result.jobId, projectId: result.projectId, duplicate: result.duplicate, legacyEndpoint: true },
  });
  return res.status(result.duplicate ? 200 : 202).json(result);
});

router.get("/internal/remote-control/media/jobs/:tenantId/:jobId", requireRemoteControlKey, async (req, res) => { // tenant-audit: reviewed internal-key guarded and DB query remains tenant-scoped
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed internal-key guarded and DB query remains tenant-scoped
  const jobId = String(req.params.jobId);
  const job = await jobStatus(tenantId, jobId);
  if (!job) return res.status(404).json({ error: "job_not_found" });
  return res.json({ job });
});

export default router;
