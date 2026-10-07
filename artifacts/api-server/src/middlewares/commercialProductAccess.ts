import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { commercialProductProfilesTable, db, tenantsTable } from "@workspace/db";
import { getActiveEntitlements } from "../services/commercial-usage";

const CORE_MODULES = new Set(["dashboard", "settings"]);

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function applies(segmentKeys: string[], tenantSegments: string[]) {
  if (!segmentKeys.length) return true;
  const allowed = new Set(segmentKeys.map(normalize).filter(Boolean));
  return tenantSegments.some((segment) => allowed.has(segment));
}

export async function getTenantCommercialAccess(tenantId: string) {
  const [tenant, entitlements, profiles] = await Promise.all([
    db.select({ vertical: tenantsTable.vertical, verticalSecundaria: tenantsTable.verticalSecundaria, isDemo: tenantsTable.isDemo })
      .from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    getActiveEntitlements(tenantId),
    db.select().from(commercialProductProfilesTable).where(eq(commercialProductProfilesTable.active, true)),
  ]);

  const entitlementKeys = new Set(entitlements.map((item) => item.commercialKey));
  const fullPackageActive = entitlementKeys.has("vendor.growth") || entitlementKeys.has("vendor.growth.5d");
  const tenantSegments = [tenant[0]?.vertical, tenant[0]?.verticalSecundaria].map(normalize).filter(Boolean);

  const effectiveProfiles = profiles.filter((profile) => {
    if (entitlementKeys.has(profile.commercialKey)) return true;
    return fullPackageActive && profile.includedInGrowth && applies(profile.segmentKeys ?? [], tenantSegments);
  });

  const moduleKeys = new Set<string>(CORE_MODULES);
  for (const profile of effectiveProfiles) {
    for (const key of profile.moduleKeys ?? []) moduleKeys.add(key);
    for (const key of profile.dependencies ?? []) moduleKeys.add(key);
  }

  return {
    isDemo: Boolean(tenant[0]?.isDemo),
    fullPackageActive,
    entitlementKeys,
    moduleKeys,
    entitlements,
    effectiveProfiles,
  };
}

const PATH_CAPABILITIES: Array<{ prefix: string; anyOf: string[] }> = [
  { prefix: "/prospector", anyOf: ["prospector"] },
  { prefix: "/scout", anyOf: ["revenue", "churn", "intelligence"] },
  { prefix: "/arch", anyOf: ["arch"] },
  { prefix: "/analytics", anyOf: ["analytics", "reports"] },
  { prefix: "/knowledge-graph", anyOf: ["knowledge_graph"] },
  { prefix: "/vkg", anyOf: ["knowledge_graph"] },
  { prefix: "/content-studio", anyOf: ["content"] },
  { prefix: "/content-calendar", anyOf: ["content"] },
  { prefix: "/campaigns", anyOf: ["campaigns"] },
  { prefix: "/ads", anyOf: ["campaigns"] },
  { prefix: "/agendas", anyOf: ["scheduler"] },
  { prefix: "/agendamentos", anyOf: ["scheduler"] },
  { prefix: "/conversations", anyOf: ["conversations"] },
  { prefix: "/messages", anyOf: ["conversations"] },
  { prefix: "/agents", anyOf: ["agents", "sdr"] },
  { prefix: "/agent-configs", anyOf: ["agents", "sdr"] },
  { prefix: "/agent-tasks", anyOf: ["agents", "sdr"] },
  { prefix: "/propostas", anyOf: ["proposals"] },
  { prefix: "/lead-proposals", anyOf: ["proposals"] },
  { prefix: "/inventory", anyOf: ["inventory", "financeiro"] },
  { prefix: "/solicitacoes-compra", anyOf: ["inventory", "financeiro"] },
  { prefix: "/financeiro", anyOf: ["financeiro"] },
  { prefix: "/site-generator", anyOf: ["content_autopilot"] },
  { prefix: "/praca-", anyOf: ["praca_ai"] },
];

export const enforceCommercialProductAccess: RequestHandler = async (req, res, next) => {
  const user = req.user;
  if (!user || user.platformRole === "super_admin") return next();

  const rule = PATH_CAPABILITIES.find((item) => req.path.startsWith(item.prefix));
  if (!rule) return next();

  const tenantId = user.tenantId;
  if (!tenantId) return res.status(403).json({ error: "TENANT_REQUIRED" });

  const access = await getTenantCommercialAccess(tenantId);

  // O tenant oficial de demonstração precisa conseguir executar o Arqdor de ponta a ponta.
  // A exceção é deliberadamente restrita ao prefixo /arch; os demais produtos continuam
  // respeitando os entitlements comerciais normalmente.
  if (access.isDemo && req.path.startsWith("/arch")) return next();

  if (access.fullPackageActive || rule.anyOf.some((key) => access.moduleKeys.has(key))) return next();

  return res.status(403).json({
    error: "PRODUCT_NOT_ENABLED",
    message: "Esta solução não está incluída nos produtos contratados por este tenant.",
    requiredCapabilities: rule.anyOf,
    upgradeAvailable: true,
  });
};
