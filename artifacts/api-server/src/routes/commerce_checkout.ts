import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import {
  billingEventsTable,
  commerceCheckoutSessionsTable,
  db,
  generatedSitesTable,
  plansTable,
  subscriptionsTable,
  tenantsTable,
  usersTable,
  type SiteGeneratorConfig,
} from "@workspace/db";
import { createCharge, createOrGetCustomer, findChargeByExternalReference, isAsaasConfigured } from "../lib/asaas.js";
import { resolveLandingOffer } from "../lib/landing-offer.js";

export const commerceCheckoutRouter: IRouter = Router();

const checkoutSchema = z.object({
  siteSlug: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2).max(180),
  companyName: z.string().trim().min(2).max(180),
  email: z.email(),
  password: z.string().min(8).max(120),
  phone: z.string().trim().max(40).optional(),
  cpfCnpj: z.string().trim().max(24).optional(),
  billingType: z.enum(["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"]).default("UNDEFINED"),
  couponCode: z.string().trim().max(80).optional(),
  partnerCode: z.string().trim().max(120).optional(),
  utmSource: z.string().trim().max(500).optional(),
  utmMedium: z.string().trim().max(500).optional(),
  utmCampaign: z.string().trim().max(500).optional(),
  utmContent: z.string().trim().max(500).optional(),
  utmTerm: z.string().trim().max(500).optional(),
  gclid: z.string().trim().max(500).optional(),
  fbclid: z.string().trim().max(500).optional(),
  pageUrl: z.string().trim().max(2000).optional(),
  referrer: z.string().trim().max(2000).optional(),
  acceptTerms: z.literal(true),
});

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function plusBillingCycle(from: Date, cycle: "monthly" | "annual"): Date {
  const next = new Date(from);
  if (cycle === "annual") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function plusPromoCycles(from: Date, cycle: "monthly" | "annual", count: number): Date | null {
  if (count <= 0) return null;
  const next = new Date(from);
  if (cycle === "annual") next.setFullYear(next.getFullYear() + count);
  else next.setMonth(next.getMonth() + count);
  return next;
}

function cycleKey(subscriptionId: string, date: Date): string {
  return `subscription:${subscriptionId}:${date.toISOString().slice(0, 7)}`;
}

function subscriptionPlan(value: string): "start" | "starter" | "growth" | "pme_plus" | "enterprise" | null {
  return (["start", "starter", "growth", "pme_plus", "enterprise"] as const).find((item) => item === value) ?? null;
}

function safeSlug(value: string): string {
  const base = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "cliente";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

async function resolveSiteOffer(siteSlug: string) {
  const [site] = await db
    .select({ id: generatedSitesTable.id, siteSlug: generatedSitesTable.siteSlug, published: generatedSitesTable.published, config: generatedSitesTable.config })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.siteSlug, siteSlug))
    .limit(1);
  if (!site || !site.published) return null;

  const config = (site.config ?? {}) as SiteGeneratorConfig;
  const configuredPlanSlug = config.commerceOffer?.planSlug || "starter";
  const [plan] = await db
    .select()
    .from(plansTable)
    .where(and(eq(plansTable.slug, configuredPlanSlug), eq(plansTable.isActive, true)))
    .limit(1);
  if (!plan) return { site, config, plan: null, offer: null };

  const offer = resolveLandingOffer({
    offer: config.commerceOffer,
    catalogMonthlyPriceCents: Number(plan.monthlyPriceCents ?? 0),
    catalogAnnualMonthlyPriceCents: plan.monthlyPriceAnnualCents,
    fallbackPlanSlug: plan.slug,
  });
  return { site, config, plan, offer };
}

commerceCheckoutRouter.get("/public/commerce/offer/:siteSlug", async (req, res) => {
  const resolved = await resolveSiteOffer(String(req.params.siteSlug));
  if (!resolved?.plan || !resolved.offer?.valid) {
    res.status(404).json({ error: "Oferta indisponível" });
    return;
  }
  res.json({
    siteSlug: resolved.site.siteSlug,
    plan: { slug: resolved.plan.slug, name: resolved.plan.name },
    offer: resolved.offer,
  });
});

