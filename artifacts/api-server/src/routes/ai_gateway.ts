import { Router, type IRouter } from "express";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import {
  db,
  tenantsTable,
  plansTable,
  aiUsageLogsTable,
  tokenPurchasesTable,
} from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { encrypt } from "../lib/crypto.js";
import { estimateCost, checkQuota, logUsage, AiGatewayError } from "../lib/ai-gateway.js";

const router: IRouter = Router();

// ── POST /api/tenants/:tenantId/ai-keys/anthropic ──────────────────────
// Configure tenant's own Anthropic API key (BYOK)
router.post("/tenants/:tenantId/ai-keys/anthropic", authenticate, async (req, res) => {
  const tenantId = req.params.tenantId;
  const { apiKey } = req.body as { apiKey?: string };

  if (!apiKey || !apiKey.startsWith("sk-")) {
    return res.status(400).json({ error: "Invalid Anthropic API key format" });
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    return res.status(403).json({ error: "Access denied" });
  }

  const encrypted = encrypt(apiKey);
  await db
    .update(tenantsTable)
    .set({
      anthropicApiKeyEncrypted: encrypted,
      anthropicKeyConfiguredAt: new Date(),
      anthropicKeyStatus: "ativo",
      updatedAt: new Date(),
    })
    .where(eq(tenantsTable.id, tenantId as string));

  return res.json({ success: true, message: "Anthropic API key configured" });
});

// ── DELETE /api/tenants/:tenantId/ai-keys/anthropic ────────────────────
// Remove tenant's Anthropic API key
router.delete("/tenants/:tenantId/ai-keys/anthropic", authenticate, async (req, res) => {
  const tenantId = req.params.tenantId;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    return res.status(403).json({ error: "Access denied" });
  }

  await db
    .update(tenantsTable)
    .set({
      anthropicApiKeyEncrypted: null,
      anthropicKeyConfiguredAt: null,
      anthropicKeyStatus: "nao_configurada",
      updatedAt: new Date(),
    })
    .where(eq(tenantsTable.id, tenantId as string));

  return res.json({ success: true, message: "Anthropic API key removed" });
});

