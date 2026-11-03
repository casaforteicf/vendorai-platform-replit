import { describe, expect, it } from "vitest";
import {
  calcularSugestoesCompra,
  type ConsumoRegistrado,
  type SaldoPolitica,
} from "../lib/ab/estoque-preditivo.js";

/**
 * Motor preditivo de estoque — A&B. Testa a regra, não o banco.
 * Auditoria: cada caso fixa uma decisão (ponto de pedido, lead time, cobertura).
 */

function saldo(over: Partial<SaldoPolitica> = {}): SaldoPolitica {
  return {
    insumoId: "insumo-1",
    insumoNome: "Arroz",
    unidade: "g",
    saldoAtual: 1000,
    estoqueMinimo: 2000,
    pontoPedido: 5000,
    leadTimeDias: 3,
    ...over,
  };
}

function consumo(quantidade: number, data = "2026-11-01"): ConsumoRegistrado {
  return { insumoId: "insumo-1", data, quantidade };
}

const BASE = { janelaDias: 10, diasCobertura: 7 };

describe("calcularSugestoesCompra", () => {
  it("não sugere nada quando o saldo está no ponto de pedido ou acima", () => {
    expect(
      calcularSugestoesCompra({ ...BASE, saldos: [saldo({ saldoAtual: 5000 })], consumos: [] }),
    ).toEqual([]);
    expect(
      calcularSugestoesCompra({ ...BASE, saldos: [saldo({ saldoAtual: 9000 })], consumos: [] }),
    ).toEqual([]);
  });

  it("sugere repor até o ponto de pedido quando não há histórico de consumo", () => {
    const [sugestao] = calcularSugestoesCompra({
      ...BASE,
      saldos: [saldo({ saldoAtual: 1000, pontoPedido: 5000 })],
      consumos: [],
    });

    expect(sugestao?.quantidadeSugerida).toBe(4000); // 5000 - 1000
    expect(sugestao?.origem).toBe("reposicao_do_ponto_de_pedido");
    expect(sugestao?.consumoMedioDiario).toBe(0);
  });

  it("projeta a demanda por lead time + cobertura quando há consumo", () => {
    // 10 dias, 3000 g consumidos => 300 g/dia. Horizonte = 3 + 7 = 10 dias.
    // Demanda = 3000 g; saldo 1000 => por demanda faltam 2000 g, mais que a
    // reposição do ponto (1500 - 1000 = 500). Vale a demanda.
    const [sugestao] = calcularSugestoesCompra({
      ...BASE,
      saldos: [saldo({ saldoAtual: 1000, pontoPedido: 1500, leadTimeDias: 3 })],
      consumos: [consumo(1500), consumo(1500)],
    });

    expect(sugestao?.consumoMedioDiario).toBe(300);
    expect(sugestao?.demandaProjetada).toBe(3000);
    expect(sugestao?.quantidadeSugerida).toBe(2000);
    expect(sugestao?.origem).toBe("demanda_projetada");
  });

  it("nunca sugere menos que a reposição do ponto de pedido", () => {
    // Consumo baixíssimo (1 g/dia) projetaria 10 g, mas repor o ponto exige 4000.
    const [sugestao] = calcularSugestoesCompra({
      ...BASE,
      saldos: [saldo({ saldoAtual: 1000, pontoPedido: 5000 })],
      consumos: [consumo(10)],
    });

    expect(sugestao?.quantidadeSugerida).toBe(4000);
    expect(sugestao?.origem).toBe("reposicao_do_ponto_de_pedido");
  });

  it("ignora insumo sem saldo abaixo do ponto", () => {
    const sugestoes = calcularSugestoesCompra({
      ...BASE,
      saldos: [
        saldo({ insumoId: "a", insumoNome: "Arroz", saldoAtual: 1000 }),
        saldo({ insumoId: "b", insumoNome: "Feijão", saldoAtual: 8000 }),
      ],
      consumos: [],
    });

    expect(sugestoes.map((s) => s.insumoNome)).toEqual(["Arroz"]);
  });

  it("respeita o lead time maior que a cobertura", () => {
    // 100 g/dia, lead time 20 + cobertura 0 => 2000 g de demanda; saldo 1000
    // => 1000 g sugeridos (maior que reposição de 500).
    const [sugestao] = calcularSugestoesCompra({
      janelaDias: 10,
      diasCobertura: 0,
      saldos: [saldo({ saldoAtual: 1000, pontoPedido: 1500, leadTimeDias: 20 })],
      consumos: [consumo(1000)],
    });

    expect(sugestao?.demandaProjetada).toBe(2000);
    expect(sugestao?.quantidadeSugerida).toBe(1000);
  });

  it("arredonda a 3 casas e mantém ordem alfabética", () => {
    const sugestoes = calcularSugestoesCompra({
      janelaDias: 3,
      diasCobertura: 1,
      saldos: [
        saldo({ insumoId: "z", insumoNome: "Tomate", saldoAtual: 100, pontoPedido: 200 }),
        saldo({ insumoId: "a", insumoNome: "Alface", saldoAtual: 100, pontoPedido: 200 }),
      ],
      consumos: [
        { insumoId: "z", data: "2026-11-01", quantidade: 10 },
        { insumoId: "a", data: "2026-11-01", quantidade: 10 },
      ],
    });

    expect(sugestoes.map((s) => s.insumoNome)).toEqual(["Alface", "Tomate"]);
    for (const s of sugestoes) {
      expect(Number.isInteger(s.quantidadeSugerida * 1000)).toBe(true);
    }
  });

  it("rejeita janela inválida", () => {
    expect(() =>
      calcularSugestoesCompra({ saldos: [], consumos: [], janelaDias: 0, diasCobertura: 7 }),
    ).toThrow(/janelaDias/);
  });
});
