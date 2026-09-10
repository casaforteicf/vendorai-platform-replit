import { describe, expect, it } from "vitest";
import { buildJarvisDecisionContext, resolveJarvisDecisionMode } from "./jarvis-decision-engine.js";

describe("Jarvis Decision Engine", () => {
  it("detects commercial decisions", () => {
    expect(resolveJarvisDecisionMode("Vale a pena dar desconto para fechar esta proposta?").mode).toBe("commercial");
  });

  it("detects people decisions", () => {
    expect(resolveJarvisDecisionMode("Devo demitir este vendedor pelo desempenho?").mode).toBe("high_stakes");
  });

  it("detects reversible experiments", () => {
    expect(resolveJarvisDecisionMode("Vamos testar um piloto por uma semana?").mode).toBe("reversible");
  });

  it("requires a concrete executive recommendation", () => {
    const context = buildJarvisDecisionContext("Qual o melhor caminho para essa decisão?");
    expect(context).toContain("Decision Engine do JARVIS");
    expect(context).toContain("Decisão final");
    expect(context).toContain("Resultado esperado");
    expect(context).toContain("Condição de parada");
  });
});
