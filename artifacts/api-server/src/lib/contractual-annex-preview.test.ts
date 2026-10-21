import { describe, expect, it } from "vitest";
import { buildContractualAnnexPreview } from "./contractual-annex-preview.js";

describe("prévia documental A/B/C", () => {
  it("não inventa cronograma, pagamento, vistoria ou aceite", () => {
    const result = buildContractualAnnexPreview({
      id: "p1", status: "rascunho", valorTotal: "100.00",
      itens: [{ nome: "Porta", quantidade: 1, valorUnitario: 100 }],
    });
    expect(result.contratual).toBe(false);
    expect(result.somentePrevia).toBe(true);
    expect(result.anexoB.parcelas).toBeNull();
    expect(result.anexoB.medicoes).toBeNull();
    expect(result.anexoC.aceite).toBeNull();
    expect(result.pending.map(x => x.code)).toContain("CONTRACT_BASELINE_NOT_VERIFIED");
  });
  it("seleciona somente itens incluídos para vistoria, sem marcar conclusão", () => {
    const result = buildContractualAnnexPreview({
      id: "p2", status: "aceita", acceptedAt: new Date(),
      apresentacao: { sourceSnapshot: { revisionLabel: "R28", immutableForVersion: true } },
      itens: [
        { nome: "Radier", quantidade: 1, valorUnitario: 100, contratual: { classificacao: "incluido" } },
        { nome: "Jardim", quantidade: 1, valorUnitario: 0, contratual: { classificacao: "excluido" } },
      ],
    });
    expect(result.anexoC.itensParaVistoria.map(x => x.nome)).toEqual(["Radier"]);
    expect(result.anexoC.itensParaVistoria[0].resultado).toBeNull();
  });
});
