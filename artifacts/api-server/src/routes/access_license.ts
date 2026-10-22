import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  accessContractAcceptancesTable,
  accessLicensesTable,
  accessPassPurchasesTable,
  commercialProductProfilesTable,
  db,
  tenantEntitlementsTable,
  tenantsTable,
} from "@workspace/db";
import { createCharge, createOrGetCustomer, getPixQrCode, isAsaasConfigured } from "../lib/asaas.js";
import {
  ACCESS_PASS_DAYS,
  ACCESS_PASS_PRICE,
  activateMonthlyBenefit,
  brazilMonthKey,
  getAccessLicense,
  grantPaidPassInTransaction,
  hasActiveAccess,
} from "../services/accessLicense.js";
import { runAccessLicenseReminders } from "../services/accessLicenseReminders.js";

const router: IRouter = Router();
export const accessLicensePublicRouter: IRouter = Router();
const TERMS_VERSION = "vendorai-annual-v1";
const TERMS_TEXT = "Licença VendorAI por 12 meses, acesso completo, cobrança mensal e aceite eletrônico.";
const TERMS_HASH = createHash("sha256").update(TERMS_TEXT).digest("hex");

function safeEqual(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function serialize(license: Awaited<ReturnType<typeof getAccessLicense>>) {
  const now = new Date();
  if (!license) {
    return { enrolled: false, mode: "legacy", status: "active", active: true, readOnly: false };
  }
  const active = hasActiveAccess(license, now);
  const month = brazilMonthKey(now);
  const freeAvailable = license.mode === "prepaid" && license.freeBenefitMonth !== month;
  const remainingMs = license.accessEndsAt ? Math.max(0, license.accessEndsAt.getTime() - now.getTime()) : 0;
  return {
    enrolled: true,
    mode: license.mode,
    status: active ? "active" : "read_only",
    active,
    readOnly: !active,
    accessEndsAt: license.accessEndsAt,
    annualEndsAt: license.annualEndsAt,
    freeAvailable,
    freeBenefitMonth: month,
    remainingHours: Math.ceil(remainingMs / 3_600_000),
    pass: { days: ACCESS_PASS_DAYS, price: ACCESS_PASS_PRICE },
  };
}

router.get("/access-license/status", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.json({ enrolled: false, mode: "admin", active: true, readOnly: false }); return; }
  res.json(serialize(await getAccessLicense(tenantId)));
});

router.post("/access-license/activate-monthly", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado." }); return; }
  try {
    const license = await activateMonthlyBenefit(tenantId);
    res.json(serialize(license));
  } catch (error) {
    const code = error instanceof Error ? error.message : "ACTIVATION_FAILED";
    const status = code === "MONTHLY_BENEFIT_ALREADY_USED" ? 409 : 422;
    res.status(status).json({ error: code });
  }
});

router.get("/access-license/purchases", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado." }); return; }
  const rows = await db.select().from(accessPassPurchasesTable)
    .where(eq(accessPassPurchasesTable.tenantId, tenantId))
    .orderBy(desc(accessPassPurchasesTable.createdAt)).limit(30);
  res.json(rows);
});

