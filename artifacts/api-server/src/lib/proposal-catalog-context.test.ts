import { describe, expect, it } from "vitest";
import { buildProposalProductContext, proposalProductPromptRules } from "./proposal-catalog-context.js";

describe("proposal catalog context", () => {
  it("prioriza o Catálogo oficial quando existem itens ativos", () => {
    const result = buildProposalProductContext(
      [{ nome: "Produto Oficial", precoBase: "129.90", unidade: "un", categoria: "Linha A" }],
      [{ nome: "Produto Legado", preco: 99 }],
    );

    expect(result.source).toBe("catalog");
    expect(result.context).toContain("Produto Oficial");
    expect(result.context).not.toContain("Produto Legado");
    expect(proposalProductPromptRules(result.source).join(" ")).toContain("exclusivamente");
  });

  it("usa referência legada somente quando o Catálogo está vazio", () => {
    const result = buildProposalProductContext([], [{ nome: "Serviço Legado", preco: 250 }]);

    expect(result.source).toBe("legacy");
    expect(result.context).toContain("Serviço Legado");
    expect(result.context).toContain("Catálogo oficial está vazio");
  });

  it("não inventa uma fonte quando não existe catálogo nem legado", () => {
    const result = buildProposalProductContext([], []);

    expect(result.source).toBe("empty");
    expect(result.context).toContain("Catálogo oficial vazio");
  });

  it("limita textos extensos antes de formar o contexto", () => {
    const longName = "A".repeat(180);
    const result = buildProposalProductContext(
      [{ nome: longName, precoBase: 10, unidade: "un", categoria: "Categoria" }],
      [],
    );

    expect(result.context).not.toContain(longName);
    expect(result.context).toContain("A".repeat(100));
  });
});
