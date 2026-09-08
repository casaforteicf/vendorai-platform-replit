import { describe, expect, it } from "vitest";
import { resolveJarvisCapability } from "./jarvis-capability-profile.js";

describe("resolveJarvisCapability", () => {
  it("classifica tributário como domínio atual e profissional", () => {
    const result = resolveJarvisCapability("Jarvis, revise ICMS, NCM e CFOP deste produto");
    expect(result.family).toBe("tax");
    expect(result.freshnessRequired).toBe(true);
    expect(result.professionalReview).toBe(true);
    expect(result.tenantDataUseful).toBe(true);
  });

  it("classifica mercado financeiro como transitório e dependente de fonte atual", () => {
    const result = resolveJarvisCapability("Quanto está o Bitcoin e o dólar agora?");
    expect(result.family).toBe("market_data");
    expect(result.freshnessRequired).toBe(true);
    expect(result.transientByDefault).toBe(true);
  });

  it("classifica coaching e estratégia como contexto empresarial", () => {
    const result = resolveJarvisCapability("Quero coaching de alta performance para bater minha meta de vendas");
    expect(result.family).toBe("growth_performance");
    expect(result.tenantDataUseful).toBe(true);
    expect(result.transientByDefault).toBe(false);
  });

  it("mantém recomendação de filmes e livros fora da memória empresarial por padrão", () => {
    const result = resolveJarvisCapability("Me indique um filme e um livro para o fim de semana");
    expect(result.family).toBe("recommendations_lifestyle");
    expect(result.transientByDefault).toBe(true);
    expect(result.tenantDataUseful).toBe(false);
  });

  it("usa conhecimento geral quando não existe domínio específico", () => {
    const result = resolveJarvisCapability("Por que o céu é azul?");
    expect(result.family).toBe("general_knowledge");
  });
});
