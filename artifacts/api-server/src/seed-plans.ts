import { db, plansTable, planModulesTable } from "@workspace/db";
import { eq, ne } from "drizzle-orm";

const GROWTH = {
  slug: "growth",
  name: "Growth",
  implantationPriceCents: 0,
  // Regular price after the promotional phases. The launch lifecycle charges
  // R$497 for the first 30 paid days, then R$990/month for 5 months, then
  // snapshots this R$1.490/month catalog price.
  monthlyPriceCents: 149_000,
  monthlyPriceAnnualCents: null,
  aiQuotaUsd: "50",
  // null means there is no commercial user cap / extra-user charge.
  maxUsers: null,
  extraUserPriceCents: null,
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
  ] as string[],
};

async function seed() {
  console.log("Seeding Growth as the single active VendorAI plan...");

  // Keep legacy plan rows for history/FKs, but never expose or sell them.
  await db
    .update(plansTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(ne(plansTable.slug, GROWTH.slug));

  const [existing] = await db
    .select({ id: plansTable.id })
    .from(plansTable)
    .where(eq(plansTable.slug, GROWTH.slug))
    .limit(1);

  let growthId: string;
  if (existing) {
    growthId = existing.id;
    await db
      .update(plansTable)
      .set({
        name: GROWTH.name,
        implantationPriceCents: GROWTH.implantationPriceCents,
        monthlyPriceCents: GROWTH.monthlyPriceCents,
        monthlyPriceAnnualCents: GROWTH.monthlyPriceAnnualCents,
        aiQuotaUsd: GROWTH.aiQuotaUsd,
        maxUsers: GROWTH.maxUsers,
        extraUserPriceCents: GROWTH.extraUserPriceCents,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(plansTable.id, existing.id));
  } else {
    const [inserted] = await db
      .insert(plansTable)
      .values({
        slug: GROWTH.slug,
        name: GROWTH.name,
        implantationPriceCents: GROWTH.implantationPriceCents,
        monthlyPriceCents: GROWTH.monthlyPriceCents,
        monthlyPriceAnnualCents: GROWTH.monthlyPriceAnnualCents,
        aiQuotaUsd: GROWTH.aiQuotaUsd,
        maxUsers: GROWTH.maxUsers,
        extraUserPriceCents: GROWTH.extraUserPriceCents,
        isActive: true,
      })
      .returning({ id: plansTable.id });
    growthId = inserted.id;
  }

  await db.delete(planModulesTable).where(eq(planModulesTable.planId, growthId));
  for (const moduleKey of GROWTH.modules) {
    await db.insert(planModulesTable).values({ planId: growthId, moduleKey });
  }

  console.log(`Growth ready (${growthId}) with ${GROWTH.modules.length} modules, unlimited users, no annual tier.`);
}

seed().catch((err) => {
  console.error("Failed to seed Growth plan:", err);
  process.exit(1);
});
