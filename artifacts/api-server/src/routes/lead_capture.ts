import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  businessProfilesTable,
  db,
  leadCaptureCampaignsTable,
  leadCaptureEventsTable,
  tenantLeadCaptureToolsTable,
} from "@workspace/db";
import { syncTenantLeadCaptureToolsFromExistingCapabilities } from "../services/jarvis-tool-builder.js";

const router: IRouter = Router();

function canAccess(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function normalizeVertical(verticalRaw?: string | null) {
  return (verticalRaw ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function toolMatchesVertical(toolKey: string, verticalRaw?: string | null) {
  const vertical = normalizeVertical(verticalRaw);
  const normalizedKey = toolKey.toLowerCase();

  // Ferramentas explicitamente verticais nunca devem vazar para tenants de outro nicho.
  if (normalizedKey.includes("farmacia") || normalizedKey.includes("pharmacy")) {
    return vertical.includes("farm");
  }

  return true;
}

function suggestedTools(verticalRaw?: string | null) {
  const vertical = normalizeVertical(verticalRaw);
  if (vertical.includes("constr") || vertical.includes("arquitet")) {
    return [
      {
        toolKey: "arqdor.pre_project",
        toolLabel: "Pré-Projeto",
        deliveryType: "pre_project",
        freePolicy: { mode: "uses", limit: 1 },
        metadata: { source: "existing_tool", recommended: true },
      },
    ];
  }
  if (vertical.includes("farm")) {
    return [
      {
        toolKey: "agent.pharmacy",
        toolLabel: "Agente da Farmácia",
        deliveryType: "agent",
        freePolicy: { mode: "session", limit: 1 },
        metadata: { source: "existing_tool", recommended: true },
      },
    ];
  }
  return [];
}

router.get("/tenants/:tenantId/lead-capture", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately validated by canAccess before any tenant-scoped read/write
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Access denied" });

  await syncTenantLeadCaptureToolsFromExistingCapabilities(tenantId);

  const [[profile], tools, campaigns] = await Promise.all([
    db.select({ vertical: businessProfilesTable.vertical }).from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select().from(tenantLeadCaptureToolsTable).where(eq(tenantLeadCaptureToolsTable.tenantId, tenantId)).orderBy(desc(tenantLeadCaptureToolsTable.updatedAt)),
    db.select().from(leadCaptureCampaignsTable).where(eq(leadCaptureCampaignsTable.tenantId, tenantId)).orderBy(desc(leadCaptureCampaignsTable.updatedAt)),
  ]);

  const visibleTools = tools.filter((tool) => toolMatchesVertical(tool.toolKey, profile?.vertical));

  return res.json({
    vertical: profile?.vertical ?? null,
    tools: visibleTools,
    suggestedTools: visibleTools.length ? [] : suggestedTools(profile?.vertical),
    campaigns,
  });
});

router.post("/tenants/:tenantId/lead-capture/sync-tools", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately validated by canAccess before tenant-scoped reads/writes
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Access denied" });

  try {
    const result = await syncTenantLeadCaptureToolsFromExistingCapabilities(tenantId);
    const tools = await db
      .select()
      .from(tenantLeadCaptureToolsTable)
      .where(eq(tenantLeadCaptureToolsTable.tenantId, tenantId))
      .orderBy(desc(tenantLeadCaptureToolsTable.updatedAt));
    return res.json({ ...result, tools });
  } catch (err) {
    req.log?.error({ err, tenantId }, "lead-capture: sync tools failed");
    return res.status(500).json({ error: "Não foi possível sincronizar as ferramentas agora." });
  }
});

router.post("/tenants/:tenantId/lead-capture/tools", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately validated by canAccess before any tenant-scoped read/write
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Access denied" });

  const toolKey = String(req.body?.toolKey ?? "").trim();
  const toolLabel = String(req.body?.toolLabel ?? "").trim();
  if (!toolKey || !toolLabel) return res.status(422).json({ error: "toolKey e toolLabel são obrigatórios" });

  const values = {
    tenantId,
    toolKey,
    toolLabel,
    vertical: typeof req.body?.vertical === "string" ? req.body.vertical : null,
    deliveryType: typeof req.body?.deliveryType === "string" ? req.body.deliveryType : "tool",
    enabled: req.body?.enabled !== false,
    freePolicy: req.body?.freePolicy && typeof req.body.freePolicy === "object" ? req.body.freePolicy : { mode: "uses", limit: 1 },
    metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {},
    updatedAt: new Date(),
  };

  const [saved] = await db.insert(tenantLeadCaptureToolsTable)
    .values(values as any)
    .onConflictDoUpdate({
      target: [tenantLeadCaptureToolsTable.tenantId, tenantLeadCaptureToolsTable.toolKey],
      set: {
        toolLabel: values.toolLabel,
        vertical: values.vertical,
        deliveryType: values.deliveryType,
        enabled: values.enabled,
        freePolicy: values.freePolicy as any,
        metadata: values.metadata,
        updatedAt: new Date(),
      },
    })
    .returning();

  return res.status(201).json(saved);
});

