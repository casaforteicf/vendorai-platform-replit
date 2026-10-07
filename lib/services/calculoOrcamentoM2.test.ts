// Testes do motor de cálculo. Escrito pra vitest — se o projeto usa jest,
// troque o import de "vitest" por "@jest/globals" (a API describe/it/expect é igual).
import { describe, it, expect } from "vitest";
import {
  calcularAmbiente,
  calcularParede,
  calcularFechamentoPacote,
  calcularOrcamentoProdutoArea,
  ErroCalculoOrcamento,
  type ProdutoCalculo,
} from "./calculoOrcamentoM2";

describe("calcularAmbiente", () => {
  it("calcula área e perímetro por largura×comprimento", () => {
    const r = calcularAmbiente({ nome: "Sala", largura: 4, comprimento: 5 });
    expect(r.area).toBe(20);
    expect(r.perimetro).toBe(18); // 2*(4+5)
  });

  it("aceita m² direto com perímetro manual", () => {
    const r = calcularAmbiente({ m2Direto: 20, perimetroManual: 19 });
    expect(r.area).toBe(20);
    expect(r.perimetro).toBe(19);
  });

  it("exige perímetro manual quando usa m² direto", () => {
    expect(() => calcularAmbiente({ m2Direto: 20 })).toThrow(ErroCalculoOrcamento);
  });

  it("permite sobrescrever o perímetro automático (ambiente irregular)", () => {
    const r = calcularAmbiente({ largura: 4, comprimento: 5, perimetroManual: 22 });
    expect(r.area).toBe(20);
    expect(r.perimetro).toBe(22);
  });
});

describe("calcularParede", () => {
  it("calcula área por largura×altura, sem perímetro", () => {
    const r = calcularParede({ nome: "Parede fundo", largura: 3, altura: 2.7 });
    expect(r.area).toBeCloseTo(8.1);
  });

  it("aceita m² direto", () => {
    expect(calcularParede({ m2Direto: 8.1 }).area).toBe(8.1);
  });
});

describe("calcularFechamentoPacote", () => {
  it("bate com os números reais do catálogo de teto vinílico (Teto Vinílico Origens Tauari, tamanho 3m)", () => {
    // preco_base=179.71, fechamento_pacote=6.00, preco_pacote=1113.30 (dado real do catálogo)
    const produto = { fechamentoPacote: 6, precoPacote: 1113.3, precoBase: 179.71 };
    const r = calcularFechamentoPacote(6, produto); // área exata = 1 pacote
    expect(r.numeroPacotes).toBe(1);
    expect(r.valorTotal).toBeCloseTo(1113.3);
  });

  it("arredonda pra cima quando passa de 1 pacote por pouco", () => {
    const produto = { fechamentoPacote: 6, precoPacote: 1113.3, precoBase: 179.71 };
    const r = calcularFechamentoPacote(6.01, produto);
    expect(r.numeroPacotes).toBe(2);
    expect(r.valorTotal).toBeCloseTo(2226.6);
  });

  it("cobra pela quantidade exata quando não há fechamento_pacote (produto a granel)", () => {
    const r = calcularFechamentoPacote(10, { fechamentoPacote: null, precoPacote: null, precoBase: 50 });
    expect(r.numeroPacotes).toBe(0);
    expect(r.valorTotal).toBe(500);
  });

  it("deriva o preço do pacote quando preco_pacote não está preenchido", () => {
    const r = calcularFechamentoPacote(6, { fechamentoPacote: 6, precoPacote: null, precoBase: 179.71 });
    expect(r.valorTotal).toBeCloseTo(6 * 179.71);
  });

  it("respeita embalagem mestre mínima sem fracionamento", () => {
    const r = calcularFechamentoPacote(36.01, {
      fechamentoPacote: 6,
      precoPacote: 100,
      precoBase: 16.67,
      embalagemMestreQuantidade: 6,
      permiteFracionarEmbalagemMestre: false,
    });
    expect(r.numeroPacotesNecessarios).toBe(7);
    expect(r.numeroPacotes).toBe(12);
    expect(r.numeroEmbalagensMestre).toBe(2);
    expect(r.quantidadeFaturada).toBe(72);
    expect(r.valorTotal).toBe(1200);
  });

  it("permite fracionar embalagem mestre quando explicitamente autorizado", () => {
    const r = calcularFechamentoPacote(36.01, {
      fechamentoPacote: 6,
      precoPacote: 100,
      precoBase: 16.67,
      embalagemMestreQuantidade: 6,
      permiteFracionarEmbalagemMestre: true,
    });
    expect(r.numeroPacotesNecessarios).toBe(7);
    expect(r.numeroPacotes).toBe(7);
    expect(r.numeroEmbalagensMestre).toBeUndefined();
  });

  it("combina mínimo de venda e múltiplo comercial", () => {
    const r = calcularFechamentoPacote(6, {
      fechamentoPacote: 6,
      precoPacote: 100,
      precoBase: 16.67,
      quantidadeMinimaVenda: 5,
      multiploVenda: 2,
    });
    expect(r.numeroPacotesNecessarios).toBe(1);
    expect(r.numeroPacotes).toBe(6);
    expect(r.valorTotal).toBe(600);
  });
});

