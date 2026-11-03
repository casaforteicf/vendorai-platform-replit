import { describe, expect, it } from "vitest";
import { planejarBaixa, type LinhaSaldoEstoque } from "../lib/ab/saida-estoque.js";

/**
 * Plano de baixa da requisição (AB-08) — a parte pura, que decide de onde tirar.
 *
 * O risco aqui é duplo: entregar sem ter saldo (some com a mercadoria no papel)
 * ou tirar de mais (negativa o estoque). Os casos negativos cobrem os dois.
 */

function linha(locationId: string, quantidade: number): LinhaSaldoEstoque {
  return { locationId, inventoryItemId: "item-1", quantidade };
}

describe("planejarBaixa", () => {
  it("aloca tudo de um único local quando há saldo", () => {
    const plano = planejarBaixa({ linhas: [linha("loc-a", 10)], quantidadeNecessaria: 4 });

    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.alocacoes).toEqual([
      { locationId: "loc-a", inventoryItemId: "item-1", quantidade: 4 },
    ]);
  });

  it("quebra entre locais, começando pelo maior saldo", () => {
    const plano = planejarBaixa({
      linhas: [linha("loc-pequeno", 2), linha("loc-grande", 10)],
      quantidadeNecessaria: 7,
    });

    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.alocacoes[0]).toMatchObject({ locationId: "loc-grande", quantidade: 7 });
    expect(plano.alocacoes).toHaveLength(1);
  });

  it("usa dois locais quando um só não cobre", () => {
    const plano = planejarBaixa({
      linhas: [linha("loc-a", 3), linha("loc-b", 5)],
      quantidadeNecessaria: 6,
    });

    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    const total = plano.alocacoes.reduce((s, a) => s + a.quantidade, 0);
    expect(total).toBe(6);
    expect(plano.alocacoes.map((a) => a.locationId)).toEqual(["loc-b", "loc-a"]);
  });

  it("bloqueia quando o saldo total é insuficiente, com os números", () => {
    const plano = planejarBaixa({ linhas: [linha("loc-a", 3)], quantidadeNecessaria: 10 });

    expect(plano.ok).toBe(false);
    if (plano.ok) return;
    expect(plano.motivo).toMatch(/Saldo insuficiente/);
    expect(plano.disponivel).toBe(3);
    expect(plano.necessario).toBe(10);
  });

  it("ignora linhas zeradas ou negativas", () => {
    const plano = planejarBaixa({
      linhas: [linha("loc-zero", 0), linha("loc-neg", -5), linha("loc-ok", 4)],
      quantidadeNecessaria: 4,
    });

    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.alocacoes).toEqual([
      { locationId: "loc-ok", inventoryItemId: "item-1", quantidade: 4 },
    ]);
  });

  it("recusa quantidade de baixa inválida", () => {
    expect(planejarBaixa({ linhas: [linha("loc-a", 10)], quantidadeNecessaria: 0 }).ok).toBe(false);
  });

  it("cobre exatamente o saldo disponível", () => {
    const plano = planejarBaixa({
      linhas: [linha("loc-a", 2.5), linha("loc-b", 2.5)],
      quantidadeNecessaria: 5,
    });

    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.alocacoes.reduce((s, a) => s + a.quantidade, 0)).toBe(5);
  });

  it("não deixa sobra fracionária quebrada no arredondamento", () => {
    const plano = planejarBaixa({
      linhas: [linha("loc-a", 0.3333), linha("loc-b", 0.3333)],
      quantidadeNecessaria: 0.6666,
    });

    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    const total = plano.alocacoes.reduce((s, a) => s + a.quantidade, 0);
    expect(total).toBe(0.6666);
  });
});
