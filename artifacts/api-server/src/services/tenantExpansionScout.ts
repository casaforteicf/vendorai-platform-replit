import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  commercialProductProfilesTable,
  db,
  produtosCatalogoTable,
  usageLedgerTable,
  tenantExpansionRecommendationsTable,
  type TenantExpansionStatus,
} from "@workspace/db";
import { getTenantCommercialAccess } from "../middlewares/commercialProductAccess";

type ExpansionKind = "cross_sell" | "upsell" | "full_package";

export type TenantExpansionOpportunity = {
  kind: ExpansionKind;
  commercialKey: string;
  name: string;
  score: number;
  reason: string;
  evidence: Record<string, unknown>;
  monthlyPrice: number | null;
  recommendationId?: string;
  status?: TenantExpansionStatus;
};

const CROSS_SELL_MAP: Record<string, string[]> = {
  "vendor.prospector": ["vendor.crm", "vendor.ai_team", "vendor.revenue_scout"],
  "vendor.crm": ["vendor.prospector", "vendor.ai_team", "vendor.revenue_scout"],
  "vendor.omnichannel": ["vendor.ai_team", "vendor.revenue_scout"],
  "vendor.ai_team": ["vendor.omnichannel", "vendor.revenue_scout", "vendor.bi"],
  "vendor.content_planner": ["vendor.content_studio", "vendor.creative_studio", "vendor.ads"],
  "vendor.content_studio": ["vendor.creative_studio", "vendor.ads", "vendor.sites_autopilot"],
  "vendor.creative_studio": ["vendor.content_planner", "vendor.ads", "vendor.sites_autopilot"],
  "vendor.ads": ["vendor.sites_autopilot", "vendor.content_planner", "vendor.creative_studio"],
  "vendor.proposals_catalog": ["vendor.crm", "vendor.ai_team", "vendor.management"],
  "vendor.management": ["vendor.bi", "vendor.jarvis", "vendor.revenue_scout"],
  "vendor.bi": ["vendor.jarvis", "vendor.revenue_scout"],
  "vendor.knowledge": ["vendor.jarvis", "vendor.ai_team"],
  "arqdor.ai": ["vendor.proposals_catalog", "vendor.management", "vendor.bi"],
};


const OPEN_STATUSES: TenantExpansionStatus[] = ["identified", "presented", "accepted"];