router.post("/access-license/purchases", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado." }); return; }
  const parsed = z.object({ idempotencyKey: z.string().min(8).max(100) }).safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: "Identificador da compra inválido." }); return; }
  if (!(await isAsaasConfigured())) { res.status(503).json({ error: "Pagamentos não configurados." }); return; }

  const [existing] = await db.select().from(accessPassPurchasesTable).where(and(
    eq(accessPassPurchasesTable.tenantId, tenantId),
    eq(accessPassPurchasesTable.idempotencyKey, parsed.data.idempotencyKey),
  ));
  if (existing) { res.json(existing); return; }

  const [tenant] = await db.select({ name: tenantsTable.name }).from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) { res.status(404).json({ error: "Tenant não encontrado." }); return; }

  const [purchase] = await db.insert(accessPassPurchasesTable).values({
    tenantId,
    days: ACCESS_PASS_DAYS,
    amount: String(ACCESS_PASS_PRICE),
    idempotencyKey: parsed.data.idempotencyKey,
  }).returning();

  try {
    const customer = await createOrGetCustomer({ name: tenant.name });
    const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const charge = await createCharge({
      customer: customer.id,
      billingType: "UNDEFINED",
      value: ACCESS_PASS_PRICE,
      dueDate: due,
      description: "VendorAI — acesso completo por mais 5 dias",
      externalReference: `access_pass:${tenantId}:${purchase!.id}`,
    });
    const [updated] = await db.update(accessPassPurchasesTable).set({
      providerChargeId: charge.id,
      providerCustomerId: customer.id,
      invoiceUrl: charge.invoiceUrl,
      updatedAt: new Date(),
    }).where(eq(accessPassPurchasesTable.id, purchase!.id)).returning();
    res.status(201).json(updated);
  } catch (error) {
    await db.update(accessPassPurchasesTable).set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(accessPassPurchasesTable.id, purchase!.id));
    throw error;
  }
});

router.get("/access-license/purchases/:id/pix", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado." }); return; }
  const [purchase] = await db.select().from(accessPassPurchasesTable).where(and(
    eq(accessPassPurchasesTable.id, String(req.params.id)),
    eq(accessPassPurchasesTable.tenantId, tenantId),
  ));
  if (!purchase?.providerChargeId) { res.status(404).json({ error: "Cobrança não encontrada." }); return; }
  res.json({ ...(await getPixQrCode(purchase.providerChargeId)), invoiceUrl: purchase.invoiceUrl });
});

router.post("/access-license/annual-contract", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado." }); return; }
  const parsed = z.object({
    responsibleName: z.string().min(3).max(150),
    responsibleCpf: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().length(11)),
    responsibleRole: z.string().min(2).max(100),
    responsibleEmail: z.string().email(),
    accepted: z.literal(true),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: "Preencha os dados e aceite o contrato." }); return; }

  const [tenant] = await db.select({ monthlyAmount: tenantsTable.mensalidadeValor })
    .from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  const [acceptance] = await db.insert(accessContractAcceptancesTable).values({
    tenantId,
    responsibleName: parsed.data.responsibleName,
    responsibleCpf: parsed.data.responsibleCpf,
    responsibleRole: parsed.data.responsibleRole,
    responsibleEmail: parsed.data.responsibleEmail,
    termsVersion: TERMS_VERSION,
    termsHash: TERMS_HASH,
    accepted: true,
    acceptedAt: new Date(),
    acceptedIp: req.ip,
    acceptedUserAgent: req.get("user-agent")?.slice(0, 500),
    monthlyAmount: tenant?.monthlyAmount ?? null,
  }).returning();

  await db.insert(accessLicensesTable).values({
    tenantId,
    mode: "prepaid",
    status: "pending_contract",
    annualContractId: acceptance!.id,
  }).onConflictDoUpdate({
    target: accessLicensesTable.tenantId,
    set: {
      status: "pending_contract",
      annualContractId: acceptance!.id,
      updatedAt: new Date(),
    },
  });

  res.status(201).json({
    id: acceptance!.id,
    status: acceptance!.status,
    termsVersion: TERMS_VERSION,
    termsHash: TERMS_HASH,
    monthlyAmount: tenant?.monthlyAmount,
    message: "Contrato aceito e encaminhado para efetivação da licença anual.",
  });
});

