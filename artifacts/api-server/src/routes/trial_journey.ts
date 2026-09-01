import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  dealsTable,
  leadEventsTable,
  leadsTable,
  notificationsTable,
  tenantsTable,
} from "@workspace/db";

const router: IRouter = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function getVendorTrialLead(trialTenantId: string) {
  const [vendorai] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, "vendorai"))
    .limit(1);
  if (!vendorai) return { vendoraiId: null, lead: null };

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
      eq(leadsTable.source, "trial_signup"),
      sql`${leadsTable.discoveryData}->>'trialTenantId' = ${trialTenantId}`,
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
  const isTrial = tenant.isDemo && tenant.provisioningMethod === "trial";
  if (!isTrial) return res.json({ isTrial: false });

  const now = new Date();
  const expiresAt = tenant.demoExpiresAt;
  const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS)) : 0;
  const day = Math.min(5, Math.max(1, Math.floor((now.getTime() - tenant.createdAt.getTime()) / DAY_MS) + 1));
  const { lead } = await getVendorTrialLead(tenantId);
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

router.post("/trial/request-upgrade", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Tenant não identificado." });

  const [tenant] = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name, isDemo: tenantsTable.isDemo, provisioningMethod: tenantsTable.provisioningMethod })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  if (!tenant || !tenant.isDemo || tenant.provisioningMethod !== "trial") {
    return res.status(400).json({ error: "Esta conta não é um trial elegível." });
  }

  const { vendoraiId, lead } = await getVendorTrialLead(tenantId);
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