// ── GET /api/tenants/:tenantId/ai-usage ───────────────────────────────
// Tenant's own AI usage dashboard
router.get("/tenants/:tenantId/ai-usage", authenticate, async (req, res) => {
  const tenantId = req.params.tenantId;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    return res.status(403).json({ error: "Access denied" });
  }

  const [tenant] = await db
    .select({
      planId: tenantsTable.planId,
      aiCreditsUsd: tenantsTable.aiCreditsUsd,
      aiDailySpendUsd: tenantsTable.aiDailySpendUsd,
      aiDailySpendResetAt: tenantsTable.aiDailySpendResetAt,
      openaiKeyStatus: tenantsTable.openaiKeyStatus,
      anthropicKeyStatus: tenantsTable.anthropicKeyStatus,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId as string))
    .limit(1);

  if (!tenant) {
    return res.status(404).json({ error: "Tenant not found" });
  }

  // Get plan quota
  let quotaUsd: number | null = null;
  if (tenant.planId) {
    const [plan] = await db
      .select({ aiQuotaUsd: plansTable.aiQuotaUsd })
      .from(plansTable)
      .where(eq(plansTable.id, tenant.planId))
      .limit(1);
    quotaUsd = plan?.aiQuotaUsd ? Number(plan.aiQuotaUsd) : null;
  }

  // Monthly spend
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [monthlyRow] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)` })
    .from(aiUsageLogsTable)
    .where(
      and(
        eq(aiUsageLogsTable.tenantId, tenantId as string),
        gte(aiUsageLogsTable.createdAt, startOfMonth),
      ),
    );
  const spentThisMonthUsd = Number(monthlyRow?.total ?? 0);

  // Feature breakdown
  const featureRows = await db
    .select({
      feature: aiUsageLogsTable.feature,
      total: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
      calls: sql<number>`count(*)`,
    })
    .from(aiUsageLogsTable)
    .where(
      and(
        eq(aiUsageLogsTable.tenantId, tenantId as string),
        gte(aiUsageLogsTable.createdAt, startOfMonth),
      ),
    )
    .groupBy(aiUsageLogsTable.feature);

  // Recent logs
  const recentLogs = await db
    .select()
    .from(aiUsageLogsTable)
    .where(eq(aiUsageLogsTable.tenantId, tenantId as string))
    .orderBy(desc(aiUsageLogsTable.createdAt))
    .limit(50);

  return res.json({
    quotaUsd,
    creditsUsd: Number(tenant.aiCreditsUsd ?? 0),
    spentThisMonthUsd,
    remainingUsd: (quotaUsd ?? 0) + Number(tenant.aiCreditsUsd ?? 0) - spentThisMonthUsd,
    dailySpendUsd: Number(tenant.aiDailySpendUsd ?? 0),
    dailySpendResetAt: tenant.aiDailySpendResetAt,
    byok: {
      openai: tenant.openaiKeyStatus === "ativo",
      anthropic: tenant.anthropicKeyStatus === "ativo",
    },
    featureBreakdown: featureRows,
    recentLogs,
  });
});

// ── GET /api/admin/ai-usage ───────────────────────────────────────────
// Super Admin aggregate AI usage
router.get("/admin/ai-usage", authenticate, requireRole("super_admin"), async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Total usage this month
  const [totalRow] = await db
    .select({
      totalCost: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
      totalCalls: sql<number>`count(*)`,
    })
    .from(aiUsageLogsTable)
    .where(gte(aiUsageLogsTable.createdAt, startOfMonth));

  // Per-tenant usage
  const tenantRows = await db
    .select({
      tenantId: aiUsageLogsTable.tenantId,
      totalCost: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
      totalCalls: sql<number>`count(*)`,
      byokCalls: sql<number>`count(*) filter (where ${aiUsageLogsTable.usedByok} = true)`,
    })
    .from(aiUsageLogsTable)
    .where(gte(aiUsageLogsTable.createdAt, startOfMonth))
    .groupBy(aiUsageLogsTable.tenantId);

  // Per-feature usage
  const featureRows = await db
    .select({
      feature: aiUsageLogsTable.feature,
      totalCost: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
      totalCalls: sql<number>`count(*)`,
    })
    .from(aiUsageLogsTable)
    .where(gte(aiUsageLogsTable.createdAt, startOfMonth))
    .groupBy(aiUsageLogsTable.feature);

  return res.json({
    totalCostUsd: Number(totalRow?.totalCost ?? 0),
    totalCalls: Number(totalRow?.totalCalls ?? 0),
    tenantBreakdown: tenantRows,
    featureBreakdown: featureRows,
  });
});

// ── POST /api/webhooks/asaas/credits ──────────────────────────────────
// Asaas webhook for credit purchase confirmation
router.post("/webhooks/asaas/credits", async (req, res) => {
  // TODO: validate Asaas webhook signature
  const event = req.body as {
    event?: string;
    payment?: { id?: string; status?: string; value?: number };
  };

  const paymentId = event?.payment?.id;
  const status = event?.payment?.status;

  if (!paymentId || !status) {
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  if (status !== "RECEIVED" && status !== "CONFIRMED") {
    return res.status(200).json({ ignored: true, reason: "Payment not confirmed" });
  }

  // Find the token purchase record
  const [purchase] = await db
    .select()
    .from(tokenPurchasesTable)
    .where(eq(tokenPurchasesTable.asaasChargeId, paymentId))
    .limit(1);

  if (!purchase) {
    return res.status(404).json({ error: "Purchase not found" });
  }

  if (purchase.status === "paid") {
    return res.status(200).json({ ignored: true, reason: "Already processed" });
  }

  // Update purchase status
  await db
    .update(tokenPurchasesTable)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(tokenPurchasesTable.id, purchase.id));

  // Credit the tenant (convert R$ value to USD credits using rough rate)
  const usdRate = Number(process.env["USD_BRL_RATE"] ?? 5.0);
  const creditsUsd = Number(purchase.valor) / usdRate;

  const [tenant] = await db
    .select({ aiCreditsUsd: tenantsTable.aiCreditsUsd })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, purchase.tenantId as string))
    .limit(1);

  const currentCredits = Number(tenant?.aiCreditsUsd ?? 0);
  await db
    .update(tenantsTable)
    .set({
      aiCreditsUsd: String(currentCredits + creditsUsd),
      updatedAt: new Date(),
    })
    .where(eq(tenantsTable.id, purchase.tenantId as string));

  return res.json({
    success: true,
    tenantId: purchase.tenantId,
    creditsAddedUsd: creditsUsd,
    totalCreditsUsd: currentCredits + creditsUsd,
  });
});

export default router;
