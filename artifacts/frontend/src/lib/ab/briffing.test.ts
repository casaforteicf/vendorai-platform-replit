import { describe, expect, it } from "vitest";
import {
  calcularBriffing,
  consolidarBriffings,
  formatarQuantidade,
  validarOcupacao,
  type CardapioDia,
  type Prato,
} from "./briffing";

function prato(overrides: Partial<Prato> = {}): Prato {
  return {
    id: "p1",
    nome: "Arroz branco",
    porcoesPorPax: 1,
    ficha: [
      {
        insumoId: "i1",
        insumoNome: "Arroz",
        unidadeBase: "g",
        gramaturaPorPorcao: 100,
      },
    ],
    ...overrides,
  };
}

function cardapio(pratos: Prato[], data = "2026-11-02"): CardapioDia {
  return { data, pratos };
}

describe("calcularBriffing", () => {
  it("100 hóspedes × 1 porção × 100 g = 10 kg", () => {
    const resultado = calcularBriffing(100, cardapio([prato()]));

    expect(resultado.consolidado).toHaveLength(1);
    expect(resultado.consolidado[0].quantidadeBase).toBe(10000);
    expect(resultado.consolidado[0].quantidadeKg).toBe(10);
    expect(resultado.porPrato[0].porcoesTotais).toBe(100);
  });

  it("aplica o fator de correção", () => {
    const resultado = calcularBriffing(
      10,
      cardapio([
        prato({
          ficha: [
            {
              insumoId: "i2",
              insumoNome: "Bife",
              unidadeBase: "g",
              gramaturaPorPorcao: 150,
              fatorCorrecao: 1.2,
            },
          ],
        }),
      ]),
    );

    expect(resultado.consolidado[0].quantidadeBase).toBe(1800); // 10 × 150 × 1.2
  });

  it("não arredonda porções fracionadas (3 × 0,5 = 1,5 porção)", () => {
    const resultado = calcularBriffing(3, cardapio([prato({ porcoesPorPax: 0.5 })]));

    expect(resultado.porPrato[0].porcoesTotais).toBe(1.5);
    expect(resultado.consolidado[0].quantidadeBase).toBe(150); // 1,5 × 100 g
  });

  it("consolida o mesmo insumo entre pratos diferentes", () => {
    const resultado = calcularBriffing(
      10,
      cardapio([
        prato({ id: "p1", nome: "Arroz" }),
        prato({
          id: "p2",
          nome: "Arroz com legumes",
          ficha: [{ insumoId: "i1", insumoNome: "Arroz", unidadeBase: "g", gramaturaPorPorcao: 50 }],
        }),
      ]),
    );

    expect(resultado.consolidado).toHaveLength(1);
    expect(resultado.consolidado[0].quantidadeBase).toBe(1500);
    expect(resultado.consolidado[0].quantidadeKg).toBe(1.5);
    // detalhamento por prato continua separado
    expect(resultado.porPrato.map((p) => p.insumos[0].quantidadeBase)).toEqual([1000, 500]);
  });

  it("mantém insumos distintos em linhas distintas", () => {
    const resultado = calcularBriffing(
      10,
      cardapio([
        prato({
          ficha: [
            { insumoId: "i1", insumoNome: "Arroz", unidadeBase: "g", gramaturaPorPorcao: 100 },
            { insumoId: "i2", insumoNome: "Sal", unidadeBase: "g", gramaturaPorPorcao: 2 },
            { insumoId: "i3", insumoNome: "Ovo", unidadeBase: "un", gramaturaPorPorcao: 0.5 },
          ],
        }),
      ]),
    );

    expect(resultado.consolidado.map((i) => i.insumoId)).toEqual(["i1", "i2", "i3"]);
    const ovo = resultado.consolidado.find((i) => i.insumoId === "i3");
    expect(ovo?.quantidadeBase).toBe(5); // 10 × 0,5 un
    expect(ovo?.quantidadeKg).toBeUndefined(); // `un` não converte para kg
  });

  it("converte ml para litros", () => {
    const resultado = calcularBriffing(
      100,
      cardapio([
        prato({
          ficha: [
            { insumoId: "i9", insumoNome: "Leite", unidadeBase: "ml", gramaturaPorPorcao: 200 },
          ],
        }),
      ]),
    );

    expect(resultado.consolidado[0].quantidadeBase).toBe(20000);
    expect(resultado.consolidado[0].quantidadeKg).toBe(20);
  });

  it("aceita ocupação zero", () => {
    const resultado = calcularBriffing(0, cardapio([prato()]));

    expect(resultado.consolidado[0].quantidadeBase).toBe(0);
  });

  it("rejeita ocupação negativa ou não numérica", () => {
    expect(() => calcularBriffing(-1, cardapio([prato()]))).toThrow(/não pode ser negativo/);
    expect(() => calcularBriffing(Number.NaN, cardapio([prato()]))).toThrow(/número finito/);
  });

  it("rejeita fator de correção zero ou negativo (quase sempre digitação errada)", () => {
    const comFc = (fc: number) =>
      cardapio([
        prato({
          ficha: [
            {
              insumoId: "i1",
              insumoNome: "Arroz",
              unidadeBase: "g",
              gramaturaPorPorcao: 100,
              fatorCorrecao: fc,
            },
          ],
        }),
      ]);

    expect(() => calcularBriffing(10, comFc(0))).toThrow(/maior que zero/);
    expect(() => calcularBriffing(10, comFc(-1.2))).toThrow(/maior que zero/);
  });

  it("rejeita o mesmo insumo em unidades diferentes", () => {
    const cardapioInconsistente = cardapio([
      prato({ ficha: [{ insumoId: "i1", insumoNome: "Queijo", unidadeBase: "g", gramaturaPorPorcao: 30 }] }),
      prato({
        id: "p2",
        nome: "Tábua",
        ficha: [{ insumoId: "i1", insumoNome: "Queijo", unidadeBase: "un", gramaturaPorPorcao: 2 }],
      }),
    ]);

    expect(() => calcularBriffing(10, cardapioInconsistente)).toThrow(/unidades diferentes/);
  });

  it("rejeita porções por hóspede negativas", () => {
    expect(() => calcularBriffing(10, cardapio([prato({ porcoesPorPax: -1 })]))).toThrow(
      /porções por hóspede/,
    );
  });
});

