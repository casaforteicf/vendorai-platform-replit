import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { db, tenantsTable, tokenPurchasesTable } from "@workspace/db";
import { requireRole, requireSameTenanOrSuperAdmin } from "../middlewares/auth.js";
import { createOrGetCustomer, createCharge, getPixQrCode, isAsaasConfigured } from "../lib/asaas.js";
import {
  GENERATION_PACK_PRICE_BRL,
  GENERATION_PACK_SIZE,
  getContentGenerationAllowance,
} from "../services/content-generation-allowance.js";
import {
  AI_CREDIT_PACK_CREDITS,
  AI_CREDIT_PACK_PRICE_BRL,
   getTenantAiBudget,
} from "../services/ai-budget.js";
import {
  VENDOR_CREDIT_PACKS,
  getVendorCreditPackByKey,
  getVendorCreditPackByCredits,
  VENDOR_TOKENS_PER_BRL,
  VENDOR_TOKEN_PACK_PRICE_BRL,
  VENDOR_TOKEN_PACK_TOKENS,
  brlToVendorTokens,
} from "../services/vendor-credits.js";

const router: IRouter = Router();
const requireBillingAdmin = requireRole("tenant_admin", "super_admin");

// Compatibilidade: o saldo exibido ao tenant usa sempre o padrão canônico.
export const CREDITS_PER_BRL = VENDOR_TOKENS_PER_BRL;

export function calcCredits(valorReais: number): number {
  return brlToVendorTokens(valorReais);
}

function isGenerationPack(purchase: typeof tokenPurchasesTable.$inferSelect) {
  return Number(purchase.valor) === GENERATION_PACK_PRICE_BRL
    && (purchase.credits === 0 || purchase.credits === AI_CREDIT_PACK_CREDITS);
}

async function createVendorCreditPackPurchase(
  tenantId: string,
  packKey: string,
  billingType: "PIX" | "UNDEFINED" = "PIX",
) {
  const pack = getVendorCreditPackByKey(packKey);
  if (!pack) return { error: "Pacote de Vendor Credits inválido", status: 400 as const };

  if (!(await isAsaasConfigured())) {
    return { error: "Pagamentos não configurados", status: 503 as const };
  }

  const [tenant] = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) return { error: "Tenant não encontrado", status: 404 as const };

  const [existingPending] = await db
    .select()
    .from(tokenPurchasesTable)
    .where(and(
      eq(tokenPurchasesTable.tenantId, tenantId),
      eq(tokenPurchasesTable.status, "pending"),
      eq(tokenPurchasesTable.credits, pack.credits),
      eq(tokenPurchasesTable.valor, String(pack.priceBrl)),
    ))
    .orderBy(desc(tokenPurchasesTable.createdAt))
    .limit(1);

  if (existingPending?.invoiceUrl) {
    return {
      id: existingPending.id,
      status: "pending" as const,
      packKey: pack.key,
      vendorCredits: pack.credits,
      credits: pack.credits,
      value: pack.priceBrl,
      invoiceUrl: existingPending.invoiceUrl,
      chargeId: existingPending.asaasChargeId,
      reused: true,
    };
  }

  const purchase = await db.insert(tokenPurchasesTable).values({
    tenantId,
    valor: String(pack.priceBrl),
    credits: pack.credits,
    status: "pending",
  }).returning().then((rows) => rows[0]!);

  try {
    const customer = await createOrGetCustomer({ name: tenant.name });
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const dueDateStr = dueDate.toISOString().split("T")[0]!;
    const charge = await createCharge({
      customer: customer.id,
      billingType,
      value: pack.priceBrl,
      dueDate: dueDateStr,
      description: `Vendor.ai — +${pack.credits.toLocaleString("pt-BR")} Vendor Credits`,
      externalReference: `vendor_credits:${tenantId}:${purchase.id}`,
    });

    await db.update(tokenPurchasesTable).set({
      asaasChargeId: charge.id,
      asaasCustomerId: customer.id,
      invoiceUrl: charge.invoiceUrl,
    }).where(eq(tokenPurchasesTable.id, purchase.id));

    return {
      id: purchase.id,
      status: "pending" as const,
      packKey: pack.key,
      vendorCredits: pack.credits,
      credits: pack.credits,
      value: pack.priceBrl,
      invoiceUrl: charge.invoiceUrl,
      chargeId: charge.id,
    };
  } catch (error) {
    await db.update(tokenPurchasesTable).set({ status: "failed" }).where(eq(tokenPurchasesTable.id, purchase.id));
    throw error;
  }
}

