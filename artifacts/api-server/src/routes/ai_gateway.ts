import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq, and, gte, sql, desc, ne } from "drizzle-orm";
import {
  db,
  tenantsTable,
  plansTable,
  aiUsageLogsTable,
  tokenPurchasesTable,
} from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { encrypt } from "../lib/crypto.js";

const router: IRouter = Router();

function secureTokenEquals(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

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

  let quotaUsd: number | null = null;
  if (tenant.planId) {
    const [plan] = await db
      .select({ aiQuotaUsd: plansTable.aiQuotaUsd })
      .from(plansTable)
      .where(eq(plansTable.id, tenant.planId))
      .limit(1);
    quotaUsd = plan?.aiQuotaUsd ? Number(plan.aiQuotaUsd) : null;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [monthlyRow] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)` })
    .from(aiUsageLogsTable)
    .where(and(eq(aiUsageLogsTable.tenantId, tenantId as string), gte(aiUsageLogsTable.createdAt, startOfMonth)));
  const spentThisMonthUsd = Number(monthlyRow?.total ?? 0);

  const featureRows = await db
    .select({
      feature: aiUsageLogsTable.feature,
      total: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
      calls: sql<number>`count(*)`,
    })
    .from(aiUsageLogsTable)
    .where(and(eq(aiUsageLogsTable.tenantId, tenantId as string), gte(aiUsageLogsTable.createdAt, startOfMonth)))
    .groupBy(aiUsageLogsTable.feature);

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

router.get("/admin/ai-usage", authenticate, requireRole("super_admin"), async (_req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalRow] = await db
    .select({
      totalCost: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
      totalCalls: sql<number>`count(*)`,
    })
    .from(aiUsageLogsTable)
    .where(gte(aiUsageLogsTable.createdAt, startOfMonth));

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

router.post("/webhooks/asaas/credits", async (req, res) => {
  const expectedToken = process.env["ASAAS_WEBHOOK_ACCESS_TOKEN"];
  if (!expectedToken) {
    return res.status(503).json({ error: "Webhook authentication is not configured" });
  }

  const receivedToken = req.header("asaas-access-token") ?? undefined;
  if (!secureTokenEquals(receivedToken, expectedToken)) {
    return res.status(401).json({ error: "Invalid webhook token" });
  }

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

  const result = await db.transaction(async (tx) => {
    const [purchase] = await tx
      .select()
      .from(tokenPurchasesTable)
      .where(eq(tokenPurchasesTable.asaasChargeId, paymentId))
      .limit(1);

    if (!purchase) return { kind: "not_found" as const };

    const updatedPurchases = await tx
      .update(tokenPurchasesTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(tokenPurchasesTable.id, purchase.id), ne(tokenPurchasesTable.status, "paid")))
      .returning({ id: tokenPurchasesTable.id });

    if (updatedPurchases.length === 0) return { kind: "already_processed" as const };

    const usdRate = Number(process.env["USD_BRL_RATE"] ?? 5.0);
    if (!Number.isFinite(usdRate) || usdRate <= 0) {
      throw new Error("Invalid USD_BRL_RATE configuration");
    }
    const creditsUsd = Number(purchase.valor) / usdRate;

    const [tenant] = await tx
      .update(tenantsTable)
      .set({
        aiCreditsUsd: sql`${tenantsTable.aiCreditsUsd} + ${creditsUsd}`,
        updatedAt: new Date(),
      })
      .where(eq(tenantsTable.id, purchase.tenantId as string))
      .returning({ aiCreditsUsd: tenantsTable.aiCreditsUsd });

    if (!tenant) throw new Error("Tenant not found for paid purchase");

    return {
      kind: "credited" as const,
      tenantId: purchase.tenantId,
      creditsAddedUsd: creditsUsd,
      totalCreditsUsd: Number(tenant.aiCreditsUsd),
    };
  });

  if (result.kind === "not_found") {
    return res.status(404).json({ error: "Purchase not found" });
  }
  if (result.kind === "already_processed") {
    return res.status(200).json({ ignored: true, reason: "Already processed" });
  }

  return res.json({ success: true, ...result });
});

export default router;
