import { db, plansTable, planModulesTable } from "@workspace/db";
import { eq, notInArray } from "drizzle-orm";

const CRM_FREE = {
  slug: "start",
  name: "CRM Free",
  implantationPriceCents: 0,
  monthlyPriceCents: 0,
  monthlyPriceAnnualCents: null,
  aiQuotaUsd: "0",
  // Free is a complete CRM for one person; the main commercial restriction is
  // team size, while premium products are entitlements/modules of their own.
  maxUsers: 1,
  extraUserPriceCents: null,
  isActive: true,
  modules: [] as string[],
};

const GROWTH = {
  slug: "growth",
  name: "Growth",
  implantationPriceCents: 0,
  // Regular catalog price. The existing launch lifecycle can still apply the
  // 5 free days -> R$497 -> R$990 -> R$1.490 promotional progression.
  monthlyPriceCents: 149_000,
  monthlyPriceAnnualCents: null,
  // Temporary provider-cost safety ceiling while the Vendor Credits ledger is
  // measure-only. Commercial quotas live in product_usage_quotas.
  aiQuotaUsd: "50",
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

const ACTIVE_PLANS = [CRM_FREE, GROWTH] as const;

async function upsertPlan(definition: (typeof ACTIVE_PLANS)[number]): Promise<string> {
  const [existing] = await db
    .select({ id: plansTable.id })
    .from(plansTable)
    .where(eq(plansTable.slug, definition.slug))
    .limit(1);

  let id: string;
  if (existing) {
    id = existing.id;
    await db.update(plansTable).set({
      name: definition.name,
      implantationPriceCents: definition.implantationPriceCents,
      monthlyPriceCents: definition.monthlyPriceCents,
      monthlyPriceAnnualCents: definition.monthlyPriceAnnualCents,
      aiQuotaUsd: definition.aiQuotaUsd,
      maxUsers: definition.maxUsers,
      extraUserPriceCents: definition.extraUserPriceCents,
      isActive: true,
      updatedAt: new Date(),
    }).where(eq(plansTable.id, id));
  } else {
    const [inserted] = await db.insert(plansTable).values({
      slug: definition.slug,
      name: definition.name,
      implantationPriceCents: definition.implantationPriceCents,
      monthlyPriceCents: definition.monthlyPriceCents,
      monthlyPriceAnnualCents: definition.monthlyPriceAnnualCents,
      aiQuotaUsd: definition.aiQuotaUsd,
      maxUsers: definition.maxUsers,
      extraUserPriceCents: definition.extraUserPriceCents,
      isActive: true,
    }).returning({ id: plansTable.id });
    id = inserted!.id;
  }

  await db.delete(planModulesTable).where(eq(planModulesTable.planId, id));
  for (const moduleKey of definition.modules) {
    await db.insert(planModulesTable).values({ planId: id, moduleKey });
  }
  return id;
}

async function seed() {
  console.log("Seeding VendorAI CRM Free + Growth commercial access models...");

  // Historical plan rows remain for FKs/audit but are not offered anymore.
  await db.update(plansTable).set({ isActive: false, updatedAt: new Date() })
    .where(notInArray(plansTable.slug, ACTIVE_PLANS.map((plan) => plan.slug)));

  for (const definition of ACTIVE_PLANS) {
    const id = await upsertPlan(definition);
    console.log(`  ${definition.name} ready (${id}) — max users: ${definition.maxUsers ?? "unlimited"}`);
  }
}

seed().catch((err) => {
  console.error("Failed to seed VendorAI plans:", err);
  process.exit(1);
});
