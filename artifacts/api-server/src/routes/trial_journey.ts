import { Router, type IRouter } from "express";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  accessLicensesTable,
  db,
  dealsTable,
  leadEventsTable,
  leadsTable,
  notificationsTable,
  plansTable,
  tenantsTable,
} from "@workspace/db";
import { ensureVendorAiLaunchSubscription } from "../lib/vendorai-subscription-lifecycle.js";
import { brazilMonthKey } from "../services/accessLicense.js";

const router: IRouter = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

type TrialPlanMode = "subscription" | "periods";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function isTrialTenant(tenant: { isDemo: boolean; provisioningMethod: string | null }) {
  // Compatibilidade com trials criados antes de provisioningMethod="trial".
  // O cadastro público atual já cria isDemo=true + expiração de 5 dias.
  return tenant.isDemo && (tenant.provisioningMethod === "trial" || tenant.provisioningMethod == null);
}

async function getVendorTrialLead(trialTenantId: string, email?: string) {
  const [vendorai] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, "vendorai"))
    .limit(1);
  if (!vendorai) return { vendoraiId: null, lead: null };

  // O vínculo oficial é trialTenantId. Não dependemos mais de source porque
  // source pode representar a origem real de aquisição antes do trial.
  const linkedTrial = sql`${leadsTable.discoveryData}->>'trialTenantId' = ${trialTenantId}`;
  const legacyDemo = email
    ? and(eq(leadsTable.source, "demo_signup"), eq(leadsTable.email, email))
    : undefined;

  const [lead] = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      empresa: leadsTable.empresa,
      discoveryData: leadsTable.discoveryData,
      proximaAcao: leadsTable.proximaAcao,
    })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.tenantId, vendorai.id),
      legacyDemo ? or(linkedTrial, legacyDemo) : linkedTrial,
    ))
    .orderBy(desc(leadsTable.createdAt))
    .limit(1);

  return { vendoraiId: vendorai.id, lead: lead ?? null };
}

router.get("/trial/status", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Tenant não identificado." });

  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      status: tenantsTable.status,
      isDemo: tenantsTable.isDemo,
      provisioningMethod: tenantsTable.provisioningMethod,
      demoExpiresAt: tenantsTable.demoExpiresAt,
      createdAt: tenantsTable.createdAt,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) return res.status(404).json({ error: "Tenant não encontrado." });
  if (!isTrialTenant(tenant)) return res.json({ isTrial: false });

  const now = new Date();
  const expiresAt = tenant.demoExpiresAt;
  const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS)) : 0;
  const day = Math.min(5, Math.max(1, Math.floor((now.getTime() - tenant.createdAt.getTime()) / DAY_MS) + 1));
  const { lead } = await getVendorTrialLead(tenantId, req.user?.email);
  const discovery = asRecord(lead?.discoveryData);
  const journey = asRecord(discovery["trialJourney"]);

  const [upgradeEvent] = lead
    ? await db
        .select({ id: leadEventsTable.id, createdAt: leadEventsTable.createdAt })
        .from(leadEventsTable)
        .where(and(eq(leadEventsTable.leadId, lead.id), eq(leadEventsTable.tipo, "trial_upgrade_requested")))
        .orderBy(desc(leadEventsTable.createdAt))
        .limit(1)
    : [];

  return res.json({
    isTrial: true,
    status: tenant.status,
    companyName: tenant.name,
    day,
    daysRemaining,
    expiresAt: expiresAt?.toISOString() ?? null,
    score: Number(journey["score"] ?? 0),
    tier: typeof journey["tier"] === "string" ? journey["tier"] : "baixo",
    nextAction: typeof journey["nextAction"] === "string" ? journey["nextAction"] : "Concluir o onboarding e colocar o primeiro lead real no VendorAI.",
    milestones: {
      firstLogin: journey["firstLogin"] === true,
      onboardingComplete: journey["onboardingComplete"] === true,
      integrationsComplete: journey["integrationsComplete"] === true,
      realLeads: Number(journey["realLeads"] ?? 0),
      messages: Number(journey["messages"] ?? 0),
      deals: Number(journey["deals"] ?? 0),
    },
    upgradeRequested: Boolean(upgradeEvent),
    upgradeRequestedAt: upgradeEvent?.createdAt?.toISOString() ?? null,
  });
});

