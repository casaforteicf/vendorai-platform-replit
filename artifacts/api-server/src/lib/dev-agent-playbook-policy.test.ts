import { describe, expect, it } from "vitest";
import { buildDevQualitySnapshot } from "../routes/dev_agent_quality.js";
import type { ExecutionMemoryEntry } from "../routes/dev_agent_memory.js";

function execution(status: string, overrides: Partial<ExecutionMemoryEntry> = {}): ExecutionMemoryEntry {
  return {
    requestId: overrides.requestId ?? `req-${status}`,
    route: overrides.route ?? "/support/dev/example",
    recordedAt: overrides.recordedAt ?? "2026-09-05T19:00:00.000Z",
    status,
    summary: overrides.summary ?? status,
    changedFiles: overrides.changedFiles ?? ["artifacts/api-server/src/routes/example.ts"],
    engines: overrides.engines ?? ["executor"],
    failures: overrides.failures ?? [],
    evidence: overrides.evidence ?? [],
    ...overrides,
  };
}

describe("Dev IA proven playbook policy", () => {
  it("promotes only production_validated executions with changed files and zero failures", () => {
    const snapshot = buildDevQualitySnapshot([
      execution("production_validated", { requestId: "validated" }),
      execution("production_recovered", { requestId: "recovered" }),
      execution("completed", { requestId: "completed" }),
      execution("success", { requestId: "success" }),
      execution("deploy_pending", { requestId: "deploy" }),
      execution("production_validated", { requestId: "no-files", changedFiles: [] }),
      execution("production_validated", { requestId: "failed", failures: ["test failure"] }),
    ]);

    expect(snapshot.metrics.provenPlaybooks).toBe(1);
    expect(snapshot.metrics.validated).toBe(1);
  });

  it("does not count sentinel or runtime system memory as a proven playbook", () => {
    const snapshot = buildDevQualitySnapshot([
      execution("production_validated", {
        requestId: "sentinel",
        engines: ["production sentinel"],
      }),
      execution("production_validated", {
        requestId: "runtime",
        engines: ["server runtime"],
      }),
    ]);

    expect(snapshot.metrics.provenPlaybooks).toBe(0);
    expect(snapshot.metrics.executions).toBe(0);
  });
});
