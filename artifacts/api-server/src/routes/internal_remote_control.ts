import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod/v4";
import { db, mediaJobsTable, tenantsTable } from "@workspace/db";
import { createVendorAiMediaGenerationJob } from "../services/vendorai-media-engine.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function requireRemoteControlKey(req: Request, res: Response, next: NextFunction) {
  const configured = process.env["VENDORAI_REMOTE_CONTROL_KEY"]?.trim();
  if (!configured) return res.status(503).json({ error: "remote_control_not_configured" });

  const header = req.header("x-vendorai-remote-key")?.trim() || "";
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const provided = header || bearer;
  if (!provided || !safeEqual(provided, configured)) {
    return res.status(401).json({ error: "invalid_remote_control_key" });
  }
  next();
}

const tenantSelectorSchema = z.object({
  tenantId: z.string().trim().min(1).optional(),
  tenantSlug: z.string().trim().min(1).optional(),
  tenantCode: z.string().trim().min(1).optional(),
}).refine((value) => Boolean(value.tenantId || value.tenantSlug || value.tenantCode), {
  message: "tenantId, tenantSlug ou tenantCode é obrigatório",
});

async function resolveTenant(selector: z.infer<typeof tenantSelectorSchema>) {
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

const generateVideoSchema = tenantSelectorSchema.and(z.object({
  title: z.string().trim().min(3).max(120),
  prompt: z.string().trim().min(10).max(15000),
  aspectRatio: z.enum(["landscape", "portrait", "square"]).default("landscape"),
  duration: z.number().int().min(4).max(60).default(15),
  style: z.string().trim().max(500).optional(),
  generationMode: z.enum(["ai_only", "guided"]).default("ai_only"),
  source: z.string().trim().max(80).default("remote-control"),
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}));

router.get("/internal/remote-control/health", requireRemoteControlKey, (_req, res) => {
  return res.json({
    ok: true,
    service: "vendorai-remote-control",
    capabilities: ["video.generate", "media.job.status"],
  });
});

router.post("/internal/remote-control/media/video/generate", requireRemoteControlKey, async (req, res) => {
  const parsed = generateVideoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: "invalid_command", details: parsed.error.flatten() });
  }

  const tenant = await resolveTenant(parsed.data);
  if (!tenant) return res.status(404).json({ error: "tenant_not_found" });
  if (tenant.status !== "active") return res.status(409).json({ error: "tenant_not_active", status: tenant.status });

  if (parsed.data.idempotencyKey) {
    const candidates = await db.select({
      id: mediaJobsTable.id,
      projectId: mediaJobsTable.projectId,
      status: mediaJobsTable.status,
      output: mediaJobsTable.output,
      error: mediaJobsTable.error,
      input: mediaJobsTable.input,
    }).from(mediaJobsTable).where(and(
      eq(mediaJobsTable.tenantId, tenant.id),
      eq(mediaJobsTable.operation, "video_generate"),
    )).limit(100);

    const existing = candidates.find((candidate) => {
      const input = candidate.input as Record<string, unknown> | undefined;
      return input?.["remoteIdempotencyKey"] === parsed.data.idempotencyKey;
    });
    if (existing) {
      return res.status(200).json({
        accepted: true,
        duplicate: true,
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        projectId: existing.projectId,
        jobId: existing.id,
        status: existing.status,
        output: existing.output,
        error: existing.error,
      });
    }
  }

  const result = await createVendorAiMediaGenerationJob({
    tenantId: tenant.id,
    userId: null,
    title: parsed.data.title,
    operation: "video_generate",
    context: {
      prompt: parsed.data.prompt,
      style: parsed.data.style ?? "premium SaaS technology, photorealistic, polished commercial production",
      aspectRatio: parsed.data.aspectRatio,
      duration: parsed.data.duration,
      generationMode: parsed.data.generationMode,
      mediaInputs: [],
      source: parsed.data.source,
      remoteControl: true,
      remoteRequestedAt: new Date().toISOString(),
      remoteIdempotencyKey: parsed.data.idempotencyKey ?? null,
      ...parsed.data.metadata,
    },
  });

  logger.info({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    jobId: result.jobId,
    projectId: result.projectId,
    source: parsed.data.source,
  }, "Comando remoto de geração de vídeo aceito");

  return res.status(202).json({
    accepted: true,
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, tenantCode: tenant.tenantCode },
    projectId: result.projectId,
    jobId: result.jobId,
    status: "queued",
  });
});

router.get("/internal/remote-control/media/jobs/:tenantId/:jobId", requireRemoteControlKey, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const jobId = String(req.params.jobId);
  const [job] = await db.select().from(mediaJobsTable).where(and(
    eq(mediaJobsTable.id, jobId),
    eq(mediaJobsTable.tenantId, tenantId),
  )).limit(1);
  if (!job) return res.status(404).json({ error: "job_not_found" });
  return res.json({ job });
});

export default router;