/**
 * Escolha comercial self-service exibida imediatamente após o primeiro agente.
 * O trial já está ativo; esta chamada apenas registra como o cliente quer
 * continuar quando o período gratuito terminar, preservando o mesmo tenant.
 */
router.post("/trial/select-plan", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Tenant não identificado." });

  const mode = String(req.body?.mode ?? "") as TrialPlanMode;
  if (mode !== "subscription" && mode !== "periods") {
    return res.status(422).json({ error: "Modalidade de plano inválida." });
  }

  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      isDemo: tenantsTable.isDemo,
      provisioningMethod: tenantsTable.provisioningMethod,
      demoExpiresAt: tenantsTable.demoExpiresAt,
      createdAt: tenantsTable.createdAt,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant || !isTrialTenant(tenant)) {
    return res.status(400).json({ error: "Esta conta não é um trial elegível." });
  }

  const [growthPlan] = await db
    .select({ id: plansTable.id, slug: plansTable.slug })
    .from(plansTable)
    .where(and(eq(plansTable.slug, "growth"), eq(plansTable.isActive, true)))
    .limit(1);
  if (!growthPlan) {
    return res.status(409).json({ error: "Plano Growth indisponível no momento." });
  }

  const { vendoraiId, lead } = await getVendorTrialLead(tenantId, req.user?.email);
  if (!vendoraiId || !lead) {
    return res.status(404).json({ error: "Cadastro comercial do trial não encontrado." });
  }

  const [deal] = await db
    .select({ id: dealsTable.id })
    .from(dealsTable)
    .where(and(eq(dealsTable.tenantId, vendoraiId), eq(dealsTable.leadId, lead.id)))
    .orderBy(desc(dealsTable.createdAt))
    .limit(1);
  if (!deal) return res.status(404).json({ error: "Oportunidade comercial do trial não encontrada." });

  const now = new Date();
  const accessEndsAt = tenant.demoExpiresAt ?? new Date(tenant.createdAt.getTime() + 5 * DAY_MS);

  if (mode === "subscription") {
    await db.update(dealsTable).set({
      planoContratado: "growth",
      probabilidade: 95,
      updatedAt: now,
    }).where(eq(dealsTable.id, deal.id));

    await ensureVendorAiLaunchSubscription({
      tenantId,
      dealId: deal.id,
      planSlug: "growth",
      trialStartedAt: tenant.createdAt,
    });
  } else {
    // Growth por períodos não deve virar assinatura contínua pelo job de
    // lifecycle. O acesso pago posterior é controlado por access_licenses.
    await db.update(dealsTable).set({
      planoContratado: null,
      probabilidade: 95,
      updatedAt: now,
    }).where(eq(dealsTable.id, deal.id));

    await db.insert(accessLicensesTable).values({
      tenantId,
      mode: "prepaid",
      status: "active",
      accessEndsAt,
      freeBenefitMonth: brazilMonthKey(now),
      freeActivatedAt: tenant.createdAt,
      freeEndsAt: accessEndsAt,
    }).onConflictDoUpdate({
      target: accessLicensesTable.tenantId,
      set: {
        mode: "prepaid",
        status: "active",
        accessEndsAt,
        freeBenefitMonth: brazilMonthKey(now),
        freeActivatedAt: tenant.createdAt,
        freeEndsAt: accessEndsAt,
        reminderStage: 0,
        reminderSentAt: null,
        updatedAt: now,
      },
    });
  }

  await db.update(tenantsTable).set({
    planId: growthPlan.id,
    billingCycle: "monthly",
    updatedAt: now,
  }).where(eq(tenantsTable.id, tenantId));

  const currentDiscovery = asRecord(lead.discoveryData);
  await db.update(leadsTable).set({
    discoveryData: {
      ...currentDiscovery,
      selectedAccessMode: mode,
      selectedPlanSlug: "growth",
      planSelectedAt: now.toISOString(),
    },
    proximaAcao: mode === "subscription"
      ? "Cliente escolheu Growth mensal no onboarding. Acompanhar ativação e primeira cobrança após o trial."
      : "Cliente escolheu Growth por períodos no onboarding. Acompanhar uso e oferta de novos blocos quando necessário.",
    updatedAt: now,
  }).where(eq(leadsTable.id, lead.id));

  await db.insert(leadEventsTable).values({
    leadId: lead.id,
    tipo: "trial_plan_selected",
    descricao: mode === "subscription"
      ? "Cliente escolheu Growth mensal no onboarding."
      : "Cliente escolheu Growth por períodos no onboarding.",
    scoreBoost: 20,
    notifiedAt: now,
  });

  return res.json({
    ok: true,
    mode,
    planSlug: "growth",
    accessEndsAt: accessEndsAt.toISOString(),
  });
});

