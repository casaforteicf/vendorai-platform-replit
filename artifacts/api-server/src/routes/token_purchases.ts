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
  AI_CREDIT_PACK_USD,
  getTenantAiBudget,
} from "../services/ai-budget.js";

const router: IRouter = Router();
const requireBillingAdmin = requireRole("tenant_admin", "super_admin");

// R$1 = CREDITS_PER_BRL créditos no mecanismo legado de recarga livre.
export const CREDITS_PER_BRL = 50;

export function calcCredits(valorReais: number): number {
  return Math.floor(valorReais * CREDITS_PER_BRL);
}

const MIN_VALOR = 20;

function isGenerationPack(purchase: typeof tokenPurchasesTable.$inferSelect) {
  return Number(purchase.valor) === GENERATION_PACK_PRICE_BRL
    && (purchase.credits === 0 || purchase.credits === AI_CREDIT_PACK_CREDITS);
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
      budgetUsd: AI_CREDIT_PACK_USD,
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
      description: `VendorAI — +${AI_CREDIT_PACK_CREDITS.toLocaleString("pt-BR")} créditos de IA`,
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
      budgetUsd: AI_CREDIT_PACK_USD,
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
    res.json(budget);
  },
);

// ── POST /tenants/:tenantId/ai-credit-pack-purchases ─────────────────────────
// Compra deliberada e administrativa: R$499 = +25.000 créditos VendorAI.
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

// ── POST /tenants/:tenantId/token-purchases ──────────────────────────────────
router.post(
  "/tenants/:tenantId/token-purchases",
  requireSameTenanOrSuperAdmin(),
  requireBillingAdmin,
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);

    const bodySchema = z.object({
      valor: z.number().min(MIN_VALOR, `Valor mínimo é R$ ${MIN_VALOR}`),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Valor inválido" });
      return;
    }

    if (!(await isAsaasConfigured())) {
      res.status(503).json({ error: "Pagamentos não configurados" });
      return;
    }

    const { valor } = parsed.data;
    const credits = calcCredits(valor);

    const [tenant] = await db
      .select({ id: tenantsTable.id, name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));

    if (!tenant) {
      res.status(404).json({ error: "Tenant não encontrado" });
      return;
    }

    const purchase = await db
      .insert(tokenPurchasesTable)
      .values({
        tenantId,
        valor: String(valor),
        credits,
        status: "pending",
      })
      .returning()
      .then((rows) => rows[0]!);

    const customer = await createOrGetCustomer({ name: tenant.name });

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const dueDateStr = dueDate.toISOString().split("T")[0]!;

    const charge = await createCharge({
      customer: customer.id,
      billingType: "PIX",
      value: valor,
      dueDate: dueDateStr,
      description: `Recarga de créditos de IA — ${credits.toLocaleString("pt-BR")} créditos`,
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

    res.status(201).json({
      id: purchase.id,
      valor,
      credits,
      invoiceUrl: charge.invoiceUrl,
      chargeId: charge.id,
    });
  }
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

    res.json({ tokenCredits: tenant.tokenCredits, purchases, creditsPerBrl: CREDITS_PER_BRL });
  }
);

// ── POST /tenants/:tenantId/generation-pack-purchases ────────────────────────
// Compatibilidade com o fluxo antigo de conteúdo. O pacote agora é o mesmo
// produto comercial de R$499 e entrega +25.000 créditos de IA; adicionalmente
// libera +200 gerações de conteúdo para não manter duas cobranças diferentes.
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
