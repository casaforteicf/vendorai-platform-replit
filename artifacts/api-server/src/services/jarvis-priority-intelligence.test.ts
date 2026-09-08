import { describe, expect, it } from "vitest";
import {
  buildJarvisPriorityItem,
  extractExplicitFinancialImpact,
  resolvePriorityChangeType,
  scoreJarvisPriority,
} from "./jarvis-priority-intelligence.js";
import type { JarvisFinancialPrecedent } from "./jarvis-financial-prioritization-intelligence.js";

const now = new Date("2026-09-07T12:00:00.000Z");

function baseCase(overrides: Partial<Parameters<typeof buildJarvisPriorityItem>[0]> = {}) {
  return {
    id: "case-1",
    title: "Aumento de custo relevante",
    category: "Risco",
    severity: "risk",
    source: "news",
    metric: null,
    confidence: 80,
    impact: 90,
    recommendedAction: "Revisar margem e fornecedores.",
    firstDetectedAt: new Date("2026-09-07T08:00:00.000Z"),
    lastDetectedAt: new Date("2026-09-07T11:00:00.000Z"),
    updatedAt: new Date("2026-09-07T11:00:00.000Z"),
    ...overrides,
  };
}

function financialPrecedent(overrides: Partial<JarvisFinancialPrecedent> = {}): JarvisFinancialPrecedent {
  return {
    key: "Risco:revisar margem e fornecedores",
    category: "Risco",
    actionKey: "revisar margem e fornecedores",
    actionLabel: "Revisar margem e fornecedores.",
    sampleSize: 4,
    medianImpactBrl: 50000,
    minImpactBrl: 20000,
    maxImpactBrl: 90000,
    positiveOutcomes: 3,
    neutralOutcomes: 0,
    negativeOutcomes: 1,
    positiveRatePercent: 75,
    confidence: 80,
    caseIds: ["old-1", "old-2", "old-3", "old-4"],
    ...overrides,
  };
}

describe("jarvis priority intelligence", () => {
  it("só reconhece impacto financeiro quando a métrica traz moeda explícita", () => {
    expect(extractExplicitFinancialImpact("Impacto estimado R$ 12.345,67/mês")).toMatchObject({
      amount: 12345.67,
      currency: "BRL",
      source: "metric",
    });
    expect(extractExplicitFinancialImpact("impacto 85 pontos")).toBeNull();
    expect(extractExplicitFinancialImpact("crescimento 20%" )).toBeNull();
  });

  it("classifica mudança recente sem inventar evento novo", () => {
    expect(resolvePriorityChangeType(baseCase(), now)).toBe("new");
    expect(resolvePriorityChangeType(baseCase({
      firstDetectedAt: new Date("2026-08-20T08:00:00.000Z"),
      lastDetectedAt: new Date("2026-09-07T10:00:00.000Z"),
      updatedAt: new Date("2026-09-07T10:00:00.000Z"),
    }), now)).toBe("updated");
    expect(resolvePriorityChangeType(baseCase({
      firstDetectedAt: new Date("2026-08-20T08:00:00.000Z"),
      lastDetectedAt: new Date("2026-08-21T10:00:00.000Z"),
      updatedAt: new Date("2026-08-21T10:00:00.000Z"),
    }), now)).toBe("ongoing");
  });

  it("prioriza risco de alto impacto e confiança acima de atenção antiga", () => {
    const high = scoreJarvisPriority(baseCase({ metric: "R$ 50.000,00 em exposição" }), now);
    const low = scoreJarvisPriority(baseCase({
      severity: "attention",
      confidence: 40,
      impact: 30,
      firstDetectedAt: new Date("2026-08-01T08:00:00.000Z"),
      lastDetectedAt: new Date("2026-08-02T08:00:00.000Z"),
      updatedAt: new Date("2026-08-02T08:00:00.000Z"),
    }), now);
    expect(high).toBeGreaterThan(low);
  });

  it("leva recomendação existente e deixa financeiro nulo quando não há valor explícito", () => {
    const item = buildJarvisPriorityItem(baseCase(), now);
    expect(item.changeType).toBe("new");
    expect(item.recommendedAction).toBe("Revisar margem e fornecedores.");
    expect(item.explicitFinancialImpact).toBeNull();
    expect(item.historicalFinancialEstimate).toBeNull();
  });

  it("usa precedente financeiro do tenant quando não há valor atual explícito", () => {
    const baseline = buildJarvisPriorityItem(baseCase(), now);
    const learned = buildJarvisPriorityItem(baseCase(), now, financialPrecedent());

    expect(learned.priorityScore).toBeGreaterThan(baseline.priorityScore);
    expect(learned.historicalFinancialEstimate).toMatchObject({
      medianAmount: 50000,
      sampleSize: 4,
      positiveRatePercent: 75,
      source: "tenant_history",
    });
  });

  it("mantém valor explícito atual acima do precedente histórico", () => {
    const item = buildJarvisPriorityItem(
      baseCase({ metric: "Exposição atual R$ 120.000,00" }),
      now,
      financialPrecedent({ medianImpactBrl: 500000 }),
    );

    expect(item.explicitFinancialImpact?.amount).toBe(120000);
    expect(item.historicalFinancialEstimate).toBeNull();
  });
});