describe("calcularOrcamentoProdutoArea — teto vinílico (area_com_acabamento_perimetro)", () => {
  const tetoTauari: ProdutoCalculo = {
    id: "teto-tauari",
    nome: "Teto Vinílico Origens Tauari",
    tipoCalculo: "area_com_acabamento_perimetro",
    precoBase: 179.71,
    fechamentoPacote: 6,
    precoPacote: 1113.3,
  };
  const arremateOrigensTauari: ProdutoCalculo = {
    id: "arremate-origens-tauari",
    nome: "Arremate F Origens Tauari",
    tipoCalculo: "acabamento_perimetro",
    precoBase: 14.53,
    fechamentoPacote: 18,
    precoPacote: 261.54,
  };

  it("soma área e perímetro de múltiplos ambientes e calcula os dois produtos", () => {
    const resultado = calcularOrcamentoProdutoArea(
      tetoTauari,
      [
        { nome: "Sala", largura: 4, comprimento: 5 }, // área 20, perímetro 18
        { nome: "Quarto 1", largura: 3, comprimento: 3.5 }, // área 10.5, perímetro 13
      ],
      arremateOrigensTauari
    );

    expect(resultado.produtoPrincipal.quantidadeNecessaria).toBeCloseTo(30.5); // 20 + 10.5
    expect(resultado.produtoPrincipal.numeroPacotes).toBe(Math.ceil(30.5 / 6)); // 6 pacotes

    expect(resultado.acessorioPerimetro?.quantidadeNecessaria).toBeCloseTo(31); // 18 + 13
    expect(resultado.acessorioPerimetro?.numeroPacotes).toBe(Math.ceil(31 / 18)); // 2 barras
  });

  it("funciona sem acessório informado (vendedor ainda não escolheu)", () => {
    const resultado = calcularOrcamentoProdutoArea(tetoTauari, [{ largura: 4, comprimento: 5 }]);
    expect(resultado.acessorioPerimetro).toBeUndefined();
  });

  it("exige ao menos um ambiente", () => {
    expect(() => calcularOrcamentoProdutoArea(tetoTauari, [])).toThrow(ErroCalculoOrcamento);
  });
});

describe("calcularOrcamentoProdutoArea — revestimento de parede (area_simples)", () => {
  const revestimentoGranizo: ProdutoCalculo = {
    id: "revest-granizo-20",
    nome: "GRANIZO #20",
    tipoCalculo: "area_simples",
    precoBase: 79.2,
    fechamentoPacote: 6.44,
    precoPacote: null, // catálogo de revestimentos ainda não tem preco_pacote — deriva de fechamento×precoBase
  };

  it("soma área de múltiplas paredes, sem perímetro nem acessório", () => {
    const resultado = calcularOrcamentoProdutoArea(revestimentoGranizo, [
      { nome: "Parede fundo sala", largura: 4, altura: 2.7 }, // 10.8
      { nome: "Parede varanda", largura: 2, altura: 2.7 }, // 5.4
    ]);
    expect(resultado.produtoPrincipal.quantidadeNecessaria).toBeCloseTo(16.2);
    expect(resultado.produtoPrincipal.numeroPacotes).toBe(Math.ceil(16.2 / 6.44)); // 3 embalagens
    expect(resultado.acessorioPerimetro).toBeUndefined();
  });
});// Testes do motor de cálculo. Escrito pra vitest — se o projeto usa jest,
// troque o import de "vitest" por "@jest/globals" (a API describe/it/expect é igual).
import { describe, it, expect } from "vitest";
import {
  calcularAmbiente,
  calcularParede,
  calcularFechamentoPacote,
  calcularOrcamentoProdutoArea,
  ErroCalculoOrcamento,
  type ProdutoCalculo,
} from "./calculoOrcamentoM2";

describe("calcularAmbiente", () => {
  it("calcula área e perímetro por largura×comprimento", () => {
    const r = calcularAmbiente({ nome: "Sala", largura: 4, comprimento: 5 });
    expect(r.area).toBe(20);
    expect(r.perimetro).toBe(18); // 2*(4+5)
  });

  it("aceita m² direto com perímetro manual", () => {
    const r = calcularAmbiente({ m2Direto: 20, perimetroManual: 19 });
    expect(r.area).toBe(20);
    expect(r.perimetro).toBe(19);
  });

  it("exige perímetro manual quando usa m² direto", () => {
    expect(() => calcularAmbiente({ m2Direto: 20 })).toThrow(ErroCalculoOrcamento);
  });

  it("permite sobrescrever o perímetro automático (ambiente irregular)", () => {
    const r = calcularAmbiente({ largura: 4, comprimento: 5, perimetroManual: 22 });
    expect(r.area).toBe(20);
    expect(r.perimetro).toBe(22);
  });
});

describe("calcularParede", () => {
  it("calcula área por largura×altura, sem perímetro", () => {
    const r = calcularParede({ nome: "Parede fundo", largura: 3, altura: 2.7 });
    expect(r.area).toBeCloseTo(8.1);
  });

  it("aceita m² direto", () => {
    expect(calcularParede({ m2Direto: 8.1 }).area).toBe(8.1);
  });
});

