import { Router, type IRouter } from "express";
import { and, asc, eq, gte, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  plansTable,
  productUsageQuotasTable,
  produtosInternosTable,
  tenantProductEntitlementsTable,
  tenantsTable,
  usageLedgerTable,
  usageMetricDefinitionsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const publicRouter: IRouter = Router();
const router: IRouter = Router();

const COMMERCIAL_CATEGORY = "Produtos Comerciais VendorAI";

function canReadTenant(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

async function listProducts(includeInternal = false) {
  const products = await db
    .select({
      id: produtosInternosTable.id,
      commercialKey: produtosInternosTable.commercialKey,
      sku: produtosInternosTable.sku,
      name: produtosInternosTable.nome,
      description: produtosInternosTable.descricaoUso,
      type: produtosInternosTable.tipo,
      billingModel: produtosInternosTable.billingModel,
      publicSlug: produtosInternosTable.publicSlug,
      monthlyPriceCents: produtosInternosTable.monthlyPriceCents,
      oneTimePriceCents: produtosInternosTable.oneTimePriceCents,
      maxUsers: produtosInternosTable.maxUsers,
      unlimitedUsers: produtosInternosTable.unlimitedUsers,
      includedInGrowth: produtosInternosTable.includedInGrowth,
      standalonePurchase: produtosInternosTable.standalonePurchase,
      publicVisible: produtosInternosTable.publicVisible,
      moduleKeys: produtosInternosTable.moduleKeys,
      usagePolicy: produtosInternosTable.usagePolicy,
      metadata: produtosInternosTable.commercialMetadata,
      details: produtosInternosTable.detalhes,
      niches: produtosInternosTable.nichosRelacionados,
      order: produtosInternosTable.ordem,
    })
    .from(produtosInternosTable)
    .where(
      and(
        eq(produtosInternosTable.categoria, COMMERCIAL_CATEGORY),
        eq(produtosInternosTable.ativo, true),
        ...(includeInternal ? [] : [eq(produtosInternosTable.publicVisible, true)]),
      ),
    )
    .orderBy(asc(produtosInternosTable.ordem), asc(produtosInternosTable.nome));

  if (products.length === 0) return [];
  const quotas = await db
    .select({
      productId: productUsageQuotasTable.productId,
      metricKey: productUsageQuotasTable.metricKey,
      period: productUsageQuotasTable.period,
      includedQuantity: productUsageQuotasTable.includedQuantity,
      hardCap: productUsageQuotasTable.hardCap,
      overageAllowed: productUsageQuotasTable.overageAllowed,
      unitLabel: usageMetricDefinitionsTable.unitLabel,
      metricLabel: usageMetricDefinitionsTable.label,
      customerVisible: usageMetricDefinitionsTable.customerVisible,
      ...(includeInternal ? { vendorCreditWeight: usageMetricDefinitionsTable.vendorCreditWeight } : {}),
    })
    .from(productUsageQuotasTable)
    .innerJoin(usageMetricDefinitionsTable, eq(usageMetricDefinitionsTable.metricKey, productUsageQuotasTable.metricKey))
    .where(inArray(productUsageQuotasTable.productId, products.map((p) => p.id)));

  return products.map((product) => ({
    ...product,
    quotas: quotas
      .filter((quota) => quota.productId === product.id && (includeInternal || quota.customerVisible))
      .map(({ productId: _productId, customerVisible: _customerVisible, ...quota }) => quota),
  }));
}

// Public site/checkout source of truth. It intentionally does not expose cost,
// provider tokens or technical-only products.
publicRouter.get("/public/commercial-products", async (_req, res) => {
  try {
    res.json({ products: await listProducts(false), source: "commercial_master_v1" });
  } catch (error) {
    res.status(503).json({ error: "commercial_catalog_unavailable", message: error instanceof Error ? error.message : undefined });
  }
});

router.get("/admin/commercial/products", requireRole("super_admin"), async (_req, res) => {
  res.json({ products: await listProducts(true), source: "commercial_master_v1" });
});

router.get("/tenants/:tenantId/commercial/summary", async (req, res) => {
  const tenantId = String(req.params.tenantId ?? "");
  if (!tenantId || !canReadTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [tenant] = await db
    .select({ id: tenantsTable.id, planSlug: plansTable.slug, planName: plansTable.name, maxUsers: plansTable.maxUsers })
    .from(tenantsTable)
    .leftJoin(plansTable, eq(plansTable.id, tenantsTable.planId))
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const planCommercialKey = tenant.planSlug === "growth"
    ? "vendorai_growth"
    : tenant.planSlug === "start"
      ? "vendor_crm_free"
      : null;

  const explicitEntitlements = await db
    .select({
      entitlementId: tenantProductEntitlementsTable.id,
      productId: tenantProductEntitlementsTable.productId,
      source: tenantProductEntitlementsTable.source,
      status: tenantProductEntitlementsTable.status,
      startsAt: tenantProductEntitlementsTable.startsAt,
      endsAt: tenantProductEntitlementsTable.endsAt,
      commercialKey: produtosInternosTable.commercialKey,
      name: produtosInternosTable.nome,
      monthlyPriceCents: produtosInternosTable.monthlyPriceCents,
    })
    .from(tenantProductEntitlementsTable)
    .innerJoin(produtosInternosTable, eq(produtosInternosTable.id, tenantProductEntitlementsTable.productId))
    .where(
      and(
        eq(tenantProductEntitlementsTable.tenantId, tenantId),
        eq(tenantProductEntitlementsTable.status, "active"),
        lte(tenantProductEntitlementsTable.startsAt, now),
        or(isNull(tenantProductEntitlementsTable.endsAt), gt(tenantProductEntitlementsTable.endsAt, now)),
      ),
    );

  const planProducts = planCommercialKey
    ? await db
        .select({ id: produtosInternosTable.id, commercialKey: produtosInternosTable.commercialKey, name: produtosInternosTable.nome })
        .from(produtosInternosTable)
        .where(eq(produtosInternosTable.commercialKey, planCommercialKey))
        .limit(1)
    : [];

  const productIds = [...new Set([
    ...planProducts.map((p) => p.id),
    ...explicitEntitlements.map((e) => e.productId),
  ])];

  const quotas = productIds.length > 0
    ? await db
        .select({
          productId: productUsageQuotasTable.productId,
          metricKey: productUsageQuotasTable.metricKey,
          includedQuantity: productUsageQuotasTable.includedQuantity,
          hardCap: productUsageQuotasTable.hardCap,
          overageAllowed: productUsageQuotasTable.overageAllowed,
          label: usageMetricDefinitionsTable.label,
          unitLabel: usageMetricDefinitionsTable.unitLabel,
        })
        .from(productUsageQuotasTable)
        .innerJoin(usageMetricDefinitionsTable, eq(usageMetricDefinitionsTable.metricKey, productUsageQuotasTable.metricKey))
        .where(and(inArray(productUsageQuotasTable.productId, productIds), eq(usageMetricDefinitionsTable.customerVisible, true)))
    : [];

  const usage = await db
    .select({
      metricKey: usageLedgerTable.metricKey,
      quantity: sql<string>`coalesce(sum(case when ${usageLedgerTable.quotaConsumed} then ${usageLedgerTable.quantity} else 0 end), 0)`,
      vendorCredits: sql<string>`coalesce(sum(${usageLedgerTable.vendorCredits}), 0)`,
      totalCostUsd: sql<string>`coalesce(sum(${usageLedgerTable.totalCostUsd}), 0)`,
    })
    .from(usageLedgerTable)
    .where(and(eq(usageLedgerTable.tenantId, tenantId), gte(usageLedgerTable.occurredAt, startOfMonth)))
    .groupBy(usageLedgerTable.metricKey);

  const usageByMetric = new Map(usage.map((row) => [row.metricKey, row]));
  const limits = quotas.map((quota) => ({
    ...quota,
    used: Number(usageByMetric.get(quota.metricKey)?.quantity ?? 0),
    remaining: Math.max(0, Number(quota.includedQuantity) - Number(usageByMetric.get(quota.metricKey)?.quantity ?? 0)),
  }));

  const isSuperAdmin = req.user?.platformRole === "super_admin";
  res.json({
    accessModel: tenant.planSlug === "growth" ? "growth" : tenant.planSlug === "start" ? "crm_free" : "custom",
    plan: { slug: tenant.planSlug, name: tenant.planName, maxUsers: tenant.maxUsers, unlimitedUsers: tenant.planSlug === "growth" },
    planProduct: planProducts[0] ?? null,
    entitlements: explicitEntitlements,
    limits,
    period: { start: startOfMonth.toISOString(), end: now.toISOString() },
    enforcement: "measure_only",
    ...(isSuperAdmin
      ? {
          economics: {
            vendorCredits: usage.reduce((sum, row) => sum + Number(row.vendorCredits), 0),
            totalCostUsd: usage.reduce((sum, row) => sum + Number(row.totalCostUsd), 0),
          },
        }
      : {}),
  });
});

router.get("/tenants/:tenantId/commercial/ledger", requireRole("super_admin"), async (req, res) => {
  const tenantId = String(req.params.tenantId ?? "");
  const rows = await db
    .select()
    .from(usageLedgerTable)
    .where(eq(usageLedgerTable.tenantId, tenantId))
    .orderBy(sql`${usageLedgerTable.occurredAt} desc`)
    .limit(500);
  res.json({ rows });
});

export { publicRouter as commercialProductsPublicRouter };
export default router;
