import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  classifyManagerDemand,
  isManagerDue,
  managerExecutionBucket,
  managerTenantPageOffset,
  managerSupportSourceRef,
  validateManagerOpportunity,
} from "./agent-manager-policy.js";

describe("agent manager policy", () => {
  it("checks notification tables before scheduling tenant scans", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    const prereq = source.indexOf("to_regclass('public.notifications')");
    const users = source.indexOf("to_regclass('public.users')");
    const scan = source.indexOf("SELECT count(*)::int AS total FROM tenants");
    expect(prereq).toBeGreaterThan(-1);
    expect(users).toBeGreaterThan(-1);
    expect(scan).toBeGreaterThan(prereq);
    expect(source).toContain("!ready.rows[0]?.notifications || !ready.rows[0]?.users");
  });

  it("rejects invalid cycle timestamps before opening a database transaction", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    const validation = source.indexOf("if (!Number.isFinite(now.getTime()))");
    const connection = source.indexOf("const client = await pool.connect()");
    expect(validation).toBeGreaterThan(-1);
    expect(connection).toBeGreaterThan(validation);
  });

  it("records a source collision as skipped instead of generating an alert", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    const collision = source.indexOf("if ((inserted.rowCount ?? 0) === 0)");
    const alert = source.indexOf("INSERT INTO notifications");
    expect(collision).toBeGreaterThan(-1);
    expect(alert).toBeGreaterThan(collision);
    expect(source).toContain("'skipped_source_collision',0");
  });

  it("does not count a manually closed case as an active finding", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    const manuallyClosed = source.indexOf("if (activeCase.rows[0]?.status !== 'open')");
    const notifications = source.indexOf("INSERT INTO notifications");
    const branch = source.slice(manuallyClosed, notifications);
    expect(manuallyClosed).toBeGreaterThan(-1);
    expect(notifications).toBeGreaterThan(manuallyClosed);
    expect(branch).not.toContain("cases += inserted.rowCount");
    expect(branch).toContain("continue;");
  });

  it("guards Jarvis case upserts by source", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    expect(source).toContain("ON CONFLICT (tenant_id,signal_key) DO UPDATE SET");
    expect(source).toContain("WHERE jarvis_cases.source='active_manager'");
  });

  it("keeps support review deduplication isolated by tenant", () => {
    const a = managerSupportSourceRef("crm", "platform_defect", "same-fingerprint", "tenant-a");
    const b = managerSupportSourceRef("crm", "platform_defect", "same-fingerprint", "tenant-b");
    const global = managerSupportSourceRef("crm", "platform_defect", "same-fingerprint");
    expect(a).not.toBe(b);
    expect(a).not.toBe(global);
    expect(b).not.toBe(global);
    expect(a).toBe(managerSupportSourceRef("crm", "platform_defect", "same-fingerprint", "tenant-a"));
    expect(() => managerSupportSourceRef("crm", "platform_defect", "x", " ")).toThrow("TENANT_REQUIRED");
  });

  it("routes tenant operations to Jarvis", () => {
    for (const kind of ["tenant_guidance", "tenant_configuration", "tenant_operation"] as const) {
      expect(classifyManagerDemand(kind)).toMatchObject({
        route: "jarvis",
        approval: "tenant_when_required",
        mayChangePlatformCode: false,
      });
    }
  });

  it("requires Superadmin approval for platform work, security and unknown cases", () => {
    for (const kind of ["platform_defect", "platform_improvement", "shared_behavior", "security_incident", "unknown"] as const) {
      expect(classifyManagerDemand(kind)).toMatchObject({
        route: "superadmin_support",
        approval: "superadmin_required",
        mayChangePlatformCode: false,
      });
    }
    expect(classifyManagerDemand("security_incident").requiresImmediateAttention).toBe(true);
  });

  it("schedules regular reviews even without an incident", () => {
    const now = new Date("2026-10-09T18:30:00Z");
    expect(isManagerDue("pipeline", null, now)).toBe(true);
    expect(isManagerDue("pipeline", new Date("2026-10-09T18:16:00Z"), now)).toBe(false);
    expect(isManagerDue("pipeline", new Date("2026-10-09T18:15:00Z"), now)).toBe(true);
    expect(isManagerDue("marketing", new Date("2026-10-09T17:30:00Z"), now)).toBe(true);
    expect(isManagerDue("arqdor", new Date("2026-10-09T17:30:00Z"), now)).toBe(false);
  });

  it("recovers from a future last-success timestamp without starving scans", () => {
    const now = new Date("2026-10-09T18:30:00Z");
    const erroneousFuture = new Date("2026-10-10T18:30:00Z");
    expect(isManagerDue("crm", erroneousFuture, now)).toBe(true);
    expect(isManagerDue("crm", new Date("invalid"), now)).toBe(true);
    expect(isManagerDue("crm", now, new Date("invalid"))).toBe(false);
  });

  it("rejects unknown cadence domains rather than scheduling silently", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const unexpected = "unknown_domain" as Parameters<typeof managerExecutionBucket>[0];
    expect(() => managerExecutionBucket(unexpected, now)).toThrow("INVALID_MANAGER_DOMAIN");
    expect(isManagerDue(unexpected, null, now)).toBe(false);
    expect(isManagerDue(unexpected, new Date("2026-10-10T11:00:00Z"), now)).toBe(false);
  });

  it("rotates tenant pages deterministically and independently by cadence", () => {
    const start = new Date("2026-10-10T12:00:00Z");
    const nextQuarter = new Date("2026-10-10T12:15:00Z");
    expect(managerTenantPageOffset("crm", start, 500)).toBe(0);
    const first = managerTenantPageOffset("crm", start, 1200);
    const next = managerTenantPageOffset("crm", nextQuarter, 1200);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(next).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1200);
    expect(next).toBeLessThan(1200);
    expect(next).not.toBe(first);
    expect(managerTenantPageOffset("marketing", start, 1200))
      .toBe(managerTenantPageOffset("marketing", nextQuarter, 1200));
  });

  it("rejects invalid pagination and manager clocks", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(managerTenantPageOffset("crm", now, 0)).toBe(0);
    expect(() => managerTenantPageOffset("crm", now, -1)).toThrow("INVALID_MANAGER_PAGINATION");
    expect(() => managerTenantPageOffset("crm", now, 100, 0)).toThrow("INVALID_MANAGER_PAGINATION");
    expect(() => managerTenantPageOffset("crm", new Date("invalid"), 100)).toThrow("INVALID_MANAGER_TIME");
    expect(() => managerTenantPageOffset("not_a_domain" as "crm", now, 100))
      .toThrow("INVALID_MANAGER_DOMAIN");
  });

  it("keeps the same idempotency bucket during an interval", () => {
    expect(managerExecutionBucket("pipeline", new Date("2026-10-09T18:00:01Z")))
      .toBe(managerExecutionBucket("pipeline", new Date("2026-10-09T18:14:59Z")));
    expect(managerExecutionBucket("pipeline", new Date("2026-10-09T18:15:00Z")))
      .not.toBe(managerExecutionBucket("pipeline", new Date("2026-10-09T18:14:59Z")));
  });

  it("deduplicates hourly marketing independently of 15-minute CRM", () => {
    const a = new Date("2026-10-09T18:00:01Z");
    const b = new Date("2026-10-09T18:45:59Z");
    const c = new Date("2026-10-09T19:00:01Z");
    expect(managerExecutionBucket("marketing", a)).toBe(managerExecutionBucket("marketing", b));
    expect(managerExecutionBucket("marketing", b)).not.toBe(managerExecutionBucket("marketing", c));
    expect(managerExecutionBucket("crm", a)).not.toBe(managerExecutionBucket("crm", b));
    expect(managerExecutionBucket("crm", b)).not.toBe(managerExecutionBucket("crm", c));
  });

  it("rejects findings without tenant identity or evidence", () => {
    expect(() => validateManagerOpportunity({ tenantId: "", domain: "crm", kind: "tenant_operation", fingerprint: "x", evidence: "abc" })).toThrow("TENANT_REQUIRED");
    expect(() => validateManagerOpportunity({ tenantId: "t", domain: "crm", kind: "tenant_operation", fingerprint: "x", evidence: "" })).toThrow("EVIDENCE_REQUIRED");
  });
});
