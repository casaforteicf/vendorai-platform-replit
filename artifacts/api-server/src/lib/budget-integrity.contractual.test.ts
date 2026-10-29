import { describe, expect, it } from "vitest";
import { auditProposalBudget } from "./budget-integrity.js";
import type { PropostaItem } from "@workspace/db";

const item = (overrides: Partial<PropostaItem> = {}): PropostaItem => ({
  nome: "Esquadrias PVC", quantidade: 2, valorUnitario: 100, ...overrides,
});
const audit = (items: PropostaItem[]) => auditProposalBudget({
  itens: items,
  valorTotal: items.reduce((sum, x) => sum + x.quantidade * x.valorUnitario, 0),
  now: new Date("2026-10-21T12:00:00Z"),
});

describe("rastreabilidade documental do orçamento", () => {
  it("mantém compatibilidade com orçamento antigo sem metadados", () => {
    const result = audit([item()]);
    expect(result.issues.some(x => x.code.startsWith("CONTRACTUAL_") || x.code === "UNVERIFIED_ARQDOR_ORIGIN")).toBe(false);
    expect(result.calculatedTotal).toBe(200);
  });
  it("sinaliza vínculo de especificação sem proveniência", () => {
    const result = audit([item({ contratual: { arqdorSpecObjectId: "spec-1" } })]);
    expect(result.issues.map(x => x.code)).toContain("UNVERIFIED_ARQDOR_ORIGIN");
  });
  it("não permite excluir item cujo valor permanece no total", () => {
    const result = audit([item({ contratual: { classificacao: "excluido" } })]);
    expect(result.issues.map(x => x.code)).toContain("EXCLUDED_ITEM_WITH_PRICE");
    expect(result.ok).toBe(false);
  });
  it("exige revisão ao referenciar documento assinado", () => {
    const result = audit([item({ contratual: { fonte: { tipo: "documento_assinado", id: "doc-1", aprovado: true } } })]);
    expect(result.issues.map(x => x.code)).toContain("SIGNED_DOCUMENT_REVISION_MISSING");
  });
  it("preserva o total ao informar especificação contratual", () => {
    const result = audit([item({ contratual: { classificacao: "incluido", fonte: { tipo: "especificacao_arqdor", id: "spec-1", revisao: "R28", aprovado: true } } })]);
    expect(result.calculatedTotal).toBe(200);
    expect(result.issues.some(x => x.code === "TOTAL_MISMATCH")).toBe(false);
  });
});