router.get("/admin/access-license/tenants/:tenantId", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") { res.status(403).json({ error: "Super admin only." }); return; }
  const tenantId = String(req.params.tenantId);
  const [license, purchases, contracts] = await Promise.all([
    getAccessLicense(tenantId),
    db.select({
      id: accessPassPurchasesTable.id,
      status: accessPassPurchasesTable.status,
      days: accessPassPurchasesTable.days,
      amount: accessPassPurchasesTable.amount,
      paidAt: accessPassPurchasesTable.paidAt,
      accessStartsAt: accessPassPurchasesTable.accessStartsAt,
      accessEndsAt: accessPassPurchasesTable.accessEndsAt,
      createdAt: accessPassPurchasesTable.createdAt,
    }).from(accessPassPurchasesTable)
      .where(eq(accessPassPurchasesTable.tenantId, tenantId))
      .orderBy(desc(accessPassPurchasesTable.createdAt)).limit(20),
    db.select({
      id: accessContractAcceptancesTable.id,
      responsibleName: accessContractAcceptancesTable.responsibleName,
      responsibleRole: accessContractAcceptancesTable.responsibleRole,
      responsibleEmail: accessContractAcceptancesTable.responsibleEmail,
      status: accessContractAcceptancesTable.status,
      termsVersion: accessContractAcceptancesTable.termsVersion,
      acceptedAt: accessContractAcceptancesTable.acceptedAt,
      monthlyAmount: accessContractAcceptancesTable.monthlyAmount,
      createdAt: accessContractAcceptancesTable.createdAt,
    }).from(accessContractAcceptancesTable)
      .where(eq(accessContractAcceptancesTable.tenantId, tenantId))
      .orderBy(desc(accessContractAcceptancesTable.createdAt)).limit(20),
  ]);
  res.json({ license: serialize(license), purchases, contracts });
});

router.post("/admin/access-license/tenants/:tenantId/entitlements", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Super admin only." });
  // tenant-audit: reviewed cross-tenant entitlement grant is restricted to authenticated super_admin
  const tenantId = String(req.params.tenantId);
  const parsed = z.object({
    commercialKey: z.string().trim().min(3).max(120),
    source: z.enum(["free", "subscription", "module", "manual", "promotion"]).default("manual"),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    note: z.string().trim().max(500).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Entitlement inválido.", issues: parsed.error.issues });

  const [[tenant], [product]] = await Promise.all([
    db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    db.select({
      commercialKey: commercialProductProfilesTable.commercialKey,
      active: commercialProductProfilesTable.active,
      offerKind: commercialProductProfilesTable.offerKind,
    })
      .from(commercialProductProfilesTable)
      .where(eq(commercialProductProfilesTable.commercialKey, parsed.data.commercialKey))
      .limit(1),
  ]);
  if (!tenant) return res.status(404).json({ error: "Tenant não encontrado." });
  if (!product || !product.active) return res.status(404).json({ error: "Produto comercial não encontrado ou inativo." });
  if (["service", "prepaid_pass", "consumption_pack"].includes(product.offerKind)) {
    return res.status(422).json({
      error: "Esta oferta não pode ser liberada como entitlement manual.",
      code: "OFFER_IS_NOT_RUNTIME_ENTITLEMENT",
    });
  }

  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date();
  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (endsAt && endsAt <= startsAt) return res.status(422).json({ error: "A data final precisa ser posterior ao início." });

  const [created] = await db.transaction(async (tx) => {
    await tx.update(tenantEntitlementsTable)
      .set({ active: false, updatedAt: new Date() })
      .where(and(
        eq(tenantEntitlementsTable.tenantId, tenantId),
        eq(tenantEntitlementsTable.commercialKey, parsed.data.commercialKey),
        eq(tenantEntitlementsTable.source, parsed.data.source),
        eq(tenantEntitlementsTable.active, true),
      ));

    return tx.insert(tenantEntitlementsTable).values({
      tenantId,
      commercialKey: parsed.data.commercialKey,
      source: parsed.data.source,
      startsAt,
      endsAt,
      active: true,
      metadata: {
        adminGranted: true,
        note: parsed.data.note || undefined,
      },
    }).returning();
  });

  return res.status(201).json(created);
});

router.delete("/admin/access-license/tenants/:tenantId/entitlements/:entitlementId", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Super admin only." });
  // tenant-audit: reviewed cross-tenant entitlement revoke is restricted to authenticated super_admin
  const tenantId = String(req.params.tenantId);
  const entitlementId = String(req.params.entitlementId);
  const [updated] = await db.update(tenantEntitlementsTable)
    .set({ active: false, updatedAt: new Date() })
    .where(and(
      eq(tenantEntitlementsTable.id, entitlementId),
      eq(tenantEntitlementsTable.tenantId, tenantId),
      eq(tenantEntitlementsTable.active, true),
    ))
    .returning();
  if (!updated) return res.status(404).json({ error: "Entitlement ativo não encontrado." });
  return res.json({ revoked: true, entitlement: updated });
});

