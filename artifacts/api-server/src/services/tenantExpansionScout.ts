import { and, eq, gte, sql } from "drizzle-orm";
import {
  commercialProductProfilesTable,
  db,
  produtosCatalogoTable,
  tenantEntitlementsTable,
  usageLedgerTable,
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

function asMoney(value: unknown) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function analyzeTenantExpansion(tenantId: string, now = new Date()) {
  const access = await getTenantCommercialAccess(tenantId);
  if (access.fullPackageActive) {
    return {
      tenantId,
      fullPackageActive: true,
      currentProducts: access.effectiveProfiles.map((p) => p.commercialKey),
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

  return {
    tenantId,
    fullPackageActive: false,
    currentProducts: [...owned],
    monthlyUsage: usage,
    individualMonthlyValue,
    growthPrice,
    opportunities: [...opportunities.values()].sort((a, b) => b.score - a.score),
  };
}
