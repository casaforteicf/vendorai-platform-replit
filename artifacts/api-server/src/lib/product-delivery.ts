/**
 * Auto-delivery engine for SKU-based purchases.
 * Triggered after Asaas PAYMENT_CONFIRMED for charges with externalReference = sku_delivery:<propostaId>
 */
import { eq, and, sql } from "drizzle-orm";
import { slugify } from "./subdomain.js";
import {
  db,
  propostasTable,
  tenantsTable,
  leadsTable,
  activitiesTable,
  notificationsTable,
  agentConfigsTable,
  plansTable,
  planModulesTable,
} from "@workspace/db";
import { logger } from "./logger.js";

// ── SKU lookup maps ──────────────────────────────────────────────────────────

const SKU_PLAN_MAP: Record<string, { planSlug: string; cycle: "monthly" | "annual" }> = {
  "PLAN-GROWTH-M":  { planSlug: "growth",     cycle: "monthly" },
  "PLAN-GROWTH-A":  { planSlug: "growth",     cycle: "annual"  },
  "PLAN-PMEMAIS-M": { planSlug: "pme_plus",   cycle: "monthly" },
  "PLAN-PMEMAIS-A": { planSlug: "pme_plus",   cycle: "annual"  },
  "PLAN-ENT-M":     { planSlug: "enterprise", cycle: "monthly" },
  "PLAN-ENT-A":     { planSlug: "enterprise", cycle: "annual"  },
};

const SKU_SETUP_LABEL: Record<string, string> = {
  "SETUP-GROWTH":  "Growth",
  "SETUP-PMEMAIS": "PME+",
  "SETUP-ENT":     "Enterprise",
};

const SKU_USER_ADD = new Set(["USER-ADD-GROWTH", "USER-ADD-PMEMAIS", "USER-ADD-ENT"]);

const SKU_AI_CREDITS: Record<string, number> = {
  "AI-CREDITS-25":  25,
  "AI-CREDITS-50":  50,
  "AI-CREDITS-100": 100,
};

// ── Public entry point ────────────────────────────────────────────────────────

export async function dispatchSkuDelivery(propostaId: string): Promise<void> {
  const log = logger.child({ propostaId, fn: "dispatchSkuDelivery" });

  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, propostaId))
    .limit(1);

  if (!proposta) {
    log.warn("SKU delivery: proposta not found");
    return;
  }

  const itens = (proposta.itens ?? []) as Array<{
    nome: string; quantidade: number; valorUnitario: number; sku?: string;
  }>;
  const skus = itens.map((i) => i.sku).filter((s): s is string => !!s);

  if (skus.length === 0) {
    log.info("SKU delivery: no SKUs in proposta itens — skipping");
    return;
  }

  log.info({ skus, tenantId: proposta.tenantId }, "SKU delivery: dispatching");

  for (const sku of skus) {
    try {
      if (SKU_PLAN_MAP[sku]) {
        await deliverPlan(proposta, sku, SKU_PLAN_MAP[sku]!, log as any);
      } else if (SKU_SETUP_LABEL[sku]) {
        await deliverSetup(proposta, sku, log as any);
      } else if (SKU_USER_ADD.has(sku)) {
        await deliverExtraUser(proposta, sku, log as any);
      } else if (SKU_AI_CREDITS[sku] !== undefined) {
        await deliverAiCredits(proposta, sku, SKU_AI_CREDITS[sku]!, log as any);
      } else {
        log.warn({ sku }, "SKU delivery: unknown SKU — no handler registered");
      }
    } catch (err) {
      log.error({ err, sku }, "SKU delivery: unhandled error for SKU");
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchUsdBrlRate(): Promise<number> {
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, { bid?: string }>;
    const bid = parseFloat(data["USDBRL"]?.bid ?? "0");
    return bid > 0 ? bid : 5.5;
  } catch {
    return 5.5;
  }
}

// ── PLAN-* delivery ───────────────────────────────────────────────────────────

async function deliverPlan(
  proposta: typeof propostasTable.$inferSelect,
  sku: string,
  planInfo: { planSlug: string; cycle: "monthly" | "annual" },
  log: ReturnType<typeof logger.child>
) {
  const [plan] = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.slug, planInfo.planSlug))
    .limit(1);

  if (!plan) {
    log.error({ sku, planSlug: planInfo.planSlug }, "SKU delivery: plan slug not found in DB");
    return;
  }

  const lead = proposta.leadId
    ? (await db.select().from(leadsTable).where(eq(leadsTable.id, proposta.leadId)).limit(1))[0]
    : null;

  const tenantName: string = (lead as any)?.empresa || (lead as any)?.nome || "Novo Cliente";
  const adminEmail: string | null = (lead as any)?.email ?? null;

  // Check if tenant already on this plan (idempotency via existing tenant name)
  const [existingTenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.name, tenantName))
    .limit(1);

  if (existingTenant) {
    await db
      .update(tenantsTable)
      .set({ planId: plan.id, status: "active", updatedAt: new Date() })
      .where(eq(tenantsTable.id, existingTenant.id));
    log.info({ tenantId: existingTenant.id, sku }, "SKU delivery: existing tenant upgraded to new plan");
    return;
  }

  // Provision new tenant
  const [newTenant] = await db
    .insert(tenantsTable)
    .values({
      name: tenantName,
      slug: `${slugify(tenantName)}-${Date.now().toString(36).slice(-6)}`,
      planId: plan.id,
      status: "active",
      monthlyTokenLimit: plan.aiQuotaUsd
        ? Math.round(Number(plan.aiQuotaUsd) * 750_000)
        : null,
    })
    .returning();

  log.info(
    { newTenantId: newTenant.id, planSlug: planInfo.planSlug, cycle: planInfo.cycle, sku },
    "SKU delivery: tenant provisioned"
  );

  // Activate onboarding agent if the plan includes it
  const [onboardingMod] = await db
    .select({ id: planModulesTable.id })
    .from(planModulesTable)
    .where(
      and(
        eq(planModulesTable.planId, plan.id),
        eq(planModulesTable.moduleKey, "agent_onboarding")
      )
    )
    .limit(1);

  if (onboardingMod) {
    // setupCompletedAt/autonomyEnabledAt setados na criação -- ver
    // comentário em agent_configs.ts (rota POST /agent-configs) pro
    // contexto completo: a tela que deveria fazer isso manualmente
    // nunca teve botão conectado no frontend.
    const now = new Date();
    await db
      .insert(agentConfigsTable)
      .values({
        tenantId: newTenant.id,
        agents: { onboarding: { enabled: true } },
        dailyMessageLimit: 100,
        monthlyTokenLimit: plan.aiQuotaUsd
          ? Math.round(Number(plan.aiQuotaUsd) * 750_000)
          : 26_250_000,
        setupCompletedAt: now,
        autonomyEnabledAt: now,
      })
      .onConflictDoUpdate({
        target: agentConfigsTable.tenantId,
        set: {
          agents: sql`agent_configs.agents || '{"onboarding":{"enabled":true}}'::jsonb`,
          updatedAt: new Date(),
        },
      });
    log.info({ tenantId: newTenant.id }, "SKU delivery: onboarding agent activated");
  }

  // TODO: Send welcome email via Resend to adminEmail
  if (adminEmail) {
    log.info(
      { tenantId: newTenant.id, adminEmail },
      "SKU delivery: welcome email pending (Resend not yet integrated)"
    );
  }
}

