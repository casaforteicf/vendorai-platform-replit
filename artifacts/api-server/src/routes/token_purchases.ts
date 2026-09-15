import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { db, tenantsTable, tokenPurchasesTable } from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth.js";
import { createOrGetCustomer, createCharge, getPixQrCode, isAsaasConfigured } from "../lib/asaas.js";
import {
  GENERATION_PACK_PRICE_BRL,
  GENERATION_PACK_SIZE,
  getContentGenerationAllowance,
} from "../services/content-generation-allowance.js";

const router: IRouter = Router();

// R$1 = CREDITS_PER_BRL créditos (15% margin embedded in this rate)
export const CREDITS_PER_BRL = 50;

export function calcCredits(valorReais: number): number {
  return Math.floor(valorReais * CREDITS_PER_BRL);
}

const MIN_VALOR = 20;

function isGenerationPack(purchase: typeof tokenPurchasesTable.$inferSelect) {
  return purchase.credits === 0 && Number(purchase.valor) === GENERATION_PACK_PRICE_BRL;
}

// ── POST /tenants/:tenantId/token-purchases ──────────────────────────────────
router.post(
  "/tenants/:tenantId/token-purchases",
  requireSameTenanOrSuperAdmin,
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
  requireSameTenanOrSuperAdmin,
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
// Growth inclui 200 gerações. O pacote extra só pode ser comprado quando todo
// o saldo disponível (franquia + extras anteriores) tiver chegado a zero.
router.post(
  "/tenants/:tenantId/generation-pack-purchases",
  requireSameTenanOrSuperAdmin,
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const allowance = await getContentGenerationAllowance(tenantId);
    if (!allowance.configId) {
      res.status(409).json({ error: "Configuração de IA do tenant ainda não está pronta." });
      return;
    }
    if (!allowance.canPurchase) {
      res.status(409).json({
        error: "A compra é liberada somente quando as gerações disponíveis chegarem a zero.",
        allowance,
      });
      return;
    }
    if (!(await isAsaasConfigured())) {
      res.status(503).json({ error: "Pagamentos não configurados" });
      return;
    }

    const [tenant] = await db
      .select({ id: tenantsTable.id, name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));
    if (!tenant) {
      res.status(404).json({ error: "Tenant não encontrado" });
      return;
    }

    const [existingPending] = await db
      .select()
      .from(tokenPurchasesTable)
      .where(and(
        eq(tokenPurchasesTable.tenantId, tenantId),
        eq(tokenPurchasesTable.status, "pending"),
        eq(tokenPurchasesTable.credits, 0),
        eq(tokenPurchasesTable.valor, String(GENERATION_PACK_PRICE_BRL)),
      ))
      .orderBy(desc(tokenPurchasesTable.createdAt))
      .limit(1);

    if (existingPending?.invoiceUrl) {
      res.status(200).json({
        id: existingPending.id,
        status: "pending",
        quantity: GENERATION_PACK_SIZE,
        value: GENERATION_PACK_PRICE_BRL,
        invoiceUrl: existingPending.invoiceUrl,
        chargeId: existingPending.asaasChargeId,
        reused: true,
      });
      return;
    }

    const purchase = await db
      .insert(tokenPurchasesTable)
      .values({
        tenantId,
        valor: String(GENERATION_PACK_PRICE_BRL),
        credits: 0,
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
        value: GENERATION_PACK_PRICE_BRL,
        dueDate: dueDateStr,
        description: `VendorAI — +${GENERATION_PACK_SIZE} gerações de conteúdo`,
        // Reutiliza o lifecycle idempotente já existente no webhook Asaas.
        // credits=0 impede que esta compra altere o saldo genérico de tokens.
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
        status: "pending",
        quantity: GENERATION_PACK_SIZE,
        value: GENERATION_PACK_PRICE_BRL,
        invoiceUrl: charge.invoiceUrl,
        chargeId: charge.id,
      });
    } catch (error) {
      await db.update(tokenPurchasesTable).set({ status: "failed" }).where(eq(tokenPurchasesTable.id, purchase.id));
      req.log.error({ error, tenantId, purchaseId: purchase.id }, "generation-pack: failed to create Asaas charge");
      res.status(502).json({ error: "Não foi possível abrir a cobrança no Asaas. Tente novamente." });
    }
  }
);

router.get(
  "/tenants/:tenantId/generation-pack-purchases",
  requireSameTenanOrSuperAdmin,
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
      pack: { quantity: GENERATION_PACK_SIZE, value: GENERATION_PACK_PRICE_BRL },
    });
  }
);

// ── GET /tenants/:tenantId/token-purchases/:id/pix ───────────────────────────
router.get(
  "/tenants/:tenantId/token-purchases/:id/pix",
  requireSameTenanOrSuperAdmin,
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
