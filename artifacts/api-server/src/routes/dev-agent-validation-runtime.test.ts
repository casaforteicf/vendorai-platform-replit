import { describe, expect, it } from "vitest";
import { resolveProductionRuntime } from "./dev_agent_validation.js";

describe("resolveProductionRuntime", () => {
  it("routes backend changes to Contabo only when explicitly configured", () => {
    const changedFiles = ["artifacts/api-server/src/routes/vendi.ts"];

    expect(resolveProductionRuntime({ changedFiles })).toBe("railway");
    expect(resolveProductionRuntime({ changedFiles, backendRuntime: "contabo" })).toBe("contabo");
  });

  it("routes frontend-only changes to Cloudflare regardless of backend preference", () => {
    expect(resolveProductionRuntime({
      changedFiles: ["artifacts/frontend/src/App.tsx"],
      backendRuntime: "contabo",
    })).toBe("cloudflare");
  });

  it("fails back to the legacy backend runtime for unknown values", () => {
    expect(resolveProductionRuntime({
      changedFiles: ["lib/db/src/schema/vendi_missions.ts"],
      backendRuntime: "unknown-provider",
    })).toBe("railway");
  });
});
