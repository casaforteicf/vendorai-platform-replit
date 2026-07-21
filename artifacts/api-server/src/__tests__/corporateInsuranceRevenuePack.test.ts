import { describe, expect, it } from "vitest";
import {
  insuranceAutonomyCap,
  renewalWindow,
  scoreInsuranceOpportunity,
  validateInsuranceMessage,
} from "../services/corporateInsuranceRevenuePack.js";

describe("corporate insurance revenue industry pack", () => {
  const now = new Date("2026-07-21T12:00:00Z");

  it("classifica a régua 90/60/30/10 e vencido por data", () => {
    expect(renewalWindow(new Date("2026-10-19T12:00:00Z"), now)).toBe("90_dias");
    expect(renewalWindow(new Date("2026-09-19T12:00:00Z"), now)).toBe("60_dias");
    expect(renewalWindow(new Date("2026-08-20T12:00:00Z"), now)).toBe("30_dias");
    expect(renewalWindow(new Date("2026-07-31T12:00:00Z"), now)).toBe("10_dias");
    expect(renewalWindow(new Date("2026-07-20T12:00:00Z"), now)).toBe("vencido");
  });

  it("força humano e bloqueia ação comercial com sinistro aberto", () => {
    const result = scoreInsuranceOpportunity({
      expiresAt: new Date("2026-07-31T12:00:00Z"),
      now,
      claimOpen: true,
      competitiveSignal: true,
    });
    expect(result.priority).toBe("critica");
    expect(result.humanRequired).toBe(true);
    expect(result.blocked).toBe(true);
    expect(result.reasons).toContain("sinistro_em_aberto");
  });

  it("limita autonomia no lançamento e em suporte a sinistro", () => {
    expect(insuranceAutonomyCap({ requestedLevel: 6, launchMode: true })).toBe(3);
    expect(insuranceAutonomyCap({ requestedLevel: 5, launchMode: false, claimSupport: true })).toBe(2);
  });

  it("bloqueia dado de saúde individual e gatilho sensível em abordagem fria", () => {
    expect(validateInsuranceMessage("Vamos falar sobre seu diagnóstico.", { healthProduct: true }).allowed).toBe(false);
    expect(validateInsuranceMessage("Vimos que sua empresa foi processada.", { coldOutreach: true }).allowed).toBe(false);
    expect(validateInsuranceMessage("Podemos revisar sua rede credenciada?", { healthProduct: true }).allowed).toBe(true);
  });
});