describe("consolidarBriffings", () => {
  it("soma dias diferentes no total de compras", () => {
    const dia1 = calcularBriffing(100, cardapio([prato()]));
    const dia2 = calcularBriffing(50, cardapio([prato()], "2026-11-03"));

    const total = consolidarBriffings([dia1, dia2]);

    expect(total).toHaveLength(1);
    expect(total[0].quantidadeBase).toBe(15000);
    expect(total[0].quantidadeKg).toBe(15);
  });

  it("mantém unidades independentes", () => {
    const dia = calcularBriffing(
      10,
      cardapio([
        prato({
          ficha: [
            { insumoId: "i1", insumoNome: "Arroz", unidadeBase: "g", gramaturaPorPorcao: 100 },
            { insumoId: "i2", insumoNome: "Ovo", unidadeBase: "un", gramaturaPorPorcao: 1 },
          ],
        }),
      ]),
    );

    const total = consolidarBriffings([dia, dia]);

    expect(total.map((i) => [i.insumoId, i.quantidadeBase])).toEqual([
      ["i1", 2000],
      ["i2", 20],
    ]);
  });

  it("rejeita mistura de unidades entre dias", () => {
    const emGramas = calcularBriffing(10, cardapio([prato()]));
    const emUnidades = calcularBriffing(
      10,
      cardapio([
        prato({
          ficha: [{ insumoId: "i1", insumoNome: "Arroz", unidadeBase: "un", gramaturaPorPorcao: 1 }],
        }),
      ]),
    );

    expect(() => consolidarBriffings([emGramas, emUnidades])).toThrow(/unidades diferentes/);
  });

  it("devolve lista vazia sem dias", () => {
    expect(consolidarBriffings([])).toEqual([]);
  });
});

describe("formatarQuantidade", () => {
  it("usa kg e L a partir de 1000", () => {
    expect(formatarQuantidade(12500, "g")).toBe("12,5 kg");
    expect(formatarQuantidade(1000, "ml")).toBe("1 L");
  });

  it("mantém g/ml/un abaixo de 1000", () => {
    expect(formatarQuantidade(750, "g")).toBe("750 g");
    expect(formatarQuantidade(30, "un")).toBe("30 un");
  });

  it("mostra fração de unidade", () => {
    expect(formatarQuantidade(1.5, "g")).toBe("1,5 g");
  });
});

describe("validarOcupacao", () => {
  it("aceita inteiro positivo, inclusive com espaços", () => {
    expect(validarOcupacao("150")).toEqual({ ok: true, valor: 150 });
    expect(validarOcupacao("  150  ")).toEqual({ ok: true, valor: 150 });
    expect(validarOcupacao("0")).toEqual({ ok: true, valor: 0 });
  });

  it("aceita vírgula decimal em valor inteiro (pt-BR)", () => {
    expect(validarOcupacao("150,0")).toEqual({ ok: true, valor: 150 });
  });

  it("rejeita vazio e não numérico", () => {
    expect(validarOcupacao("")).toEqual({ ok: false, erro: "Informe a ocupação em hóspedes." });
    expect(validarOcupacao("   ")).toEqual({ ok: false, erro: "Informe a ocupação em hóspedes." });
    expect(validarOcupacao("abc")).toEqual({ ok: false, erro: "A ocupação precisa ser um número." });
  });

  it("rejeita fração de hóspede", () => {
    const resultado = validarOcupacao("12.5");
    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.erro).toMatch(/inteiro de hóspedes/);
  });

  it("rejeita negativo", () => {
    const resultado = validarOcupacao("-3");
    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.erro).toMatch(/inteiro de hóspedes/);
  });

  it("recusa ocupação absurda como proteção contra digitação errada", () => {
    const resultado = validarOcupacao("10001");
    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.erro).toContain("10.000");
  });
});
