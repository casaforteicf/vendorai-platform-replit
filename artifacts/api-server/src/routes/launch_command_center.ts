import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { getFilteredLaunchCommandCenter } from "../services/launchCommandCenter.js";
import { getLaunchRevenueScout } from "../services/launchRevenueScout.js";
import { buildAssistedMarketingDraft } from "../services/launchMarketingAssistant.js";
import { buildTenantPaidMediaBudgetRedistributionPlan } from "../services/paidMediaBudgetOptimizer.js";
import { executePaidMediaBudgetDecision } from "../services/paidMediaBudgetExecution.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { getMarketingAutonomySettings, updateMarketingAutonomySettings } from "../services/marketingAutonomyConfig.js";
import { getMarketingAutonomyAudit } from "../services/marketingAutonomyAudit.js";

const router: IRouter = Router();

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).optional(),
  platform: z.string().trim().min(1).optional(),
  campaignId: z.string().trim().min(1).optional(),
  landingPageId: z.string().trim().min(1).optional(),
  vertical: z.string().trim().min(1).optional(),
  intentTier: z.enum(["baixo", "medio", "alto", "muito_alto"]).optional(),
});

const assistedDraftSchema = z.object({
  kind: z.enum(["creative", "landing_page", "audience", "keyword"]),
  filters: querySchema.optional(),
});

const autonomySchema = z.object({
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  maxTransferFractionPerCycle: z.number().min(0.01).max(0.5).default(0.2),
});

const autonomyAuditQuerySchema = z.object({
  mediaPlanId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const budgetQuerySchema = z.object({
  maxTransferFractionPerCycle: z.coerce.number().min(0).max(1).optional(),
});

const budgetApplySchema = z.object({
  authorization: z.enum(["human-approved", "agent-autonomous"]).default("human-approved"),
  maxTransferFractionPerCycle: z.number().min(0).max(1).optional(),
});

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}

router.get("/tenants/:tenantId/marketing/launch-command-center", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filtros inválidos", details: parsed.error.issues });
    return;
  }

  const result = await getFilteredLaunchCommandCenter(tenantId, parsed.data);
  res.json(result);
});

router.get("/tenants/:tenantId/marketing/launch-command-center/revenue-scout", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filtros inválidos", details: parsed.error.issues });
    return;
  }

  const result = await getLaunchRevenueScout(tenantId, parsed.data);
  res.json(result);
});

router.get("/tenants/:tenantId/marketing/autonomy", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked by canAccess before tenant data access
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(await getMarketingAutonomySettings(tenantId));
});

router.put("/tenants/:tenantId/marketing/autonomy", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked by canAccess before tenant data access
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = autonomySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: "Configuração de autonomia inválida", details: parsed.error.issues });
    return;
  }
  try {
    const result = await updateMarketingAutonomySettings({ tenantId, ...parsed.data });
    res.json(result);
  } catch (err) {
    req.log.warn({ err, tenantId }, "marketing: falha ao atualizar autonomia");
    res.status(422).json({ error: err instanceof Error ? err.message : "Não foi possível atualizar a autonomia." });
  }
});

router.get("/tenants/:tenantId/marketing/autonomy/audit", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked by canAccess before tenant data access
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = autonomyAuditQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filtros de auditoria inválidos", details: parsed.error.issues });
    return;
  }
  try {
    res.json(await getMarketingAutonomyAudit({
      tenantId,
      mediaPlanId: parsed.data.mediaPlanId,
      limit: parsed.data.limit,
    }));
  } catch (err) {
    req.log.warn({ err, tenantId }, "marketing: falha ao carregar auditoria da autonomia");
    res.status(422).json({ error: err instanceof Error ? err.message : "Não foi possível carregar a auditoria." });
  }
});

router.get("/tenants/:tenantId/marketing/media-plan/:mediaPlanId/budget-redistribution", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked by canAccess before tenant data access
  const tenantId = String(req.params["tenantId"]);
  const mediaPlanId = String(req.params["mediaPlanId"]);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = budgetQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parâmetros inválidos", details: parsed.error.issues });
    return;
  }

  try {
    const plan = await buildTenantPaidMediaBudgetRedistributionPlan(tenantId, mediaPlanId, {
      maxTransferFractionPerCycle: parsed.data.maxTransferFractionPerCycle,
    });
    res.json(plan);
  } catch (err) {
    req.log.warn({ err, tenantId, mediaPlanId }, "marketing: falha ao calcular redistribuição de orçamento");
    res.status(422).json({ error: err instanceof Error ? err.message : "Não foi possível calcular a redistribuição." });
  }
});

router.post("/tenants/:tenantId/marketing/media-plan/:mediaPlanId/budget-redistribution/:campaignId/apply", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked by canAccess before tenant data access
  const tenantId = String(req.params["tenantId"]);
  const mediaPlanId = String(req.params["mediaPlanId"]);
  const campaignId = String(req.params["campaignId"]);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = budgetApplySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitação inválida", details: parsed.error.issues });
    return;
  }

  try {
    const result = await executePaidMediaBudgetDecision({
      tenantId,
      mediaPlanId,
      campaignId,
      authorization: parsed.data.authorization,
      maxTransferFractionPerCycle: parsed.data.maxTransferFractionPerCycle,
    });

    await recordAdCampaignEvent({
      tenantId,
      campaignId,
      userId: (req as any).user?.sub ?? null,
      eventType: result.applied ? "budget_redistribution_applied" : "budget_redistribution_hold",
      severity: result.applied ? "success" : "info",
      message: result.applied
        ? `Redistribuição aplicada: ${result.decision.delta > 0 ? "+" : ""}R$ ${result.decision.delta.toFixed(2)} no orçamento total aprovado.`
        : `Redistribuição não aplicada: ${result.reason}`,
      metadata: {
        mediaPlanId,
        authorization: parsed.data.authorization,
        decision: result.decision,
        schedule: result.applied ? result.schedule : null,
        humanCeilingRespected: result.applied ? result.humanCeilingRespected : result.plan?.humanCeilingRespected ?? null,
      },
    });

    res.json(result);
  } catch (err) {
    req.log.warn({ err, tenantId, mediaPlanId, campaignId }, "marketing: falha ao aplicar redistribuição de orçamento");
    res.status(422).json({ error: err instanceof Error ? err.message : "Não foi possível aplicar a redistribuição." });
  }
});

router.post("/tenants/:tenantId/marketing/launch-command-center/assisted-draft", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = assistedDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitação assistida inválida", details: parsed.error.issues });
    return;
  }

  const result = await buildAssistedMarketingDraft({
    tenantId,
    kind: parsed.data.kind,
    filters: parsed.data.filters,
  });
  res.json(result);
});

export default router;