commerceCheckoutRouter.post("/public/commerce/checkout", async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Dados de checkout inválidos", details: parsed.error.issues });
    return;
  }
  if (!(await isAsaasConfigured())) {
    res.status(503).json({ error: "Checkout temporariamente indisponível" });
    return;
  }

  const d = parsed.data;
  const resolved = await resolveSiteOffer(d.siteSlug);
  if (!resolved?.plan || !resolved.offer?.valid) {
    res.status(409).json({ error: "A oferta desta página não está disponível" });
    return;
  }
  if (d.couponCode && !resolved.offer.couponsAllowed) {
    res.status(409).json({ error: "Esta oferta não permite cupom" });
    return;
  }
  if (d.partnerCode && !resolved.offer.partnerRulesAllowed) {
    res.status(409).json({ error: "Esta oferta não permite regra de parceiro" });
    return;
  }

  const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, d.email.toLowerCase())).limit(1);
  if (existingUser) {
    res.status(409).json({ error: "Este e-mail já possui acesso. Entre na sua conta para alterar o plano." });
    return;
  }

  const passwordHash = await bcrypt.hash(d.password, 12);
  const snapshot = {
    source: resolved.offer.source,
    offerCode: resolved.offer.offerCode,
    planSlug: resolved.offer.planSlug,
    vertical: resolved.offer.vertical,
    billingCycle: resolved.offer.billingCycle,
    chargePriceCents: resolved.offer.chargePriceCents,
    originalPriceCents: resolved.offer.originalPriceCents,
    renewalPriceCents: resolved.offer.renewalPriceCents,
    promotionalCycles: resolved.offer.promotionalCycles,
    couponsAllowed: resolved.offer.couponsAllowed,
    partnerRulesAllowed: resolved.offer.partnerRulesAllowed,
    resolvedAt: new Date().toISOString(),
  } as const;

  const [session] = await db.insert(commerceCheckoutSessionsTable).values({
    siteId: resolved.site.id,
    siteSlug: d.siteSlug,
    planId: resolved.plan.id,
    offerSnapshot: snapshot,
    attribution: {
      utmSource: d.utmSource ?? null,
      utmMedium: d.utmMedium ?? null,
      utmCampaign: d.utmCampaign ?? null,
      utmContent: d.utmContent ?? null,
      utmTerm: d.utmTerm ?? null,
      gclid: d.gclid ?? null,
      fbclid: d.fbclid ?? null,
      referrer: d.referrer ?? req.get("referer") ?? null,
      pageUrl: d.pageUrl ?? null,
      couponCode: d.couponCode ?? null,
      partnerCode: d.partnerCode ?? null,
    },
    customerName: d.name,
    companyName: d.companyName,
    email: d.email.toLowerCase(),
    phone: d.phone ?? null,
    cpfCnpj: d.cpfCnpj ?? null,
    passwordHash,
    billingType: d.billingType,
  }).returning();

  const externalReference = `checkout:${session.id}`;
  try {
    const customer = await createOrGetCustomer({ name: d.companyName, email: d.email.toLowerCase(), cpfCnpj: d.cpfCnpj, phone: d.phone });
    const recovered = await findChargeByExternalReference(externalReference).catch(() => null);
    const charge = recovered ?? await createCharge({
      customer: customer.id,
      billingType: d.billingType,
      value: resolved.offer.chargePriceCents / 100,
      dueDate: new Date().toISOString().slice(0, 10),
      description: `VendorAI ${resolved.plan.name}${resolved.offer.vertical ? ` · ${resolved.offer.vertical}` : ""}`,
      externalReference,
    });

    await db.update(commerceCheckoutSessionsTable).set({
      status: "payment_pending",
      asaasCustomerId: customer.id,
      asaasChargeId: charge.id,
      paymentUrl: charge.invoiceUrl || charge.bankSlipUrl,
      updatedAt: new Date(),
    }).where(eq(commerceCheckoutSessionsTable.id, session.id));

    res.status(201).json({
      checkoutId: session.id,
      status: "payment_pending",
      paymentUrl: charge.invoiceUrl || charge.bankSlipUrl,
      price: { chargePriceCents: snapshot.chargePriceCents, originalPriceCents: snapshot.originalPriceCents, renewalPriceCents: snapshot.renewalPriceCents, source: snapshot.source },
      plan: { slug: resolved.plan.slug, name: resolved.plan.name },
      vertical: snapshot.vertical,
    });
  } catch (err) {
    await db.update(commerceCheckoutSessionsTable).set({ status: "failed", errorCode: "asaas_checkout_failed", updatedAt: new Date() }).where(eq(commerceCheckoutSessionsTable.id, session.id));
    req.log.error({ err, checkoutId: session.id }, "commerce checkout: Asaas charge failed");
    res.status(502).json({ error: "Não foi possível iniciar o pagamento. Tente novamente." });
  }
});

commerceCheckoutRouter.get("/public/commerce/checkout/:id/status", async (req, res) => {
  const [session] = await db.select({
    id: commerceCheckoutSessionsTable.id,
    status: commerceCheckoutSessionsTable.status,
    paymentUrl: commerceCheckoutSessionsTable.paymentUrl,
    provisionedTenantId: commerceCheckoutSessionsTable.provisionedTenantId,
  }).from(commerceCheckoutSessionsTable).where(eq(commerceCheckoutSessionsTable.id, String(req.params.id))).limit(1);
  if (!session) return res.status(404).json({ error: "Checkout não encontrado" });
  res.json(session);
});

