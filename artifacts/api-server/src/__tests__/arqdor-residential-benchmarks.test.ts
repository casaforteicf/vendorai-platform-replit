import { describe, expect, it } from "vitest";
import {
  ARQDOR_BRAZILIAN_RESIDENTIAL_BENCHMARKS,
  benchmarkCoverageSummary,
  evaluateBenchmarkResult,
} from "../lib/arqdor/residential-benchmarks";

describe("Arqdor Brazilian Residential Benchmark Suite", () => {
  it("cobre um conjunto amplo de cenários residenciais brasileiros", () => {
    const summary = benchmarkCoverageSummary();
    expect(summary.cases).toBeGreaterThanOrEqual(12);
    expect(summary.tags).toEqual(expect.arrayContaining([
      "urbano",
      "sul",
      "familia",
      "multigeracional",
      "acessibilidade",
      "custo",
      "gourmet",
      "topografia",
      "litoral",
      "pickup",
      "sobrado",
      "investimento",
      "condominio",
    ]));
    expect(summary.dimensions).toEqual(expect.arrayContaining([
      "function",
      "circulation",
      "privacy",
      "ergonomics",
      "climate",
      "constructability",
      "cost",
      "futureFit",
      "identity",
    ]));
  });

  it("cada benchmark possui invariantes e padrões de falha explícitos", () => {
    for (const benchmark of ARQDOR_BRAZILIAN_RESIDENTIAL_BENCHMARKS) {
      expect(benchmark.id.length).toBeGreaterThan(3);
      expect(benchmark.invariants.length).toBeGreaterThanOrEqual(2);
      expect(benchmark.forbiddenFailurePatterns.length).toBeGreaterThanOrEqual(2);
      expect(benchmark.requiredDimensions.length).toBeGreaterThanOrEqual(3);
      expect(benchmark.brief.lotWidth).toBeGreaterThan(0);
      expect(benchmark.brief.lotDepth).toBeGreaterThan(0);
      expect(benchmark.brief.desiredArea).toBeGreaterThan(40);
    }
  });

  it("reprova resultado com eixo obrigatório fraco", () => {
    const benchmark = ARQDOR_BRAZILIAN_RESIDENTIAL_BENCHMARKS.find((item) => item.id === "compact-budget")!;
    const evaluation = evaluateBenchmarkResult(benchmark, {
      multiObjective: {
        utilityScore: 84,
        vector: {
          function: 86,
          ergonomics: 82,
          constructability: 55,
          cost: 88,
        },
      },
    });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.weakDimensions).toContain("constructability");
  });

  it("reprova quando uma falha conhecida reaparece", () => {
    const benchmark = ARQDOR_BRAZILIAN_RESIDENTIAL_BENCHMARKS.find((item) => item.id === "pickup-garage")!;
    const evaluation = evaluateBenchmarkResult(benchmark, {
      multiObjective: {
        utilityScore: 87,
        vector: {
          function: 90,
          ergonomics: 84,
          circulation: 86,
        },
      },
      qualityIssues: ["Acesso garagem-quarto foi detectado durante a validação."],
    });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.forbiddenMatches).toContain("acesso garagem-quarto");
  });

  it("aprova resultado equilibrado sem regressões conhecidas", () => {
    const benchmark = ARQDOR_BRAZILIAN_RESIDENTIAL_BENCHMARKS.find((item) => item.id === "urban-narrow-south")!;
    const evaluation = evaluateBenchmarkResult(benchmark, {
      multiObjective: {
        utilityScore: 85,
        vector: {
          function: 86,
          circulation: 84,
          privacy: 82,
          climate: 80,
          constructability: 81,
          cost: 79,
        },
      },
      hardBlockers: [],
      qualityIssues: [],
    });
    expect(evaluation.passed).toBe(true);
  });
});