router.patch("/tenants/:tenantId/lead-capture/tools/:toolId", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately validated by canAccess before any tenant-scoped read/write
  const tenantId = String(req.params["tenantId"]);
  const toolId = String(req.params["toolId"]);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Access denied" });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body?.toolLabel === "string") patch.toolLabel = req.body.toolLabel.trim();
  if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
  if (req.body?.freePolicy && typeof req.body.freePolicy === "object") patch.freePolicy = req.body.freePolicy;
  if (req.body?.metadata && typeof req.body.metadata === "object") patch.metadata = req.body.metadata;

  const [updated] = await db.update(tenantLeadCaptureToolsTable)
    .set(patch as any)
    .where(and(eq(tenantLeadCaptureToolsTable.id, toolId), eq(tenantLeadCaptureToolsTable.tenantId, tenantId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Ferramenta não encontrada" });
  return res.json(updated);
});

router.post("/tenants/:tenantId/lead-capture/campaigns", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately validated by canAccess before any tenant-scoped read/write
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Access denied" });

  const name = String(req.body?.name ?? "").trim();
  const magnets = Array.isArray(req.body?.magnets) ? req.body.magnets : [];
  const deliveryToolKeys = Array.isArray(req.body?.deliveryToolKeys)
    ? req.body.deliveryToolKeys.map((v: unknown) => String(v)).filter(Boolean)
    : [];
  if (!name) return res.status(422).json({ error: "Nome da campanha é obrigatório" });
  if (!magnets.length) return res.status(422).json({ error: "Adicione ao menos uma entrada" });
  if (!deliveryToolKeys.length) return res.status(422).json({ error: "Selecione ao menos uma entrega gratuita" });

  const [created] = await db.insert(leadCaptureCampaignsTable).values({
    tenantId,
    name,
    objective: typeof req.body?.objective === "string" ? req.body.objective : null,
    audience: typeof req.body?.audience === "string" ? req.body.audience : null,
    magnets,
    deliveryToolKeys,
    status: typeof req.body?.status === "string" ? req.body.status : "draft",
  } as any).returning();

  return res.status(201).json(created);
});

router.patch("/tenants/:tenantId/lead-capture/campaigns/:campaignId", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately validated by canAccess before any tenant-scoped read/write
  const tenantId = String(req.params["tenantId"]);
  const campaignId = String(req.params["campaignId"]);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Access denied" });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["name", "objective", "audience", "status"] as const) {
    if (typeof req.body?.[key] === "string") patch[key] = req.body[key];
  }
  if (Array.isArray(req.body?.magnets)) patch.magnets = req.body.magnets;
  if (Array.isArray(req.body?.deliveryToolKeys)) patch.deliveryToolKeys = req.body.deliveryToolKeys;

  const [updated] = await db.update(leadCaptureCampaignsTable)
    .set(patch as any)
    .where(and(eq(leadCaptureCampaignsTable.id, campaignId), eq(leadCaptureCampaignsTable.tenantId, tenantId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Campanha não encontrada" });
  return res.json(updated);
});

router.post("/tenants/:tenantId/lead-capture/events", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately validated by canAccess before any tenant-scoped read/write
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Access denied" });
  const eventType = String(req.body?.eventType ?? "").trim();
  if (!eventType) return res.status(422).json({ error: "eventType é obrigatório" });

  const [created] = await db.insert(leadCaptureEventsTable).values({
    tenantId,
    campaignId: typeof req.body?.campaignId === "string" ? req.body.campaignId : null,
    leadId: typeof req.body?.leadId === "string" ? req.body.leadId : null,
    eventType,
    magnetId: typeof req.body?.magnetId === "string" ? req.body.magnetId : null,
    toolKey: typeof req.body?.toolKey === "string" ? req.body.toolKey : null,
    metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {},
  } as any).returning();

  return res.status(201).json(created);
});

export default router;
