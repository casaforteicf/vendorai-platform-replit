import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const auditSource = readFileSync(new URL("./continuous-audit-agent.ts", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("./agent-manager-support.ts", import.meta.url), "utf8");
const policySource = readFileSync(new URL("./agent-manager-policy.ts", import.meta.url), "utf8");

describe("UX and Security manager governance", () => {
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

  it("UX audit creates reviewable findings instead of claiming frontend browser inspection", () => {
    expect(auditSource).toContain("async function auditFrontendRoutes()");
    expect(auditSource).toContain('module: "UI / UX"');
    expect(auditSource).toContain("Browser Agent em desktop e mobile");
    expect(auditSource).toContain("upsertFinding(");
  });

  it("platform security findings require Superadmin review and are not executable missions", () => {
    expect(policySource).toContain('"security_incident"');
    expect(managerSource).toContain('policy.route !== "superadmin_support"');
    expect(managerSource).toContain('policy.approval !== "superadmin_required"');
    expect(managerSource).toContain('awaiting_superadmin_approval');
    expect(managerSource).not.toContain("executeDevAutonomousWork");
  });
});
