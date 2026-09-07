import { describe, expect, it } from "vitest";
import { evaluateVariantEvidence } from "./campaignAbLearning.js";

describe("evaluateVariantEvidence", () => {
  it("continua coletando quando uma variante ainda não atingiu 20 envios", () => {
    const result = evaluateVariantEvidence({
      sampleA: 19,
      sampleB: 30,
      readsA: 10,
      readsB: 20,
      conversionsA: 1,
      conversionsB: 1,
    });

    expect(result.status).toBe("coletando");
    expect(result.winner).toBeNull();
    expect(result.provisionalLeader).toBeNull();
  });

  it("mantém inconclusivo quando o lift é menor que 20%", () => {
    const result = evaluateVariantEvidence({
      sampleA: 100,
      sampleB: 100,
      readsA: 60,
      readsB: 62,
      conversionsA: 10,
      conversionsB: 11,
    });

    expect(result.status).toBe("inconclusivo");
    expect(result.winner).toBeNull();
    expect(result.provisionalLeader).toBeNull();
  });

  it("trata liderança por leitura como sinal provisório sem vencedor", () => {
    const result = evaluateVariantEvidence({
      sampleA: 40,
      sampleB: 40,
      readsA: 30,
      readsB: 20,
      conversionsA: 0,
      conversionsB: 0,
    });

    expect(result.status).toBe("sinal_provisorio");
    expect(result.provisionalLeader).toBe("A");
    expect(result.winner).toBeNull();
  });

  it("declara vencedor somente com conversões suficientes e lift mínimo", () => {
    const result = evaluateVariantEvidence({
      sampleA: 100,
      sampleB: 100,
      readsA: 50,
      readsB: 60,
      conversionsA: 10,
      conversionsB: 5,
    });

    expect(result.status).toBe("vencedor");
    expect(result.winner).toBe("A");
    expect(result.provisionalLeader).toBeNull();
  });
});
