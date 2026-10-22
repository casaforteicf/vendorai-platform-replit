import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../routes/construcao.ts", import.meta.url), "utf8");

describe("P0 orçamento + composições + obras contract", () => {
  it("creates inputs and compositions inside the authenticated tenant", () => {
    expect(source).toContain('router.post("/tenants/:tenantId/insumos"');
    expect(source).toContain('router.post("/tenants/:tenantId/composicoes"');
    expect(source).toContain("eq(insumosTable.tenantId, tid)");
    expect(source).toContain("eq(composicoesTable.tenantId, tid)");
    expect(source).toContain('error: "Um ou mais insumos não pertencem a este tenant."');
  });

  it("calculates composition cost from the master input price", () => {
    expect(source).toContain("precoMestre: insumosTable.precoUnitario");
    expect(source).toContain(".leftJoin(insumosTable, eq(composicaoInsumosTable.insumoId, insumosTable.id))");
    expect(source).toContain("quantidade * (1 + perda / 100) * preco");
    expect(source).toContain("custoTotal: total.toFixed(4)");
  });

  it("propagates master-price changes to compositions and draft budgets", () => {
    expect(source).toContain("async function aplicarPrecoMestre");
    expect(source).toContain("await recalcularCustoComposicao(composicao.id)");
    expect(source).toContain("async function propagarPrecoParaOrcamentos");
    expect(source).toContain('if (item.status === "rascunho")');
    expect(source).toContain("precosDesatualizados: false");
  });

  it("freezes sent budgets and warns that their prices are stale", () => {
    expect(source).toContain('} else if (item.status === "enviado")');
    expect(source).toContain("enviados.add(item.orcamentoId)");
    expect(source).toContain("precosDesatualizados: true");
  });

  it("does not recalculate approved or contracted budgets", () => {
    expect(source).toContain('orcamento.status === "aprovado" || orcamento.status === "contratado"');
    expect(source).toContain('motivo: "locked"');
  });

  it("keeps budgets nested under an owned obra and composition items linked to a stage", () => {
    expect(source).toContain('router.post("/tenants/:tenantId/obras/:obraId/orcamentos"');
    expect(source).toContain("eq(obraOrcamentosTable.obraId, obraId)");
    expect(source).toContain("obraOrcamentoEtapasTable");
    expect(source).toContain("obraOrcamentoItensTable");
    expect(source).toContain("composicaoId");
  });
});