async function syncExpansionHistory(
  tenantId: string,
  opportunities: TenantExpansionOpportunity[],
  owned: Set<string>,
  fullPackageActive: boolean,
  now: Date,
) {
  const history = await db
    .select()
    .from(tenantExpansionRecommendationsTable)
    .where(eq(tenantExpansionRecommendationsTable.tenantId, tenantId))
    .orderBy(desc(tenantExpansionRecommendationsTable.createdAt));

  // Fecha automaticamente o loop quando o entitlement realmente foi ativado.
  for (const row of history) {
    if (!row.active || !OPEN_STATUSES.includes(row.status)) continue;
    const contracted = row.commercialKey === "vendor.growth"
      ? fullPackageActive
      : owned.has(row.commercialKey);
    if (contracted) {
      await db.update(tenantExpansionRecommendationsTable)
        .set({
          status: "contracted",
          contractedAt: now,
          active: false,
          updatedAt: now,
          lastSeenAt: now,
        })
        .where(eq(tenantExpansionRecommendationsTable.id, row.id));
    } else if (fullPackageActive) {
      await db.update(tenantExpansionRecommendationsTable)
        .set({ status: "expired", active: false, updatedAt: now, lastSeenAt: now })
        .where(eq(tenantExpansionRecommendationsTable.id, row.id));
    }
  }

  if (fullPackageActive) return [];

  const recentHistory = await db
    .select()
    .from(tenantExpansionRecommendationsTable)
    .where(eq(tenantExpansionRecommendationsTable.tenantId, tenantId))
    .orderBy(desc(tenantExpansionRecommendationsTable.createdAt));

  const results: TenantExpansionOpportunity[] = [];
  for (const opportunity of opportunities) {
    const recentRejected = recentHistory.find((row) =>
      row.commercialKey === opportunity.commercialKey &&
      row.status === "rejected" &&
      row.rejectedAt &&
      row.rejectedAt.getTime() >= now.getTime() - 30 * 24 * 60 * 60 * 1000
    );
    // Recusa recente vira cooldown; o Scout não insiste imediatamente.
    if (recentRejected) continue;

    const existing = recentHistory.find((row) =>
      row.commercialKey === opportunity.commercialKey &&
      row.active &&
      OPEN_STATUSES.includes(row.status)
    );

    if (existing) {
      await db.update(tenantExpansionRecommendationsTable)
        .set({
          score: opportunity.score,
          reason: opportunity.reason,
          evidence: opportunity.evidence,
          monthlyPriceCents: opportunity.monthlyPrice == null ? null : Math.round(opportunity.monthlyPrice * 100),
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(tenantExpansionRecommendationsTable.id, existing.id));
      results.push({ ...opportunity, recommendationId: existing.id, status: existing.status });
      continue;
    }

    const [created] = await db.insert(tenantExpansionRecommendationsTable)
      .values({
        tenantId,
        commercialKey: opportunity.commercialKey,
        kind: opportunity.kind,
        status: "identified",
        score: opportunity.score,
        reason: opportunity.reason,
        evidence: opportunity.evidence,
        monthlyPriceCents: opportunity.monthlyPrice == null ? null : Math.round(opportunity.monthlyPrice * 100),
        lastSeenAt: now,
      })
      .returning();

    results.push({
      ...opportunity,
      recommendationId: created?.id,
      status: created?.status ?? "identified",
    });
  }

  return results;
}

export async function getTenantExpansionHistory(tenantId: string) {
  return db
    .select()
    .from(tenantExpansionRecommendationsTable)
    .where(eq(tenantExpansionRecommendationsTable.tenantId, tenantId))
    .orderBy(desc(tenantExpansionRecommendationsTable.createdAt));
}

export async function updateTenantExpansionRecommendation(
  tenantId: string,
  recommendationId: string,
  status: Extract<TenantExpansionStatus, "presented" | "accepted" | "rejected">,
  now = new Date(),
) {
  const [current] = await db
    .select()
    .from(tenantExpansionRecommendationsTable)
    .where(and(
      eq(tenantExpansionRecommendationsTable.id, recommendationId),
      eq(tenantExpansionRecommendationsTable.tenantId, tenantId),
    ))
    .limit(1);

  if (!current) return null;
  if (!current.active || ["contracted", "expired"].includes(current.status)) return current;

  const patch: Record<string, unknown> = { status, updatedAt: now, lastSeenAt: now };
  if (status === "presented") patch.presentedAt = now;
  if (status === "accepted") {
    patch.acceptedAt = now;
    patch.presentedAt = current.presentedAt ?? now;
  }
  if (status === "rejected") {
    patch.rejectedAt = now;
    patch.active = false;
  }

  const [updated] = await db.update(tenantExpansionRecommendationsTable)
    .set(patch as any)
    .where(eq(tenantExpansionRecommendationsTable.id, recommendationId))
    .returning();
  return updated ?? null;
}


function asMoney(value: unknown) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function analyzeTenantExpansion(tenantId: string, now = new Date()) {
  const access = await getTenantCommercialAccess(tenantId);
  if (access.fullPackageActive) {
    const owned = new Set(access.effectiveProfiles.map((p) => p.commercialKey));
    await syncExpansionHistory(tenantId, [], owned, true, now);
    return {
      tenantId,
      fullPackageActive: true,
      currentProducts: [...owned],
      opportunities: [] as TenantExpansionOpportunity[],
      recommendation: "Tenant já está no pacote completo.",
    };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const [products, usage] = await Promise.all([
    db.select({
      commercialKey: commercialProductProfilesTable.commercialKey,
      name: produtosCatalogoTable.nome,
      monthlyPrice: produtosCatalogoTable.precoMensalidade,
      basePrice: produtosCatalogoTable.precoBase,
      includedInGrowth: commercialProductProfilesTable.includedInGrowth,
      active: commercialProductProfilesTable.active,
    })
      .from(commercialProductProfilesTable)
      .leftJoin(produtosCatalogoTable, eq(commercialProductProfilesTable.catalogProductId, produtosCatalogoTable.id))
      .where(eq(commercialProductProfilesTable.active, true)),
    db.select({
      commercialKey: usageLedgerTable.commercialKey,
      events: sql<number>`count(*)`,
      quantity: sql<number>`coalesce(sum(${usageLedgerTable.quantity}), 0)`,
    })
      .from(usageLedgerTable)
      .where(and(
        eq(usageLedgerTable.tenantId, tenantId),
        gte(usageLedgerTable.createdAt, start),
        eq(usageLedgerTable.success, true),
      ))
      .groupBy(usageLedgerTable.commercialKey),
  ]);

  const productByKey = new Map(products.map((p) => [p.commercialKey, p]));
  const usageByKey = new Map(usage.filter((u) => u.commercialKey).map((u) => [u.commercialKey!, u]));
  const owned = new Set(access.effectiveProfiles.map((p) => p.commercialKey));
  const opportunities = new Map<string, TenantExpansionOpportunity>();

  for (const sourceKey of owned) {
    const sourceUsage = usageByKey.get(sourceKey);
    const activity = Number(sourceUsage?.events ?? 0);
    const quantity = Number(sourceUsage?.quantity ?? 0);
    const targets = CROSS_SELL_MAP[sourceKey] ?? [];

    for (const targetKey of targets) {
      if (owned.has(targetKey) || targetKey === "vendor.growth") continue;
      const target = productByKey.get(targetKey);
      if (!target?.active) continue;

      const activityBoost = Math.min(20, Math.floor(Math.log10(Math.max(1, activity + quantity)) * 8));
      const score = Math.min(90, 58 + activityBoost);
      const current = opportunities.get(targetKey);
      if (current && current.score >= score) continue;

      opportunities.set(targetKey, {
        kind: "cross_sell",
        commercialKey: targetKey,
        name: target.name ?? targetKey,
        score,
        reason: `Uso de ${sourceKey} indica encaixe operacional com ${target.name ?? targetKey}.`,
        evidence: {
          sourceProduct: sourceKey,
          sourceUsageEventsThisMonth: activity,
          sourceUsageQuantityThisMonth: quantity,
        },
        monthlyPrice: asMoney(target.monthlyPrice ?? target.basePrice),
      });
    }
  }

  const paidOwned = access.effectiveProfiles
    .map((profile) => productByKey.get(profile.commercialKey))
    .filter(Boolean)
    .map((p) => ({
      key: p!.commercialKey,
      price: asMoney(p!.monthlyPrice ?? p!.basePrice) ?? 0,
    }));

  const individualMonthlyValue = paidOwned.reduce((sum, item) => sum + item.price, 0);
  const growth = productByKey.get("vendor.growth");
  const growthPrice = growth ? asMoney(growth.monthlyPrice ?? growth.basePrice) : null;
  const moduleCount = paidOwned.filter((item) => item.key !== "vendor.crm.free").length;

  if (growth && !owned.has("vendor.growth") && (moduleCount >= 3 || (growthPrice && individualMonthlyValue >= growthPrice * 0.7))) {
    const priceRatio = growthPrice && growthPrice > 0 ? individualMonthlyValue / growthPrice : 0;
    opportunities.set("vendor.growth", {
      kind: "full_package",
      commercialKey: "vendor.growth",
      name: growth.name ?? "VendorAI Completo",
      score: Math.min(98, 75 + moduleCount * 4 + Math.round(Math.min(1, priceRatio) * 10)),
      reason: "A combinação atual de produtos já indica maturidade para o pacote completo.",
      evidence: {
        activeIndividualProducts: moduleCount,
        estimatedIndividualMonthlyValue: individualMonthlyValue,
        fullPackageMonthlyPrice: growthPrice,
        priceRatio: Number(priceRatio.toFixed(2)),
      },
      monthlyPrice: growthPrice,
    });
  }

  const ranked = [...opportunities.values()].sort((a, b) => b.score - a.score);
  const persisted = await syncExpansionHistory(tenantId, ranked, owned, false, now);

  return {
    tenantId,
    fullPackageActive: false,
    currentProducts: [...owned],
    monthlyUsage: usage,
    individualMonthlyValue,
    growthPrice,
    opportunities: persisted.sort((a, b) => b.score - a.score),
  };
}