describe("calcularFechamentoPacote", () => {
  it("bate com os números reais do catálogo de teto vinílico (Teto Vinílico Origens Tauari, tamanho 3m)", () => {
    // preco_base=179.71, fechamento_pacote=6.00, preco_pacote=1113.30 (dado real do catálogo)
    const produto = { fechamentoPacote: 6, precoPacote: 1113.3, precoBase: 179.71 };
    const r = calcularFechamentoPacote(6, produto); // área exata = 1 pacote
    expect(r.numeroPacotes).toBe(1);
    expect(r.valorTotal).toBeCloseTo(1113.3);
  });

  it("arredonda pra cima quando passa de 1 pacote por pouco", () => {
    const produto = { fechamentoPacote: 6, precoPacote: 1113.3, precoBase: 179.71 };
    const r = calcularFechamentoPacote(6.01, produto);
    expect(r.numeroPacotes).toBe(2);
    expect(r.valorTotal).toBeCloseTo(2226.6);
  });

  it("cobra pela quantidade exata quando não há fechamento_pacote (produto a granel)", () => {
    const r = calcularFechamentoPacote(10, { fechamentoPacote: null, precoPacote: null, precoBase: 50 });
    expect(r.numeroPacotes).toBe(0);
    expect(r.valorTotal).toBe(500);
  });

  it("deriva o preço do pacote quando preco_pacote não está preenchido", () => {
    const r = calcularFechamentoPacote(6, { fechamentoPacote: 6, precoPacote: null, precoBase: 179.71 });
    expect(r.valorTotal).toBeCloseTo(6 * 179.71);
  });
});

describe("calcularOrcamentoProdutoArea — teto vinílico (area_com_acabamento_perimetro)", () => {
  const tetoTauari: ProdutoCalculo = {
    id: "teto-tauari",
    nome: "Teto Vinílico Origens Tauari",
    tipoCalculo: "area_com_acabamento_perimetro",
    precoBase: 179.71,
    fechamentoPacote: 6,
    precoPacote: 1113.3,
  };
  const arremateOrigensTauari: ProdutoCalculo = {
    id: "arremate-origens-tauari",
    nome: "Arremate F Origens Tauari",
    tipoCalculo: "acabamento_perimetro",
    precoBase: 14.53,
    fechamentoPacote: 18,
    precoPacote: 261.54,
  };

  it("soma área e perímetro de múltiplos ambientes e calcula os dois produtos", () => {
    const resultado = calcularOrcamentoProdutoArea(
      tetoTauari,
      [
        { nome: "Sala", largura: 4, comprimento: 5 }, // área 20, perímetro 18
        { nome: "Quarto 1", largura: 3, comprimento: 3.5 }, // área 10.5, perímetro 13
      ],
      arremateOrigensTauari
    );

    expect(resultado.produtoPrincipal.quantidadeNecessaria).toBeCloseTo(30.5); // 20 + 10.5
    expect(resultado.produtoPrincipal.numeroPacotes).toBe(Math.ceil(30.5 / 6)); // 6 pacotes

    expect(resultado.acessorioPerimetro?.quantidadeNecessaria).toBeCloseTo(31); // 18 + 13
    expect(resultado.acessorioPerimetro?.numeroPacotes).toBe(Math.ceil(31 / 18)); // 2 barras
  });

  it("funciona sem acessório informado (vendedor ainda não escolheu)", () => {
    const resultado = calcularOrcamentoProdutoArea(tetoTauari, [{ largura: 4, comprimento: 5 }]);
    expect(resultado.acessorioPerimetro).toBeUndefined();
  });

  it("exige ao menos um ambiente", () => {
    expect(() => calcularOrcamentoProdutoArea(tetoTauari, [])).toThrow(ErroCalculoOrcamento);
  });
});

describe("calcularOrcamentoProdutoArea — revestimento de parede (area_simples)", () => {
  const revestimentoGranizo: ProdutoCalculo = {
    id: "revest-granizo-20",
    nome: "GRANIZO #20",
    tipoCalculo: "area_simples",
    precoBase: 79.2,
    fechamentoPacote: 6.44,
    precoPacote: null, // catálogo de revestimentos ainda não tem preco_pacote — deriva de fechamento×precoBase
  };

  it("soma área de múltiplas paredes, sem perímetro nem acessório", () => {
    const resultado = calcularOrcamentoProdutoArea(revestimentoGranizo, [
      { nome: "Parede fundo sala", largura: 4, altura: 2.7 }, // 10.8
      { nome: "Parede varanda", largura: 2, altura: 2.7 }, // 5.4
    ]);
    expect(resultado.produtoPrincipal.quantidadeNecessaria).toBeCloseTo(16.2);
    expect(resultado.produtoPrincipal.numeroPacotes).toBe(Math.ceil(16.2 / 6.44)); // 3 embalagens
    expect(resultado.acessorioPerimetro).toBeUndefined();
  });
});
