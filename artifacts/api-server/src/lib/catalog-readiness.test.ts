import { describe, expect, it } from "vitest";
import { compactCatalogNames, toCatalogProductContract } from "./catalog-readiness.js";

describe("catalog readiness context helpers", () => {
  it("normalizes, truncates and limits catalog names deterministically", () => {
    const names = compactCatalogNames([
      { nome: "  Produto   Principal  " },
      { nome: "Serviço Premium" },
      { nome: "" },
      { nome: "Terceiro Item" },
    ], 2);

    expect(names).toEqual(["Produto Principal", "Serviço Premium"]);
  });

  it("caps requested preview size for prompt safety", () => {
    const items = Array.from({ length: 30 }, (_, index) => ({ nome: `Item ${index + 1}` }));
    expect(compactCatalogNames(items, 100)).toHaveLength(20);
  });

  it("adapts official catalog prices to legacy-shaped API contracts", () => {
    expect(toCatalogProductContract([
      { nome: "Produto A", descricao: "Descrição A", precoBase: "129.90" },
      { nome: "Serviço B", descricao: null, precoBase: 350 },
      { nome: "Item inválido", descricao: null, precoBase: "não-numérico" },
    ])).toEqual([
      { nome: "Produto A", descricao: "Descrição A", preco: 129.9 },
      { nome: "Serviço B", descricao: null, preco: 350 },
      { nome: "Item inválido", descricao: null, preco: null },
    ]);
  });
});
