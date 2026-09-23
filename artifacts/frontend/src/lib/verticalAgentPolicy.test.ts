import { describe, expect, it } from "vitest";
import { isAgentAllowedForVertical } from "./verticalAgentPolicy";

describe("verticalAgentPolicy", () => {
  it("mantém agentes genéricos disponíveis em qualquer vertical", () => {
    expect(isAgentAllowedForVertical("closer", "Farmácia")).toBe(true);
    expect(isAgentAllowedForVertical("prospector", "Veículos")).toBe(true);
  });

  it("mostra o agente de farmácia somente para vertical de farmácia", () => {
    expect(isAgentAllowedForVertical("farmacia", "Farmácia")).toBe(true);
    expect(isAgentAllowedForVertical("farmacia", "farmacia")).toBe(true);
    expect(isAgentAllowedForVertical("farmacia", "Veículos")).toBe(false);
    expect(isAgentAllowedForVertical("farmacia", "Supermercado")).toBe(false);
    expect(isAgentAllowedForVertical("farmacia", "Construtora")).toBe(false);
  });

  it("falha fechado quando um agente especializado não tem vertical compatível", () => {
    expect(isAgentAllowedForVertical("farmacia", null)).toBe(false);
    expect(isAgentAllowedForVertical("farmacia", "")).toBe(false);
  });
});