router.post("/trial/request-upgrade", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Tenant não identificado." });

  const [tenant] = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name, isDemo: tenantsTable.isDemo, provisioningMethod: tenantsTable.provisioningMethod })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  if (!tenant || !isTrialTenant(tenant)) {
    return res.status(400).json({ error: "Esta conta não é um trial elegível." });
  }

  const { vendoraiId, lead } = await getVendorTrialLead(tenantId, req.user?.email);
  if (!vendoraiId || !lead) return res.status(404).json({ error: "Lead comercial do trial não encontrado." });

  const [existing] = await db
    .select({ id: leadEventsTable.id, createdAt: leadEventsTable.createdAt })
    .from(leadEventsTable)
    .where(and(eq(leadEventsTable.leadId, lead.id), eq(leadEventsTable.tipo, "trial_upgrade_requested")))
    .orderBy(desc(leadEventsTable.createdAt))
    .limit(1);
  if (existing) {
    return res.json({ ok: true, alreadyRequested: true, requestedAt: existing.createdAt });
  }

  const discovery = asRecord(lead.discoveryData);
  const journey = asRecord(discovery["trialJourney"]);
  const score = Number(journey["score"] ?? 0);

  await db.insert(leadEventsTable).values({
    leadId: lead.id,
    tipo: "trial_upgrade_requested",
    descricao: `Cliente solicitou continuidade do trial. Activation Score ${score}/100.`,
    scoreBoost: 30,
    notifiedAt: new Date(),
  });
  await db.insert(notificationsTable).values({
    tenantId: vendoraiId,
    type: "warning",
    category: "trial_upgrade_requested",
    title: `Trial pediu continuidade — ${lead.empresa || tenant.name}`,
    message: `O cliente solicitou continuidade pelo próprio painel. Activation Score ${score}/100. Priorizar contato, plano e fechamento preservando o tenant ${tenant.id}.`,
  });
  await db.update(leadsTable).set({
    proximaAcao: "Cliente solicitou continuidade do trial: entrar em contato para plano/fechamento e preservar o tenant atual.",
    updatedAt: new Date(),
  }).where(eq(leadsTable.id, lead.id));

  const [deal] = await db
    .select({ id: dealsTable.id, probabilidade: dealsTable.probabilidade })
    .from(dealsTable)
    .where(and(eq(dealsTable.tenantId, vendoraiId), eq(dealsTable.leadId, lead.id)))
    .orderBy(desc(dealsTable.createdAt))
    .limit(1);
  if (deal && Number(deal.probabilidade ?? 0) < 90) {
    await db.update(dealsTable).set({ probabilidade: 90, updatedAt: new Date() }).where(eq(dealsTable.id, deal.id));
  }

  return res.json({ ok: true, alreadyRequested: false });
});

export default router;
