import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  classifyManagerDemand,
  isManagerDue,
  managerExecutionBucket,
  validateManagerOpportunity,
} from "./agent-manager-policy.js";

describe("agent manager policy", () => {
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
