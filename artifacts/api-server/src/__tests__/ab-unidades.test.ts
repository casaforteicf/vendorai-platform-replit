import { describe, expect, it } from "vitest";
import {
  converterParaBase,
  ErroConversao,
  normalizarUnidade,
  unidadeBaseDoInsumo,
} from "../lib/ab/unidades.js";

/**
 * Conversão de unidades do estoque (AB-04).
 *
 * O risco real aqui é silencioso: 2 kg lido como 2 g deixa o saldo 1000× menor e
 * a sugestão de compra 1000× maior. Por isso os casos negativos são tantos
 * quanto os positivos.
 */
describe("normalizarUnidade", () => {
  it("ignora caixa, espaço e acento", () => {
    expect(normalizarUnidade(" KG ")).toBe("kg");
    expect(normalizarUnidade("Pç")).toBe("pc");
    expect(normalizarUnidade("Litros")).toBe("litros");
    expect(normalizarUnidade(null)).toBe("");
  });
});

describe("unidadeBaseDoInsumo", () => {
  it("só aceita g, ml e un", () => {
    expect(unidadeBaseDoInsumo("g")).toBe("g");
    expect(unidadeBaseDoInsumo("ML")).toBe("ml");
    expect(unidadeBaseDoInsumo("un")).toBe("un");
    expect(unidadeBaseDoInsumo("kg")).toBeNull();
    expect(unidadeBaseDoInsumo("")).toBeNull();
  });
});

describe("converterParaBase", () => {
  it("converte massa (kg → g)", () => {
    expect(converterParaBase(2, "kg", "g")).toBe(2000);
    expect(converterParaBase(0.5, "kg", "g")).toBe(500);
    expect(converterParaBase(250, "g", "g")).toBe(250);
  });

  it("converte volume (l → ml)", () => {
    expect(converterParaBase(1.5, "l", "ml")).toBe(1500);
    expect(converterParaBase(250, "ml", "ml")).toBe(250);
  });

  it("mantém contagem (un → un)", () => {
    expect(converterParaBase(12, "un", "un")).toBe(12);
    expect(converterParaBase(3, "Pç", "un")).toBe(3);
  });

  it("aceita aliases em caixa alta e com espaço", () => {
    expect(converterParaBase(2, " KG ", "g")).toBe(2000);
    expect(converterParaBase(2, "Litros", "ml")).toBe(2000);
  });

  it("arredonda a 4 casas", () => {
    expect(converterParaBase(0.3333333, "kg", "g")).toBe(333.3333);
  });

  it("recusa conversão entre massa e volume (sem densidade)", () => {
    expect(() => converterParaBase(1, "kg", "ml")).toThrow(ErroConversao);
    expect(() => converterParaBase(1, "kg", "ml")).toThrow(/densidade/i);
  });

  it("recusa unidade não métrica sem fator de embalagem", () => {
    expect(() => converterParaBase(2, "saco", "g")).toThrow(/fator de embalagem/i);
    expect(() => converterParaBase(2, "caixa", "un")).toThrow(/fator de embalagem/i);
  });

  it("converte unidade não métrica quando há fator", () => {
    // 1 saco = 50 kg = 50000 g
    expect(converterParaBase(0.5, "saco", "g", { fatorEmbalagem: 50_000 })).toBe(25_000);
    // 1 caixa = 12 un
    expect(converterParaBase(2, "caixa", "un", { fatorEmbalagem: 12 })).toBe(24);
  });

  it("ignora fator inválido e recusa", () => {
    expect(() => converterParaBase(1, "saco", "g", { fatorEmbalagem: 0 })).toThrow(ErroConversao);
    expect(() => converterParaBase(1, "saco", "g", { fatorEmbalagem: -5 })).toThrow(ErroConversao);
  });

  it("recusa unidade base inválida", () => {
    expect(() => converterParaBase(1, "g", "kg")).toThrow(/Unidade base inválida/);
    expect(() => converterParaBase(1, "g", "")).toThrow(/Unidade base inválida/);
  });

  it("recusa quantidade não finita", () => {
    expect(() => converterParaBase(Number.NaN, "kg", "g")).toThrow(ErroConversao);
  });

  it("preserva a identidade quando origem e destino são iguais", () => {
    expect(converterParaBase(7.25, "g", "g")).toBe(7.25);
    expect(converterParaBase(0, "kg", "g")).toBe(0);
  });
});
