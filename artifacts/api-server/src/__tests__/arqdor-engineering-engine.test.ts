import { describe, expect, it } from "vitest";
import {
  calculateEngineeringQuote,
  evaluateCondition,
  evaluateRule,
} from "../lib/arqdor-engineering-engine.js";
import { archicentroReferenceConfigurations } from "../lib/arqdor-engineering-reference-archicentro.js";

describe("Arqdor engineering engine", () => {
  it("bloqueia configuração fora dos limites técnicos cadastrados", () => {
    const maximar = archicentroReferenceConfigurations.find((item) => item.code === "COMFORT-MAXIMAR")!;
    const result = calculateEngineeringQuote({
      configuration: maximar,
      components: [],
      request: {
        widthMm: 1200,
        heightMm: 900,
        leafCount: 1,
        glassThicknessMm: 6,
      },
    });

    expect(result.valid).toBe(false);
    expect(result.validations.some((item) => item.code === "configuration.widthMm:max")).toBe(true);
  });

  it("aceita espessura de vidro homologada e rejeita uma não cadastrada", () => {
    const oscilo = archicentroReferenceConfigurations.find((item) => item.code === "ELEGANCE-OSCILO-BATENTE")!;

    const valid = calculateEngineeringQuote({
      configuration: oscilo,
      components: [],
      request: {
        widthMm: 900,
        heightMm: 1400,
        leafCount: 1,
        glassThicknessMm: 34,
      },
    });
    expect(valid.valid).toBe(true);

    const invalid = calculateEngineeringQuote({
      configuration: oscilo,
      components: [],
      request: {
        widthMm: 900,
        heightMm: 1400,
        leafCount: 1,
        glassThicknessMm: 18,
      },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.validations.some((item) => item.code === "configuration.glassThickness")).toBe(true);
  });

  it("calcula regras de perímetro, área e condições sem IA", () => {
    const request = {
      widthMm: 1500,
      heightMm: 1200,
      leafCount: 2,
      options: { trim: true },
    };

    expect(
      evaluateRule(
        {
          op: "perimeter",
          width: { op: "input", field: "widthMm" },
          height: { op: "input", field: "heightMm" },
        },
        request,
      ),
    ).toBe(5400);

    expect(
      evaluateRule(
        {
          op: "area",
          width: { op: "divide", numerator: { op: "input", field: "widthMm" }, denominator: { op: "constant", value: 1000 } },
          height: { op: "divide", numerator: { op: "input", field: "heightMm" }, denominator: { op: "constant", value: 1000 } },
        },
        request,
      ),
    ).toBeCloseTo(1.8, 6);

    expect(evaluateCondition({ op: "optionEquals", key: "trim", value: true }, request)).toBe(true);
  });

  it("gera BOM rastreável e arredonda perfil linear para barra comercial", () => {
    const maximar = archicentroReferenceConfigurations.find((item) => item.code === "COMFORT-MAXIMAR")!;
    const result = calculateEngineeringQuote({
      configuration: maximar,
      components: [
        {
          code: "TEST-MARCO",
          name: "Perfil de marco de teste",
          group: "profile",
          role: "frame",
          unit: "m",
          commercialLengthMm: 6000,
          costValue: 20,
          saleValue: 30,
          quantityRule: {
            op: "divide",
            numerator: {
              op: "perimeter",
              width: { op: "input", field: "widthMm" },
              height: { op: "input", field: "heightMm" },
            },
            denominator: { op: "constant", value: 1000 },
          },
        },
      ],
      request: {
        widthMm: 900,
        heightMm: 900,
        leafCount: 1,
        glassThicknessMm: 6,
      },
    });

    expect(result.valid).toBe(true);
    expect(result.bom[0]?.theoreticalQuantity).toBe(3.6);
    expect(result.bom[0]?.commercialUnits).toBe(1);
    expect(result.bom[0]?.billedQuantity).toBe(6);
    expect(result.totals.cost).toBe(120);
    expect(result.totals.sale).toBe(180);
    expect(result.bom[0]?.trace.length).toBeGreaterThan(0);
  });

  it("não declara atendimento de desempenho quando não há ensaio compatível", () => {
    const maximar = archicentroReferenceConfigurations.find((item) => item.code === "COMFORT-MAXIMAR")!;
    const result = calculateEngineeringQuote({
      configuration: maximar,
      components: [],
      performanceEvidence: [],
      request: {
        widthMm: 900,
        heightMm: 900,
        leafCount: 1,
        glassThicknessMm: 6,
        requiredPerformance: { acousticDb: 35 },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.validations.some((item) => item.code === "performance.noEvidence")).toBe(true);
  });
});