router.post("/admin/access-license/enroll", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") { res.status(403).json({ error: "Super admin only." }); return; }
  const parsed = z.object({ tenantIds: z.array(z.string().min(1)).min(1).max(500) }).safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: "Lista de tenants inválida." }); return; }
  const rows = await db.insert(accessLicensesTable).values(parsed.data.tenantIds.map((tenantId) => ({
    tenantId, mode: "prepaid" as const, status: "read_only" as const,
  }))).onConflictDoNothing().returning();
  res.json({ enrolled: rows.length });
});

router.post("/admin/access-license/contracts/:id/activate", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") { res.status(403).json({ error: "Super admin only." }); return; }
  const [contract] = await db.select().from(accessContractAcceptancesTable)
    .where(eq(accessContractAcceptancesTable.id, String(req.params.id)));
  if (!contract || !contract.accepted) { res.status(404).json({ error: "Contrato não encontrado." }); return; }
  const now = new Date();
  const annualEndsAt = new Date(now);
  annualEndsAt.setUTCFullYear(annualEndsAt.getUTCFullYear() + 1);
  await db.transaction(async (tx) => {
    await tx.update(accessContractAcceptancesTable).set({ status: "active", updatedAt: now })
      .where(eq(accessContractAcceptancesTable.id, contract.id));
    await tx.update(accessLicensesTable).set({
      mode: "annual", status: "active", annualStartsAt: now, annualEndsAt,
      accessEndsAt: annualEndsAt, updatedAt: now,
    }).where(eq(accessLicensesTable.tenantId, contract.tenantId));
  });
  res.json({ active: true, annualEndsAt });
});

accessLicensePublicRouter.post("/internal/access-license/reminders", async (req, res) => {
  const configured = process.env.CRON_SECRET ?? "";
  const received = String(req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!configured || !safeEqual(received, configured)) { res.status(401).json({ error: "Invalid cron token." }); return; }
  res.json(await runAccessLicenseReminders());
});

accessLicensePublicRouter.post("/webhooks/asaas/access-license", async (req, res) => {
  const configured = process.env.ASAAS_WEBHOOK_TOKEN ?? "";
  const received = String(req.get("asaas-access-token") ?? req.get("x-asaas-access-token") ?? "");
  if (!configured || !safeEqual(received, configured)) { res.status(401).json({ error: "Invalid webhook token." }); return; }

  const event = String(req.body?.event ?? "");
  const payment = req.body?.payment;
  const reference = String(payment?.externalReference ?? "");
  const match = /^access_pass:([^:]+):([^:]+)$/.exec(reference);
  if (!match) { res.status(202).json({ ignored: true }); return; }
  const [, tenantId, purchaseId] = match;

  if (["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(event)) {
    await db.transaction(async (tx) => {
      const [purchase] = await tx.select().from(accessPassPurchasesTable)
        .where(and(eq(accessPassPurchasesTable.id, purchaseId!), eq(accessPassPurchasesTable.tenantId, tenantId!)))
        .for("update");
      if (!purchase || purchase.status === "paid") return;
      const grant = await grantPaidPassInTransaction(tx, tenantId!);
      await tx.update(accessPassPurchasesTable).set({
        status: "paid", paidAt: new Date(), accessStartsAt: grant.startsAt,
        accessEndsAt: grant.endsAt, updatedAt: new Date(),
      }).where(eq(accessPassPurchasesTable.id, purchase.id));
    });
  } else if (["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"].includes(event)) {
    await db.update(accessPassPurchasesTable).set({
      status: event === "PAYMENT_REFUNDED" ? "refunded" : "chargeback",
      updatedAt: new Date(),
    }).where(eq(accessPassPurchasesTable.id, purchaseId!));
  }
  res.json({ received: true });
});

export default router;