async function createFixedAiCreditPack(tenantId: string) {
  if (!(await isAsaasConfigured())) {
    return { error: "Pagamentos não configurados", status: 503 as const };
  }

  const [tenant] = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) return { error: "Tenant não encontrado", status: 404 as const };

  const [existingPending] = await db
    .select()
    .from(tokenPurchasesTable)
    .where(and(
      eq(tokenPurchasesTable.tenantId, tenantId),
      eq(tokenPurchasesTable.status, "pending"),
      eq(tokenPurchasesTable.credits, AI_CREDIT_PACK_CREDITS),
      eq(tokenPurchasesTable.valor, String(AI_CREDIT_PACK_PRICE_BRL)),
    ))
    .orderBy(desc(tokenPurchasesTable.createdAt))
    .limit(1);

  if (existingPending?.invoiceUrl) {
    return {
      id: existingPending.id,
      status: "pending" as const,
      credits: AI_CREDIT_PACK_CREDITS,
      value: AI_CREDIT_PACK_PRICE_BRL,
      invoiceUrl: existingPending.invoiceUrl,
      chargeId: existingPending.asaasChargeId,
      reused: true,
    };
  }

  const purchase = await db
    .insert(tokenPurchasesTable)
    .values({
      tenantId,
      valor: String(AI_CREDIT_PACK_PRICE_BRL),
      credits: AI_CREDIT_PACK_CREDITS,
      status: "pending",
    })
    .returning()
    .then((rows) => rows[0]!);

  try {
    const customer = await createOrGetCustomer({ name: tenant.name });
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const dueDateStr = dueDate.toISOString().split("T")[0]!;
    const charge = await createCharge({
      customer: customer.id,
      billingType: "UNDEFINED",
      value: AI_CREDIT_PACK_PRICE_BRL,
      dueDate: dueDateStr,
      description: `Vendor.ai — +${AI_CREDIT_PACK_CREDITS.toLocaleString("pt-BR")} Tokens`,
      // Reutiliza o fluxo de webhook já idempotente: pagamento confirmado marca
      // a compra como paga e credita o tenant. O trigger do banco espelha esse
      // saldo em ai_credits_usd para o hard-cap financeiro do AI Gateway.
      externalReference: `token_topup:${tenantId}:${purchase.id}`,
    });

    await db
      .update(tokenPurchasesTable)
      .set({
        asaasChargeId: charge.id,
        asaasCustomerId: customer.id,
        invoiceUrl: charge.invoiceUrl,
      })
      .where(eq(tokenPurchasesTable.id, purchase.id));

    return {
      id: purchase.id,
      status: "pending" as const,
      credits: AI_CREDIT_PACK_CREDITS,
      value: AI_CREDIT_PACK_PRICE_BRL,
      invoiceUrl: charge.invoiceUrl,
      chargeId: charge.id,
    };
  } catch (error) {
    await db.update(tokenPurchasesTable).set({ status: "failed" }).where(eq(tokenPurchasesTable.id, purchase.id));
    throw error;
  }
}

// ── GET /tenants/:tenantId/ai-budget ─────────────────────────────────────────
// Fonte única para o percentual de consumo exibido ao tenant.
router.get(
  "/tenants/:tenantId/ai-budget",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    // tenant-audit: reviewed protected by requireSameTenanOrSuperAdmin before tenant data access
    const tenantId = String(req.params["tenantId"]);
    const budget = await getTenantAiBudget(tenantId);
    if (!budget) {
      res.status(404).json({ error: "Tenant não encontrado" });
      return;
    }
    res.json({
      tenantId: budget.tenantId,
      planName: budget.planName,
      percentUsed: budget.percentUsed,
      alertPercent: budget.alertPercent,
      blocked: budget.blocked,
      baseTokens: budget.baseCredits,
      extraTokensRemaining: budget.extraCreditsRemaining,
      usedTokens: budget.usedCredits,
      remainingTokens: budget.remainingCredits,
      totalCycleTokens: budget.totalCycleCredits,
      pack: {
        priceBrl: AI_CREDIT_PACK_PRICE_BRL,
        tokens: AI_CREDIT_PACK_CREDITS,
      },
      tokenStandard: {
        tokensPerBrl: VENDOR_TOKENS_PER_BRL,
      },
    });
  },
);

