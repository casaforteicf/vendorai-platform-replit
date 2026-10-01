import { describe, expect, it } from "vitest";
import { agentKeyForRuntime, primaryRuntimeForKey, resolveActivation } from "./agent-activation-policy.js";

describe("agent activation consistency", () => {
  it("honors a disabled Hub switch even when the legacy SDR is enabled", () => {
    expect(resolveActivation(false, true)).toBe(false);
  });
  it("honors an explicit enabled Hub switch over stale legacy state", () => {
    expect(resolveActivation(true, false)).toBe(true);
  });
  it("preserves existing legacy tenants without a Hub row", () => {
    expect(resolveActivation(undefined, true)).toBe(true);
    expect(resolveActivation(undefined, false)).toBe(false);
  });
  it("fails closed without either configuration", () => {
    expect(resolveActivation(undefined, undefined)).toBe(false);
  });
  it.each([
    ["sdr", "sdr"], ["closer", "closer"], ["service", "suporte"],
    ["scheduler", "agendamento"], ["relacionamento", "pos_venda"],
    ["reception", "recepcao"], ["pharmacy", "farmacia"],
  ])("maps runtime %s to Hub %s and back", (runtime, key) => {
    expect(agentKeyForRuntime(runtime)).toBe(key);
    expect(primaryRuntimeForKey(key)).toBe(runtime);
  });
  it("applies the SDR/support master switches to their aliases", () => {
    expect(agentKeyForRuntime("followup")).toBe("sdr");
    expect(agentKeyForRuntime("reactivation")).toBe("sdr");
    expect(agentKeyForRuntime("onboarding")).toBe("suporte");
  });
});
