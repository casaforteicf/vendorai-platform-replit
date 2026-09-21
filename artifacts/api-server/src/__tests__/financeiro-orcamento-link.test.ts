import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const apiSource = readFileSync(new URL("../routes/financeiro_obra.ts", import.meta.url), "utf8");
const uiSource = readFileSync(
  new URL("../../../frontend/src/pages/TabFinanceiro.tsx", import.meta.url),
  "utf8",
);

describe("financeiro da obra vinculado ao orçamento", () => {
  it("usa a versão contratada/aprovada do orçamento como referência de custos", () => {
    expect(apiSource).toContain('orcamentos.find((o) => o.status === "contratado")');
    expect(apiSource).toContain('orcamentos.find((o) => o.status === "aprovado")');
    expect(apiSource).toContain("obraOrcamentoEtapasTable");
    expect(apiSource).toContain("obraOrcamentoItensTable");
  });

  it("separa custo orçado do valor de venda com BDI", () => {
    expect(apiSource).toContain("custoOrcado");
    expect(apiSource).toContain("orcamentoCalculado");
    expect(apiSource).toContain("base * (1 + bdi / 100)");
    expect(apiSource).toContain("margemOrcada");
  });

  it("não soma lançamento cancelado no custo realizado", () => {
    expect(apiSource).toContain("case when");
    expect(apiSource).toContain("!= 'cancelado'");
  });

  it("mostra compatibilização custo orçado x realizado no financeiro", () => {
    expect(uiSource).toContain("Custos x Orçamento");
    expect(uiSource).toContain("Compatibilização por etapa");
    expect(uiSource).toContain("Custo orçado");
    expect(uiSource).toContain("Custo realizado");
  });
});