// ── POST /tenants/:tenantId/ai-credit-pack-purchases ─────────────────────────
// Compra deliberada e administrativa no padrão canônico: R$165 = +165.000 Tokens.
router.post(
  "/tenants/:tenantId/ai-credit-pack-purchases",
  requireSameTenanOrSuperAdmin(),
  requireBillingAdmin,
  async (req, res) => {
    // tenant-audit: reviewed protected by same-tenant guard plus billing-admin role
    const tenantId = String(req.params["tenantId"]);
    try {
      const purchase = await createFixedAiCreditPack(tenantId);
      if ("error" in purchase) {
        res.status(purchase.status).json({ error: purchase.error });
        return;
      }
      res.status(purchase.reused ? 200 : 201).json(purchase);
    } catch (error) {
      req.log.error({ error, tenantId }, "ai-credit-pack: failed to create Asaas charge");
      res.status(502).json({ error: "Não foi possível abrir a cobrança de créditos no Asaas. Tente novamente." });
    }
  },
);

// ── GET /vendor-credit-packs ─────────────────────────────────────────────────
router.get(
  "/vendor-credit-packs",
  async (_req, res) => {
    res.json({
      currency: "BRL",
      unit: "vendor_credits",
      packs: VENDOR_CREDIT_PACKS,
    });
  },
);

// ── POST /tenants/:tenantId/vendor-credit-purchases ──────────────────────────
router.post(
  "/tenants/:tenantId/vendor-credit-purchases",
  requireSameTenanOrSuperAdmin(),
  requireBillingAdmin,
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const parsed = z.object({
      packKey: z.string().min(1).optional(),
      credits: z.number().int().positive().optional(),
    }).refine((value) => Boolean(value.packKey || value.credits), {
      message: "Informe packKey ou credits",
    }).safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({ error: "Compra de Vendor Credits inválida", packs: VENDOR_CREDIT_PACKS });
      return;
    }

    const pack = parsed.data.packKey
      ? getVendorCreditPackByKey(parsed.data.packKey)
      : getVendorCreditPackByCredits(parsed.data.credits!);

    if (!pack) {
      res.status(400).json({ error: "Pacote de Vendor Credits não encontrado", packs: VENDOR_CREDIT_PACKS });
      return;
    }

    try {
      const purchase = await createVendorCreditPackPurchase(tenantId, pack.key, "PIX");
      if ("error" in purchase) {
        res.status(purchase.status).json({ error: purchase.error, packs: VENDOR_CREDIT_PACKS });
        return;
      }
      res.status(purchase.reused ? 200 : 201).json({ ...purchase, usageUnit: "vendor_credits" });
    } catch (error) {
      req.log.error({ error, tenantId, packKey: pack.key }, "vendor-credits: failed to create Asaas charge");
      res.status(502).json({ error: "Não foi possível abrir a cobrança de Vendor Credits no Asaas. Tente novamente." });
    }
  },
);

// Legacy endpoint kept as compatibility alias. New clients must use vendor-credit-purchases.
router.post(
  "/tenants/:tenantId/token-purchases",
  requireSameTenanOrSuperAdmin(),
  requireBillingAdmin,
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const parsed = z.object({
      packKey: z.string().optional(),
      credits: z.number().int().positive().optional(),
      valor: z.number().optional(),
    }).safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({ error: "Compra de Vendor Credits inválida", packs: VENDOR_CREDIT_PACKS });
      return;
    }

    const pack = parsed.data.packKey
      ? getVendorCreditPackByKey(parsed.data.packKey)
      : parsed.data.credits
        ? getVendorCreditPackByCredits(parsed.data.credits)
        : parsed.data.valor
          ? VENDOR_CREDIT_PACKS.find((candidate) => candidate.priceBrl === parsed.data.valor) ?? null
          : VENDOR_CREDIT_PACKS[2]!;

    if (!pack) {
      res.status(400).json({ error: "Pacote de Vendor Credits não encontrado", packs: VENDOR_CREDIT_PACKS });
      return;
    }

    try {
      const purchase = await createVendorCreditPackPurchase(tenantId, pack.key, "PIX");
      if ("error" in purchase) {
        res.status(purchase.status).json({ error: purchase.error, packs: VENDOR_CREDIT_PACKS });
        return;
      }
      res.status(purchase.reused ? 200 : 201).json({
        ...purchase,
        usageUnit: "vendor_credits",
        // Deprecated response aliases.
        tokens: purchase.vendorCredits,
      });
    } catch (error) {
      req.log.error({ error, tenantId, packKey: pack.key }, "vendor-credits legacy alias: failed to create Asaas charge");
      res.status(502).json({ error: "Não foi possível abrir a cobrança de Vendor Credits no Asaas. Tente novamente." });
    }
  },
);

