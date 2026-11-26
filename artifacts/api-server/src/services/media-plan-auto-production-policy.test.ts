import { describe, expect, it } from "vitest";
import {
  automaticProductionLimit,
  DEFAULT_AUTOMATIC_MONTHLY_LIMIT,
  planAllowsAutomaticProduction,
} from "./media-plan-auto-production-policy";

describe("planAllowsAutomaticProduction", () => {
  it("só libera planos que optaram por publicação automática", () => {
    expect(planAllowsAutomaticProduction({ modo: "automatico" })).toBe(true);
    expect(planAllowsAutomaticProduction({ modo: "manual" })).toBe(false);
    expect(planAllowsAutomaticProduction(null)).toBe(false);
    expect(planAllowsAutomaticProduction(undefined)).toBe(false);
  });

  it("o override global libera qualquer plano", () => {
    expect(planAllowsAutomaticProduction({ modo: "manual" }, true)).toBe(true);
    expect(planAllowsAutomaticProduction(null, true)).toBe(true);
  });
});

describe("automaticProductionLimit", () => {
  it("aplica o teto de 50 mesmo em planos maiores", () => {
    expect(automaticProductionLimit(200)).toBe(DEFAULT_AUTOMATIC_MONTHLY_LIMIT);
    expect(automaticProductionLimit(150)).toBe(50);
  });

  it("nunca aumenta o limite do plano", () => {
    expect(automaticProductionLimit(20)).toBe(20);
    expect(automaticProductionLimit(30, 50)).toBe(30);
  });

  it("respeita um teto configurado menor", () => {
    expect(automaticProductionLimit(200, 80)).toBe(80);
    expect(automaticProductionLimit(200, 10)).toBe(10);
  });

  it("usa valores seguros quando o plano não tem limite válido", () => {
    expect(automaticProductionLimit(0)).toBe(20);
    expect(automaticProductionLimit(Number.NaN, 50)).toBe(20);
    expect(automaticProductionLimit(200, Number.NaN)).toBe(50);
  });
});
