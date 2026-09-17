import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq, and, gte, sql, desc, ne, asc } from "drizzle-orm";
import {
  db,
  tenantsTable,
  plansTable,
  aiUsageLogsTable,
  tokenPurchasesTable,
  commercialProductProfilesTable,
  productUsageQuotasTable,
  usageMetricsTable,
  usageLedgerTable,
  produtosCatalogoTable,
} from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { encrypt } from "../lib/crypto.js";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import {
  getActiveEntitlements,
  getTenantUsageSnapshot,
  getVendorCreditBalance,
} from "../services/commercial-usage.js";
import { z } from "zod/v4";

const router: IRouter = Router();

const jarvisVoiceSchema = z.object({ text: z.string().trim().min(1).max(4000) });
const commercialProfilePatchSchema = z.object({
  includedInGrowth: z.boolean().optional(),
  maxUsers: z.number().int().positive().nullable().optional(),
  moduleKeys: z.array(z.string().min(1)).optional(),
  segmentKeys: z.array(z.string().min(1)).optional(),
  benefits: z.array(z.string().min(1)).optional(),
  dependencies: z.array(z.string().min(1)).optional(),
  active: z.boolean().optional(),
});
const quotaPatchSchema = z.object({
  monthlyQuantity: z.number().nonnegative().nullable(),
  hardCapQuantity: z.number().nonnegative().nullable().optional(),
  overageAllowed: z.boolean().optional(),
});

function secureTokenEquals(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

router.post("/tenants/:tenantId/ai-keys/anthropic", authenticate, async (req, res) => {
  const tenantId = req.params.tenantId;
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey || !apiKey.startsWith("sk-")) return res.status(400).json({ error: "Invalid Anthropic API key format" });
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });

  const encrypted = encrypt(apiKey);
  await db.update(tenantsTable).set({
    anthropicApiKeyEncrypted: encrypted,
    anthropicKeyConfiguredAt: new Date(),
    anthropicKeyStatus: "ativo",
    updatedAt: new Date(),
  }).where(eq(tenantsTable.id, tenantId as string));
  return res.json({ success: true, message: "Anthropic API key configured" });
});

router.delete("/tenants/:tenantId/ai-keys/anthropic", authenticate, async (req, res) => {
  const tenantId = req.params.tenantId;
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });
  await db.update(tenantsTable).set({
    anthropicApiKeyEncrypted: null,
    anthropicKeyConfiguredAt: null,
    anthropicKeyStatus: "nao_configurada",
    updatedAt: new Date(),
  }).where(eq(tenantsTable.id, tenantId as string));
  return res.json({ success: true, message: "Anthropic API key removed" });
});

