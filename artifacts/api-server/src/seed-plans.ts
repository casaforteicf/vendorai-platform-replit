import { db, plansTable, planModulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const PLANS = [
  {
    slug: "starter",
    name: "Starter",
    implantationPriceCents: 300_000,
    monthlyPriceCents: 69_000,
    monthlyPriceAnnualCents: 59_000,
    modules: ["agent_sdr", "agent_followup"] as const,
  },
  {
    slug: "growth",
    name: "Growth",
    implantationPriceCents: 500_000,
    monthlyPriceCents: 100_000,
    monthlyPriceAnnualCents: 89_000,
    modules: ["agent_sdr", "agent_followup", "agent_scheduler", "agent_reactivation"] as const,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    implantationPriceCents: 800_000,
    monthlyPriceCents: 180_000,
    monthlyPriceAnnualCents: null,
    modules: [
      "agent_sdr",
      "agent_closer",
      "agent_followup",
      "agent_reactivation",
      "agent_scheduler",
      "agent_service",
      "agent_onboarding",
      "customer_intelligence",
    ] as const,
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
      console.log(`  Plan "${plan.slug}" already exists (${existing.id}) — skipping`);
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
