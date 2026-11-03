import { describe, expect, it } from "vitest";
import { converterDeBase, ErroConversao } from "../lib/ab/unidades.js";

/**
 * Conversão base → unidade de estoque (AB-07).
 *
 * É o sentido inverso do recebimento: o A&B registra em g/ml/un e o saldo do
 * hotel está em kg/saco/caixa. Errar aqui é pior que no AB-04, porque o valor
 * vai direto para o saldo físico — 20000 g somados como "20000 kg" quebrariam o
 * estoque por 1000×.
 */
describe("converterDeBase", () => {
  it("converte g → kg", () => {
    expect(converterDeBase(20_000, "g", "kg")).toBe(20);
    expect(converterDeBase(500, "g", "kg")).toBe(0.5);
  });

  it("mantém a mesma unidade", () => {
    expect(converterDeBase(1_500, "g", "g")).toBe(1500);
    expect(converterDeBase(12, "un", "un")).toBe(12);
  });

  it("converte ml → l", () => {
    expect(converterDeBase(2_500, "ml", "l")).toBe(2.5);
  });

  it("converte para unidade não métrica usando o fator de embalagem", () => {
    // 1 saco = 50 kg = 50000 g
    expect(converterDeBase(20_000, "g", "saco", { fatorEmbalagem: 50_000 })).toBe(0.4);
    // 1 caixa = 12 un
    expect(converterDeBase(24, "un", "caixa", { fatorEmbalagem: 12 })).toBe(2);
  });

  it("recusa unidade não métrica sem fator", () => {
    expect(() => converterDeBase(1000, "g", "saco")).toThrow(ErroConversao);
    expect(() => converterDeBase(1000, "g", "saco")).toThrow(/fator de embalagem/);
  });

  it("recusa famílias diferentes (g → l)", () => {
    expect(() => converterDeBase(1000, "g", "l")).toThrow(/densidade/);
  });

  it("recusa unidade base inválida", () => {
    expect(() => converterDeBase(1000, "kg", "kg")).toThrow(/Unidade base inválida/);
  });

  it("arredonda a 4 casas", () => {
    expect(converterDeBase(1, "g", "kg")).toBe(0.001);
    expect(converterDeBase(1, "ml", "l")).toBe(0.001);
  });

  it("é o inverso de converterParaBase no caminho métrico", () => {
    // 2 kg -> 2000 g -> de volta a kg
    const emGramas = 2000;
    expect(converterDeBase(emGramas, "g", "kg")).toBe(2);
  });
});
