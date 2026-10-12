import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const auditSource = readFileSync(new URL("./continuous-audit-agent.ts", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("./agent-manager-support.ts", import.meta.url), "utf8");
const policySource = readFileSync(new URL("./agent-manager-policy.ts", import.meta.url), "utf8");

describe("UX and Security manager governance", () => {
  it("requires authenticated tenant-scoped UX telemetry and forbids user-defined tenant IDs", () => {
    const api = readFileSync(new URL("../routes/ux_runtime_telemetry.ts", import.meta.url), "utf8");
    const router = readFileSync(new URL("../routes/index.ts", import.meta.url), "utf8");
    expect(api).toContain("req.user.tenantId");
    expect(api).not.toContain("req.body.tenantId");
    expect(api).toContain("telemetryLimiter");
    expect(api).toContain("LEAST(ux_runtime_errors.occurrences+1,100)");
    expect(api).toContain("reportSchema.safeParse");
    expect(api).toContain("routeKey: z.enum(");
    expect(router.indexOf("router.use(uxRuntimeTelemetryRouter)"))
      .toBeGreaterThan(router.indexOf("router.use(authenticate)"));
    expect(router.indexOf("router.use(uxRuntimeTelemetryRouter)")).toBeGreaterThan(router.indexOf("router.use(blockSuspendedTenants)"));
    expect(router.indexOf("router.use(uxRuntimeTelemetryRouter)")).toBeGreaterThan(router.indexOf("router.use(enforceCommercialProductAccess)"));
  });

  it("instruments the actual Vendor.ai legacy routes without claiming coverage of public runtime apps", () => {
    const app = readFileSync(new URL("../../../frontend/src/App.tsx", import.meta.url), "utf8");
    const legacy = readFileSync(new URL("../../../frontend/src/AppLegacy.tsx", import.meta.url), "utf8");
    expect(app).toContain('import("./AppLegacy")');
    expect(legacy).toContain('import { RouteContentErrorBoundary }');
    expect(legacy).toContain('<RouteContentErrorBoundary routeKey={routeKey}>');
    expect(legacy).toContain('function RouteContentBoundary(');
  });

  it("throttles UX browser reports and keeps the homologation API isolated", () => {
    const frontend = readFileSync(new URL("../../../frontend/src/components/RouteContentErrorBoundary.tsx", import.meta.url), "utf8");
    expect(frontend).toContain("sessionStorage.getItem(throttleKey)");
    expect(frontend).toContain("allowedModules.has(routeKey)");
    expect(frontend).toContain("new Set([");
    expect(frontend).toContain("window.location.hostname");
    expect(frontend).toContain("import.meta.env.VITE_API_URL");
    expect(frontend).toContain("try {");
    expect(frontend).not.toContain("body: JSON.stringify({ routeKey, error,");
  });

  it("keeps emergency code remediation disabled without explicit autonomous mode and night window", () => {
    const start = auditSource.indexOf("async function runEmergencyRemediation(");
    const end = auditSource.indexOf("async function ensureAuditTablesAvailable(", start);
    const body = auditSource.slice(start, end);
    const guard = body.indexOf('process.env.VENDI_AUTONOMY_ENABLED !== "true" || !isNightAuditWindow()');
    const execution = body.indexOf("executeDevAutonomousWork({");
    expect(guard).toBeGreaterThan(-1);
    expect(execution).toBeGreaterThan(guard);
  });

  it("keeps blocked-work recovery disabled when autonomous remediation is not allowed", () => {
    const start = auditSource.indexOf("async function recoverStalledImprovements(");
    const end = auditSource.indexOf("async function auditImprovementFlow(", start);
    const body = auditSource.slice(start, end);
    const guard = body.indexOf('process.env.VENDI_AUTONOMY_ENABLED !== "true" || !isNightAuditWindow()');
    const execution = body.indexOf("executeDevAutonomousWork({");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(guard).toBeGreaterThan(-1);
    expect(execution).toBeGreaterThan(guard);
  });

  it("limits automated UX route probes to homologation and never falls back to production", () => {
    const start = auditSource.indexOf("async function auditFrontendRoutes()");
    const end = auditSource.indexOf("async function runAudit(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = auditSource.slice(start, end);
    expect(body).toContain('process.env["HOMOLOGATION_URL"]');
    expect(body).not.toContain('process.env["PUBLIC_APP_URL"]');
    expect(body).not.toContain('process.env["APP_URL"]');
    expect(body).toContain("if (!base) return findings;");
  });

  it("does not follow login redirects or leak query parameters in UX probe failures", () => {
    const start = auditSource.indexOf("async function auditFrontendRoutes()");
    const end = auditSource.indexOf("async function runAudit(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = auditSource.slice(start, end);
    expect(body).toContain('redirect: "manual"');
    expect(body).toContain("finally {");
    expect(body).toContain("clearTimeout(timeout)");
    expect(body).not.toContain('redirect: "follow"');
    expect(body).not.toContain("${url}: ${error");
  });

  it("limits UX error retention to 30 days with bounded cleanup", () => {
    const start = auditSource.indexOf("async function auditFrontendRenderFailures()");
    const end = auditSource.indexOf("async function auditConversationTenantIsolation()", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = auditSource.slice(start, end);
    const migration = readFileSync(new URL("../../../../lib/db/migrations/20261010_ux_runtime_errors.sql", import.meta.url), "utf8");
    expect(body).toContain("DELETE FROM ux_runtime_errors");
    expect(body).toContain("interval '30 days'");
    expect(body).toContain("LIMIT 500");
    expect(migration).toContain("ux_runtime_errors_retention_idx");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.ux_runtime_errors FROM PUBLIC");
  });

  it("sends recurring frontend failures to Superadmin without tenant or route identifiers", () => {
    const start = auditSource.indexOf("async function auditFrontendRenderFailures()");
    const end = auditSource.indexOf("async function auditConversationTenantIsolation()", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = auditSource.slice(start, end);
    expect(body).toContain("ux_runtime_errors");
    expect(body).toContain("sum(occurrences)");
    expect(body).toContain("GROUP BY tenant_id, route_key");
    expect(body).toContain("HAVING sum(occurrences) >= 5");
    expect(body).toContain("bucket_start >= now() - interval '24 hours'");
    expect(body).toContain('module: "UI / UX"');
    expect(body).not.toContain("SELECT *");
    expect(auditSource).toContain("auditFrontendRenderFailures(),");
  });

  it("UX audit creates reviewable findings instead of claiming frontend browser inspection", () => {
    expect(auditSource).toContain("async function auditFrontendRoutes()");
    expect(auditSource).toContain('module: "UI / UX"');
    expect(auditSource).toContain("Browser Agent em desktop e mobile");
    expect(auditSource).toContain("upsertFinding(");
  });

  it("detects cross-tenant WhatsApp bindings without exposing messages or phone numbers", () => {
    const start = auditSource.indexOf("async function auditConversationTenantIsolation()");
    const end = auditSource.indexOf("async function auditDatabaseSchema()", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = auditSource.slice(start, end);
    expect(body).toContain("c.tenant_id <> w.tenant_id");
    expect(body).toContain('priority: "urgente"');
    expect(body).toContain("count(*)::int AS violations");
    expect(body).not.toContain("SELECT c.*");
    expect(body).not.toContain("SELECT w.*");
    expect(auditSource).toContain("auditConversationTenantIsolation(),");
  });

  it("detects cross-tenant lead associations and blocks autonomous security remediation", () => {
    const audit = auditSource.slice(
      auditSource.indexOf("async function auditConversationTenantIsolation()"),
      auditSource.indexOf("async function auditDatabaseSchema()"),
    );
    const remediation = auditSource.slice(
      auditSource.indexOf("async function runEmergencyRemediation("),
      auditSource.indexOf("async function ensureAuditTablesAvailable("),
    );
    expect(audit).toContain("c.tenant_id <> l.tenant_id");
    expect(audit).toContain("security:cross-tenant-lead-conversation-link");
    expect(remediation).toContain('if (finding.module.startsWith("Segurança")) return;');
    expect(remediation.indexOf('if (finding.module.startsWith("Segurança")) return;'))
      .toBeLessThan(remediation.indexOf("executeDevAutonomousWork({"));
  });

  it("platform security findings require Superadmin review and are not executable missions", () => {
    expect(policySource).toContain('"security_incident"');
    expect(managerSource).toContain('policy.route !== "superadmin_support"');
    expect(managerSource).toContain('policy.approval !== "superadmin_required"');
    expect(managerSource).toContain('awaiting_superadmin_approval');
    expect(managerSource).not.toContain("executeDevAutonomousWork");
  });
});