router.get("/tenants/:tenantId/ai-usage", authenticate, async (req, res) => {
  const tenantId = req.params.tenantId;
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });

  const [tenant] = await db.select({
    planId: tenantsTable.planId,
    aiCreditsUsd: tenantsTable.aiCreditsUsd,
    aiDailySpendUsd: tenantsTable.aiDailySpendUsd,
    aiDailySpendResetAt: tenantsTable.aiDailySpendResetAt,
    openaiKeyStatus: tenantsTable.openaiKeyStatus,
    anthropicKeyStatus: tenantsTable.anthropicKeyStatus,
  }).from(tenantsTable).where(eq(tenantsTable.id, tenantId as string)).limit(1);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  let quotaUsd: number | null = null;
  if (tenant.planId) {
    const [plan] = await db.select({ aiQuotaUsd: plansTable.aiQuotaUsd }).from(plansTable).where(eq(plansTable.id, tenant.planId)).limit(1);
    quotaUsd = plan?.aiQuotaUsd ? Number(plan.aiQuotaUsd) : null;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [monthlyRow] = await db.select({ total: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)` })
    .from(aiUsageLogsTable).where(and(eq(aiUsageLogsTable.tenantId, tenantId as string), gte(aiUsageLogsTable.createdAt, startOfMonth)));
  const spentThisMonthUsd = Number(monthlyRow?.total ?? 0);

  const featureRows = await db.select({
    feature: aiUsageLogsTable.feature,
    total: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
    calls: sql<number>`count(*)`,
  }).from(aiUsageLogsTable)
    .where(and(eq(aiUsageLogsTable.tenantId, tenantId as string), gte(aiUsageLogsTable.createdAt, startOfMonth)))
    .groupBy(aiUsageLogsTable.feature);

  const recentLogs = await db.select().from(aiUsageLogsTable)
    .where(eq(aiUsageLogsTable.tenantId, tenantId as string)).orderBy(desc(aiUsageLogsTable.createdAt)).limit(50);

  return res.json({
    quotaUsd,
    creditsUsd: Number(tenant.aiCreditsUsd ?? 0),
    spentThisMonthUsd,
    remainingUsd: (quotaUsd ?? 0) + Number(tenant.aiCreditsUsd ?? 0) - spentThisMonthUsd,
    dailySpendUsd: Number(tenant.aiDailySpendUsd ?? 0),
    dailySpendResetAt: tenant.aiDailySpendResetAt,
    byok: { openai: tenant.openaiKeyStatus === "ativo", anthropic: tenant.anthropicKeyStatus === "ativo" },
    featureBreakdown: featureRows,
    recentLogs,
  });
});

/** Customer view: human units + Vendor Credits + entitlements. */
router.get("/tenants/:tenantId/commercial-usage", authenticate, async (req, res) => {
  const tenantId = req.params.tenantId;
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });

  const entitlements = await getActiveEntitlements(tenantId);
  const requestedCommercialKey = typeof req.query.commercialKey === "string" ? req.query.commercialKey : null;
  const commercialKey = requestedCommercialKey
    ?? (entitlements.some((item) => item.commercialKey === "vendor.growth") ? "vendor.growth" : entitlements[0]?.commercialKey)
    ?? "vendor.crm.free";
  const [quotas, creditBalance] = await Promise.all([
    getTenantUsageSnapshot(tenantId, commercialKey),
    getVendorCreditBalance(tenantId),
  ]);
  return res.json({ tenantId, commercialKey, entitlements, vendorCreditsBalance: creditBalance, quotas, enforcementMode: "measure_only" });
});

/** Canonical Super Admin commercial model. Prices remain sourced from catalog. */
router.get("/admin/commercial-model", authenticate, requireRole("super_admin"), async (_req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [products, quotas, metrics, usage] = await Promise.all([
    db.select({
      commercialKey: commercialProductProfilesTable.commercialKey,
      offerKind: commercialProductProfilesTable.offerKind,
      includedInGrowth: commercialProductProfilesTable.includedInGrowth,
      maxUsers: commercialProductProfilesTable.maxUsers,
      moduleKeys: commercialProductProfilesTable.moduleKeys,
      segmentKeys: commercialProductProfilesTable.segmentKeys,
      benefits: commercialProductProfilesTable.benefits,
      dependencies: commercialProductProfilesTable.dependencies,
      active: commercialProductProfilesTable.active,
      displayOrder: commercialProductProfilesTable.displayOrder,
      catalogProductId: commercialProductProfilesTable.catalogProductId,
      name: produtosCatalogoTable.nome,
      sku: produtosCatalogoTable.sku,
      monthlyPrice: produtosCatalogoTable.precoMensalidade,
      basePrice: produtosCatalogoTable.precoBase,
      implementationPrice: produtosCatalogoTable.precoImplantacao,
      recurring: produtosCatalogoTable.recorrencia,
      catalogActive: produtosCatalogoTable.ativo,
    }).from(commercialProductProfilesTable)
      .leftJoin(produtosCatalogoTable, eq(commercialProductProfilesTable.catalogProductId, produtosCatalogoTable.id))
      .orderBy(asc(commercialProductProfilesTable.displayOrder)),
    db.select().from(productUsageQuotasTable).where(eq(productUsageQuotasTable.active, true)),
    db.select().from(usageMetricsTable).where(eq(usageMetricsTable.active, true)).orderBy(asc(usageMetricsTable.name)),
    db.select({
      commercialKey: usageLedgerTable.commercialKey,
      metricKey: usageLedgerTable.metricKey,
      quantity: sql<number>`coalesce(sum(${usageLedgerTable.quantity}), 0)`,
      vendorCredits: sql<number>`coalesce(sum(${usageLedgerTable.vendorCredits}), 0)`,
      costUsd: sql<number>`coalesce(sum(${usageLedgerTable.totalCostUsd}), 0)`,
      events: sql<number>`count(*)`,
    }).from(usageLedgerTable)
      .where(gte(usageLedgerTable.createdAt, startOfMonth))
      .groupBy(usageLedgerTable.commercialKey, usageLedgerTable.metricKey),
  ]);

  return res.json({ products, quotas, metrics, usage, enforcementMode: "measure_only" });
});

router.patch("/admin/commercial-model/products/:commercialKey", authenticate, requireRole("super_admin"), async (req, res) => {
  const parsed = commercialProfilePatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Invalid commercial product update", issues: parsed.error.issues });
  const [updated] = await db.update(commercialProductProfilesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(commercialProductProfilesTable.commercialKey, String(req.params.commercialKey)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Commercial product not found" });
  return res.json(updated);
});

router.patch("/admin/commercial-model/products/:commercialKey/quotas/:metricKey", authenticate, requireRole("super_admin"), async (req, res) => {
  const parsed = quotaPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Invalid quota update", issues: parsed.error.issues });
  const commercialKey = String(req.params.commercialKey);
  const metricKey = String(req.params.metricKey);
  const [metric] = await db.select({ key: usageMetricsTable.key }).from(usageMetricsTable).where(eq(usageMetricsTable.key, metricKey)).limit(1);
  if (!metric) return res.status(404).json({ error: "Usage metric not found" });
  const [updated] = await db.insert(productUsageQuotasTable).values({
    commercialKey,
    metricKey,
    monthlyQuantity: parsed.data.monthlyQuantity == null ? null : String(parsed.data.monthlyQuantity),
    hardCapQuantity: parsed.data.hardCapQuantity == null ? null : String(parsed.data.hardCapQuantity),
    overageAllowed: parsed.data.overageAllowed ?? true,
    active: true,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [productUsageQuotasTable.commercialKey, productUsageQuotasTable.metricKey],
    set: {
      monthlyQuantity: parsed.data.monthlyQuantity == null ? null : String(parsed.data.monthlyQuantity),
      hardCapQuantity: parsed.data.hardCapQuantity == null ? null : String(parsed.data.hardCapQuantity),
      overageAllowed: parsed.data.overageAllowed ?? true,
      active: true,
      updatedAt: new Date(),
    },
  }).returning();
  return res.json(updated);
});

router.get("/admin/ai-usage", authenticate, requireRole("super_admin"), async (_req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [totalRow] = await db.select({
    totalCost: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
    totalCalls: sql<number>`count(*)`,
  }).from(aiUsageLogsTable).where(gte(aiUsageLogsTable.createdAt, startOfMonth));
  const tenantRows = await db.select({
    tenantId: aiUsageLogsTable.tenantId,
    totalCost: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
    totalCalls: sql<number>`count(*)`,
    byokCalls: sql<number>`count(*) filter (where ${aiUsageLogsTable.usedByok} = true)`,
  }).from(aiUsageLogsTable).where(gte(aiUsageLogsTable.createdAt, startOfMonth)).groupBy(aiUsageLogsTable.tenantId);
  const featureRows = await db.select({
    feature: aiUsageLogsTable.feature,
    totalCost: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
    totalCalls: sql<number>`count(*)`,
  }).from(aiUsageLogsTable).where(gte(aiUsageLogsTable.createdAt, startOfMonth)).groupBy(aiUsageLogsTable.feature);
  return res.json({ totalCostUsd: Number(totalRow?.totalCost ?? 0), totalCalls: Number(totalRow?.totalCalls ?? 0), tenantBreakdown: tenantRows, featureBreakdown: featureRows });
});

router.post("/jarvis/voice", authenticate, async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : "";
  const parsed = jarvisVoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Texto inválido para síntese de voz." });
  try {
    const openai = await getOpenAIForTenant(tenantId);
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: (process.env["JARVIS_TTS_VOICE"] as any) || "cedar",
      input: parsed.data.text,
      response_format: "mp3",
      speed: 0.96,
      instructions: "Fale em português brasileiro com naturalidade, voz adulta, calorosa e confiante. Use ritmo conversacional, pausas discretas, articulação clara e entonação humana. Evite soar como locutor, robô ou leitura automática. Mantenha um estilo sofisticado, calmo e objetivo, como um assistente executivo de alto nível.",
    });
    const audio = Buffer.from(await speech.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(audio.length));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Jarvis-Voice", process.env["JARVIS_TTS_VOICE"] || "cedar");
    return res.status(200).send(audio);
  } catch (err) {
    req.log?.warn({ err }, "jarvis: neural voice generation failed");
    return res.status(502).json({ error: "Não foi possível gerar a voz neural do JARVIS." });
  }
});

router.post("/webhooks/asaas/credits", async (req, res) => {
  const expectedToken = process.env["ASAAS_WEBHOOK_ACCESS_TOKEN"];
  if (!expectedToken) return res.status(503).json({ error: "Webhook authentication is not configured" });
  const receivedToken = req.header("asaas-access-token") ?? undefined;
  if (!secureTokenEquals(receivedToken, expectedToken)) return res.status(401).json({ error: "Invalid webhook token" });

  const event = req.body as { event?: string; payment?: { id?: string; status?: string; value?: number } };
  const paymentId = event?.payment?.id;
  const status = event?.payment?.status;
  if (!paymentId || !status) return res.status(400).json({ error: "Invalid webhook payload" });
  if (status !== "RECEIVED" && status !== "CONFIRMED") return res.status(200).json({ ignored: true, reason: "Payment not confirmed" });

  const result = await db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(tokenPurchasesTable).where(eq(tokenPurchasesTable.asaasChargeId, paymentId)).limit(1);
    if (!purchase) return { kind: "not_found" as const };
    const updatedPurchases = await tx.update(tokenPurchasesTable).set({ status: "paid", paidAt: new Date() })
      .where(and(eq(tokenPurchasesTable.id, purchase.id), ne(tokenPurchasesTable.status, "paid"))).returning({ id: tokenPurchasesTable.id });
    if (updatedPurchases.length === 0) return { kind: "already_processed" as const };

    const usdRate = Number(process.env["USD_BRL_RATE"] ?? 5.0);
    if (!Number.isFinite(usdRate) || usdRate <= 0) throw new Error("Invalid USD_BRL_RATE configuration");
    const creditsUsd = Number(purchase.valor) / usdRate;
    const [tenant] = await tx.update(tenantsTable).set({
      aiCreditsUsd: sql`${tenantsTable.aiCreditsUsd} + ${creditsUsd}`,
      updatedAt: new Date(),
    }).where(eq(tenantsTable.id, purchase.tenantId as string)).returning({ aiCreditsUsd: tenantsTable.aiCreditsUsd });
    if (!tenant) throw new Error("Tenant not found for paid purchase");
    return { kind: "credited" as const, tenantId: purchase.tenantId, creditsAddedUsd: creditsUsd, totalCreditsUsd: Number(tenant.aiCreditsUsd) };
  });

  if (result.kind === "not_found") return res.status(404).json({ error: "Purchase not found" });
  if (result.kind === "already_processed") return res.status(200).json({ ignored: true, reason: "Already processed" });
  return res.json({ success: true, ...result });
});

export default router;