// ── SETUP-* delivery ──────────────────────────────────────────────────────────

async function deliverSetup(
  proposta: typeof propostasTable.$inferSelect,
  sku: string,
  log: ReturnType<typeof logger.child>
) {
  if (!proposta.leadId) {
    log.warn({ sku }, "SKU delivery: SETUP SKU but proposta has no leadId — cannot create activity");
    return;
  }

  const planLabel = SKU_SETUP_LABEL[sku] ?? sku;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 3);

  await db.insert(activitiesTable).values({
    tenantId: proposta.tenantId,
    leadId: proposta.leadId,
    dealId: proposta.dealId ?? undefined,
    tipo: "tarefa",
    titulo: `Implantação ${planLabel} a realizar`,
    descricao:
      `Cliente adquiriu a implantação ${planLabel} (SKU: ${sku}). ` +
      `Agendar contato para configurar ambiente, canais e agentes conforme SLA do plano.`,
    status: "pendente",
    dataVencimento: dueDate,
  });

  // Notify the selling team via notifications
  await db.insert(notificationsTable).values({
    tenantId: proposta.tenantId,
    title: `Implantação ${planLabel} agendada`,
    message:
      `Proposta ${proposta.numero ?? proposta.id} confirmada. ` +
      `Crie a tarefa de implantação e entre em contato com o cliente em até 3 dias úteis.`,
    type: "info",
    category: "deal_closure",
  });

  log.info({ sku, leadId: proposta.leadId }, "SKU delivery: setup activity + notification created");
}

// ── USER-ADD-* delivery ───────────────────────────────────────────────────────

async function deliverExtraUser(
  proposta: typeof propostasTable.$inferSelect,
  sku: string,
  log: ReturnType<typeof logger.child>
) {
  const [tenant] = await db
    .select({ id: tenantsTable.id, extraUserSlots: tenantsTable.extraUserSlots })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, proposta.tenantId))
    .limit(1);

  if (!tenant) {
    log.warn({ sku, tenantId: proposta.tenantId }, "SKU delivery: tenant not found for USER-ADD");
    return;
  }

  await db
    .update(tenantsTable)
    .set({
      extraUserSlots: sql`extra_user_slots + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tenantsTable.id, proposta.tenantId));

  const newSlots = (tenant.extraUserSlots ?? 0) + 1;
  log.info({ sku, tenantId: proposta.tenantId, newExtraSlots: newSlots }, "SKU delivery: extra user slot added");

  await db.insert(notificationsTable).values({
    tenantId: proposta.tenantId,
    title: "Usuário extra ativado",
    message: `Um slot de usuário extra foi adicionado à sua conta (${sku}). Você agora tem ${newSlots} slot(s) extra(s).`,
    type: "info",
    category: "billing",
  });
}

// ── AI-CREDITS-* delivery ─────────────────────────────────────────────────────

async function deliverAiCredits(
  proposta: typeof propostasTable.$inferSelect,
  sku: string,
  brlValue: number,
  log: ReturnType<typeof logger.child>
) {
  const usdRate = await fetchUsdBrlRate();
  const usdValue = +(brlValue / usdRate).toFixed(6);

  await db
    .update(tenantsTable)
    .set({
      aiCreditsUsd: sql`ai_credits_usd + ${usdValue}`,
      updatedAt: new Date(),
    })
    .where(eq(tenantsTable.id, proposta.tenantId));

  log.info(
    { sku, tenantId: proposta.tenantId, brlValue, usdValue, usdRate },
    "SKU delivery: AI credits added"
  );

  await db.insert(notificationsTable).values({
    tenantId: proposta.tenantId,
    title: "Créditos de IA adicionados",
    message:
      `R$ ${brlValue} em créditos foram adicionados (≈ USD ${usdValue.toFixed(2)} @ R$ ${usdRate.toFixed(2)}/USD). SKU: ${sku}.`,
    type: "info",
    category: "billing",
  });
}