export async function provisionCheckout(checkoutId: string, paymentId: string) {
  const [session] = await db.select().from(commerceCheckoutSessionsTable).where(eq(commerceCheckoutSessionsTable.id, checkoutId)).limit(1);
  if (!session) return { handled: false as const };
  if (session.status === "provisioned" && session.provisionedTenantId) return { handled: true as const, tenantId: session.provisionedTenantId, idempotent: true };

  const planSlug = subscriptionPlan(session.offerSnapshot.planSlug);
  if (!planSlug) throw new Error(`Unsupported subscription plan: ${session.offerSnapshot.planSlug}`);
  const now = new Date();
  const monthlyEquivalentCents = session.offerSnapshot.billingCycle === "annual" ? Math.round(session.offerSnapshot.chargePriceCents / 12) : session.offerSnapshot.chargePriceCents;
  const renewalMonthlyEquivalentCents = session.offerSnapshot.billingCycle === "annual" ? Math.round(session.offerSnapshot.renewalPriceCents / 12) : session.offerSnapshot.renewalPriceCents;

  const [existingUser] = await db.select({ id: usersTable.id, tenantId: usersTable.tenantId }).from(usersTable).where(eq(usersTable.email, session.email)).limit(1);
  if (existingUser) {
    await db.update(commerceCheckoutSessionsTable).set({ status: "failed", errorCode: "email_already_provisioned", updatedAt: now }).where(eq(commerceCheckoutSessionsTable.id, session.id));
    throw new Error("Checkout email was provisioned by another flow");
  }

  const result = await db.transaction(async (tx) => {
    await tx.update(commerceCheckoutSessionsTable).set({ status: "provisioning", paidAt: now, asaasChargeId: paymentId, updatedAt: now }).where(eq(commerceCheckoutSessionsTable.id, session.id));

    const [tenant] = await tx.insert(tenantsTable).values({
      name: session.companyName,
      nomeEmpresa: session.companyName,
      slug: safeSlug(session.companyName),
      subdomainSlug: safeSlug(session.companyName),
      status: "active",
      vertical: session.offerSnapshot.vertical,
      segmento: session.offerSnapshot.vertical,
      planId: session.planId,
      billingCycle: session.offerSnapshot.billingCycle,
      planStartedAt: now,
      provisioningMethod: "self_service",
      onboardingConcluido: false,
      integracoesConcluido: false,
      mensalidadeValor: money(monthlyEquivalentCents),
      mensalidadeTabelaValor: money(renewalMonthlyEquivalentCents),
      formaPagamento: session.billingType === "PIX" ? "pix" : session.billingType === "BOLETO" ? "boleto" : "cartao",
      statusPagamento: "pago",
      ultimoPagamentoEm: now,
      proximoPagamentoEm: plusBillingCycle(now, session.offerSnapshot.billingCycle),
      contratoInicioEm: now,
      renovacaoAutomatica: session.billingType === "CREDIT_CARD",
      origemCliente: `lp:${session.siteSlug}`,
    }).returning({ id: tenantsTable.id });

    await tx.insert(usersTable).values({
      tenantId: tenant.id,
      name: session.customerName,
      email: session.email,
      password: session.passwordHash,
      telefone: session.phone,
      role: "admin",
      platformRole: "tenant_admin",
      userFunction: "administrador",
      active: true,
      forcePasswordReset: false,
    });

    const [subscription] = await tx.insert(subscriptionsTable).values({
      tenantId: tenant.id,
      plano: planSlug,
      valorMensal: money(monthlyEquivalentCents),
      status: "ativa",
      campaignCode: session.offerSnapshot.offerCode || session.attribution.utmCampaign || `lp:${session.siteSlug}`,
      billingPhase: session.offerSnapshot.promotionalCycles > 0 ? "promo_1" : "regular",
      promoPhase1Price: session.offerSnapshot.promotionalCycles > 0 ? money(monthlyEquivalentCents) : null,
      promoPhase1EndsAt: plusPromoCycles(now, session.offerSnapshot.billingCycle, session.offerSnapshot.promotionalCycles),
      regularPriceAtTransition: money(renewalMonthlyEquivalentCents),
      acceptedOfferAt: now,
      acceptedTermsAt: now,
      acceptedTermsVersion: "self-service-checkout-v1-2026-09-10",
      billingProvider: "asaas",
      asaasCustomerId: session.asaasCustomerId,
      dataInicio: now,
      proximaCobranca: plusBillingCycle(now, session.offerSnapshot.billingCycle),
    }).returning({ id: subscriptionsTable.id });

    await tx.insert(billingEventsTable).values({
      tenantId: tenant.id,
      mes: cycleKey(subscription.id, now),
      amount: money(session.offerSnapshot.chargePriceCents),
      status: "paid",
      asaasChargeId: paymentId,
      dueDate: now,
      paidAt: now,
    });

    await tx.update(commerceCheckoutSessionsTable).set({ status: "provisioned", provisionedTenantId: tenant.id, provisionedAt: now, paidAt: now, errorCode: null, updatedAt: now }).where(eq(commerceCheckoutSessionsTable.id, session.id));
    return { tenantId: tenant.id, subscriptionId: subscription.id };
  });

  return { handled: true as const, ...result, idempotent: false };
}