// ── GET /tenants/:tenantId/token-purchases ────────────────────────────────────
router.get(
  "/tenants/:tenantId/token-purchases",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);

    const [tenant] = await db
      .select({ tokenCredits: tenantsTable.tokenCredits })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));

    if (!tenant) {
      res.status(404).json({ error: "Tenant não encontrado" });
      return;
    }

    const allPurchases = await db
      .select()
      .from(tokenPurchasesTable)
      .where(eq(tokenPurchasesTable.tenantId, tenantId))
      .orderBy(desc(tokenPurchasesTable.createdAt))
      .limit(50);
    const purchases = allPurchases.filter((purchase) => !isGenerationPack(purchase)).slice(0, 20);

    res.json({
      tokenCredits: tenant.tokenCredits,
      tokenBalance: tenant.tokenCredits,
      purchases,
      creditsPerBrl: CREDITS_PER_BRL,
      tokenStandard: {
        tokensPerBrl: VENDOR_TOKENS_PER_BRL,
        packPriceBrl: VENDOR_TOKEN_PACK_PRICE_BRL,
        packTokens: VENDOR_TOKEN_PACK_TOKENS,
      },
    });
  }
);

// ── POST /tenants/:tenantId/generation-pack-purchases ────────────────────────
// Compatibilidade com o fluxo antigo de conteúdo. O pacote agora é o mesmo
// Compatibilidade com o fluxo antigo: a compra agora usa o pacote canônico de Tokens.
// Novas franquias devem ser controladas pelo ledger/cotas, não por moedas paralelas.
router.post(
  "/tenants/:tenantId/generation-pack-purchases",
  requireSameTenanOrSuperAdmin(),
  requireBillingAdmin,
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const allowance = await getContentGenerationAllowance(tenantId);
    if (!allowance.configId) {
      res.status(409).json({ error: "Configuração de IA do tenant ainda não está pronta." });
      return;
    }
    if (!allowance.canPurchase) {
      res.status(409).json({
        error: "A compra pelo fluxo de conteúdo é liberada somente quando as gerações disponíveis chegarem a zero. A recarga de créditos IA pode ser feita pelo indicador de consumo.",
        allowance,
      });
      return;
    }

    try {
      const purchase = await createFixedAiCreditPack(tenantId);
      if ("error" in purchase) {
        res.status(purchase.status).json({ error: purchase.error });
        return;
      }
      res.status(purchase.reused ? 200 : 201).json({
        ...purchase,
        quantity: GENERATION_PACK_SIZE,
      });
    } catch (error) {
      req.log.error({ error, tenantId }, "generation-pack: failed to create unified AI credit charge");
      res.status(502).json({ error: "Não foi possível abrir a cobrança no Asaas. Tente novamente." });
    }
  }
);

router.get(
  "/tenants/:tenantId/generation-pack-purchases",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const [allowance, allPurchases] = await Promise.all([
      getContentGenerationAllowance(tenantId),
      db
        .select()
        .from(tokenPurchasesTable)
        .where(eq(tokenPurchasesTable.tenantId, tenantId))
        .orderBy(desc(tokenPurchasesTable.createdAt))
        .limit(50),
    ]);
    res.json({
      allowance,
      purchases: allPurchases.filter(isGenerationPack),
      pack: {
        quantity: GENERATION_PACK_SIZE,
        value: AI_CREDIT_PACK_PRICE_BRL,
        credits: AI_CREDIT_PACK_CREDITS,
      },
    });
  }
);

// ── GET /tenants/:tenantId/token-purchases/:id/pix ───────────────────────────
router.get(
  "/tenants/:tenantId/token-purchases/:id/pix",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const purchaseId = String(req.params["id"]);

    const [purchase] = await db
      .select()
      .from(tokenPurchasesTable)
      .where(eq(tokenPurchasesTable.id, purchaseId));

    if (!purchase || purchase.tenantId !== tenantId) {
      res.status(404).json({ error: "Compra não encontrada" });
      return;
    }

    if (!purchase.asaasChargeId) {
      res.status(400).json({ error: "Cobrança Asaas não criada ainda" });
      return;
    }

    try {
      const qr = await getPixQrCode(purchase.asaasChargeId);
      res.json({ ...qr, invoiceUrl: purchase.invoiceUrl });
    } catch (err: unknown) {
      req.log.warn({ err, chargeId: purchase.asaasChargeId }, "token-purchases: failed to get pix qr code");
      res.json({ encodedImage: null, payload: null, invoiceUrl: purchase.invoiceUrl });
    }
  }
);

export default router;
