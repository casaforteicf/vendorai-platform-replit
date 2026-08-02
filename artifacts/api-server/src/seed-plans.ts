import { db, plansTable, planModulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const PLANS = [
  {
    slug: "start",
    name: "Start",
    implantationPriceCents: 0,
    monthlyPriceCents: 0,
    monthlyPriceAnnualCents: 0,
    aiQuotaUsd: "0",
    maxUsers: 2,
    extraUserPriceCents: null,
    isActive: true,
    // Gratuito de propósito — só o essencial pra operar e vender no
    // Praça.ai (Catálogo, Pedidos, Configurações). Sem agentes de IA: o
    // custo desses módulos é coberto pela mensalidade dos planos pagos,
    // não faria sentido no plano grátis. Lojista sobe de plano quando
    // quiser mais ferramentas — nada aqui bloqueia o upgrade.
    modules: [] as string[],
  },
  {
    slug: "starter",
    name: "Starter",
    implantationPriceCents: 300_000,
    monthlyPriceCents: 69_000,
    monthlyPriceAnnualCents: 59_000,
    aiQuotaUsd: "10",
    maxUsers: 5,
    extraUserPriceCents: null,
    isActive: false,
    modules: [] as string[],
  },
  {
    slug: "growth",
    name: "Growth",
    implantationPriceCents: 490_000,
    monthlyPriceCents: 149_000,
    monthlyPriceAnnualCents: 119_000,
    aiQuotaUsd: "20",
    maxUsers: 8,
    extraUserPriceCents: 8_900,
    isActive: true,
    modules: [
      "agent_sdr",
      "agent_closer",
      "agent_followup",
      "agent_reactivation",
      "customer_intelligence",
    ],
  },
  {
    slug: "pme_plus",
    name: "PME+",
    implantationPriceCents: 690_000,
    monthlyPriceCents: 189_000,
    monthlyPriceAnnualCents: 149_000,
    aiQuotaUsd: "35",
    maxUsers: 15,
    extraUserPriceCents: 8_400,
    isActive: true,
    modules: [
      "agent_sdr",
      "agent_closer",
      "agent_followup",
      "agent_reactivation",
      "agent_scheduler",
      "agent_service",
      "agent_onboarding",
      "customer_intelligence",
      "intelligence_full",
      "prospector_alpha",
      "google_calendar",
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    implantationPriceCents: 890_000,
    monthlyPriceCents: 249_000,
    monthlyPriceAnnualCents: 199_000,
    aiQuotaUsd: "50",
    maxUsers: 20,
    extraUserPriceCents: 7_900,
    isActive: true,
    modules: [
      "agent_sdr",
      "agent_closer",
      "agent_followup",
      "agent_reactivation",
      "agent_scheduler",
      "agent_service",
      "agent_onboarding",
      "customer_intelligence",
      "intelligence_full",
      "prospector_alpha",
      "google_calendar",
      "google_sheets",
      "knowledge_base",
      "byok",
      "partner_portal",
      "executive_report",
    ],
  },
];

async function seed() {
  console.log("Seeding plans...");
  for (const plan of PLANS) {
    const [existing] = await db
      .select({ id: plansTable.id })
      .from(plansTable)
      .where(eq(plansTable.slug, plan.slug))
      .limit(1);

    if (existing) {
      await db
        .update(plansTable)
        .set({
          name: plan.name,
          implantationPriceCents: plan.implantationPriceCents,
          monthlyPriceCents: plan.monthlyPriceCents,
          monthlyPriceAnnualCents: plan.monthlyPriceAnnualCents,
          aiQuotaUsd: plan.aiQuotaUsd,
          maxUsers: plan.maxUsers,
          extraUserPriceCents: plan.extraUserPriceCents,
          isActive: plan.isActive,
          updatedAt: new Date(),
        })
        .where(eq(plansTable.slug, plan.slug));

      await db
        .delete(planModulesTable)
        .where(eq(planModulesTable.planId, existing.id));

      for (const moduleKey of plan.modules) {
        await db.insert(planModulesTable).values({
          planId: existing.id,
          moduleKey,
        });
      }

      console.log(`  Plan "${plan.slug}" updated (${existing.id}) with ${plan.modules.length} modules`);
      continue;
    }

    const [inserted] = await db
      .insert(plansTable)
      .values({
        slug: plan.slug,
        name: plan.name,
        implantationPriceCents: plan.implantationPriceCents,
        monthlyPriceCents: plan.monthlyPriceCents,
        monthlyPriceAnnualCents: plan.monthlyPriceAnnualCents,
        aiQuotaUsd: plan.aiQuotaUsd,
        maxUsers: plan.maxUsers,
        extraUserPriceCents: plan.extraUserPriceCents,
        isActive: plan.isActive,
      })
      .returning({ id: plansTable.id });

    for (const moduleKey of plan.modules) {
      await db.insert(planModulesTable).values({
        planId: inserted.id,
        moduleKey,
      });
    }

    console.log(`  Plan "${plan.slug}" created (${inserted.id}) with ${plan.modules.length} modules`);
  }
  console.log("Plans seeded.");
}

seed().catch((err) => {
  console.error("Failed to seed plans:", err);
  process.exit(1);
});
