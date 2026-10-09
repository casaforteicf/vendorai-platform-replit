import { describe, expect, it } from "vitest";
import {
  classifyManagerDemand,
  isManagerDue,
  managerExecutionBucket,
  validateManagerOpportunity,
} from "./agent-manager-policy.js";

describe("agent manager policy", () => {
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

  it("keeps the same idempotency bucket during an interval", () => {
    expect(managerExecutionBucket("pipeline", new Date("2026-10-09T18:00:01Z")))
      .toBe(managerExecutionBucket("pipeline", new Date("2026-10-09T18:14:59Z")));
    expect(managerExecutionBucket("pipeline", new Date("2026-10-09T18:15:00Z")))
      .not.toBe(managerExecutionBucket("pipeline", new Date("2026-10-09T18:14:59Z")));
  });

  it("rejects findings without tenant identity or evidence", () => {
    expect(() => validateManagerOpportunity({ tenantId: "", domain: "crm", kind: "tenant_operation", fingerprint: "x", evidence: "abc" })).toThrow("TENANT_REQUIRED");
    expect(() => validateManagerOpportunity({ tenantId: "t", domain: "crm", kind: "tenant_operation", fingerprint: "x", evidence: "" })).toThrow("EVIDENCE_REQUIRED");
  });
});
