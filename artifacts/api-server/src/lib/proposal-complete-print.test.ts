import { describe, expect, it, vi } from "vitest";
vi.mock("./ai-gateway.js", () => ({ callOpenAI: vi.fn(), callAnthropic: vi.fn() }));
import { renderOrcamentoPdf } from "./proposal-engine.js";

function budget(overrides: Record<string, unknown> = {}) {
  return {
    proposta: {
      titulo: "Casa teste", numero: "ORC-1", valorTotal: "3000.00",
      itens: [
        { nome: "Fundação", quantidade: 1, valorUnitario: 1000, etapaId: "fund", etapaNome: "Fundações", etapaOrdem: 1 },
        { nome: "Paredes", quantidade: 1, valorUnitario: 2000, etapaId: "icf", etapaNome: "Estrutura ICF", etapaOrdem: 2 },
      ],
      apresentacao: {
        previsaoInicio: "2026-01-01", entradaPercentual: 10, amortizacaoEntradaPercentual: 10,
        descricaoProjeto: "Residência & escritório", premissasObra: ["Terreno preparado"],
        memorialDescritivo: "Paredes ICF de acordo com projeto",
        politicaReajuste: "Conforme índice contratado", garantiasContratuais: "Garantia registrada",
        condicoesPagamentoDetalhadas: "Entrada e medições", itensNaoInclusos: ["Paisagismo"],
        areaTotalConstruida: 200,
        cronogramaEtapas: {
          fund: { inicioPrevisto: "2026-01-01", duracaoDias: 31, percentualFisico: 40 },
          icf: { inicioPrevisto: "2026-02-01", duracaoDias: 28, percentualFisico: 60,
            fases: [
              { id: "f1", nome: "Fase térreo", ordem: 1, duracaoDias: 14, percentualEtapa: 50 },
              { id: "f2", nome: "Fase superior", ordem: 2, duracaoDias: 14, percentualEtapa: 50 },
            ] },
        },
        ...overrides,
      },
    },
    profile: { razaoSocial: "Construtora teste" }, catalogItems: [], lead: { nome: "Cliente teste" },
  };
}

describe("PDF completo do orçamento", () => {
  it("inclui o fluxo mensal e amortiza a entrada conforme os valores salvos", () => {
    const html = renderOrcamentoPdf(budget());
    const ledger = html.split('class="schedule-table monthly-ledger"')[1].split("</table>")[0];
    expect(ledger).toContain("Saldo entrada");
    expect(ledger).toContain("40.00%");
    expect(ledger).toContain("60.00%");
    expect(ledger).toContain("100.00%");
    for (const amount of [1000, 100, 900, 200, 2000, 1800, 0]) {
      expect(ledger).toContain(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount));
    }
    expect(ledger).toContain("Fase térreo");
    expect(ledger).toContain("Fase superior");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });
  it("preserva texto gerado, escapa HTML e inclui condições e exclusões", () => {
    const html = renderOrcamentoPdf(budget({ descricaoProjeto: "<script>alert(1)</script>" }));
    for (const text of ["Terreno preparado", "Paredes ICF de acordo com projeto", "Conforme índice contratado",
      "Garantia registrada", "Entrada e medições", "Paisagismo", "Área total construída"]) expect(html).toContain(text);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("respeita a opção salva de ocultar cronograma financeiro", () => {
    const html = renderOrcamentoPdf(budget({ mostrarFisicoFinanceiro: false }));
    expect(html).not.toContain('class="schedule-table monthly-ledger"');
    expect(html).toContain("Cronograma de execução");
  });
  it("gera documento sem datas e sem informações opcionais", () => {
    const input = budget();
    input.proposta.apresentacao = {} as typeof input.proposta.apresentacao;
    const html = renderOrcamentoPdf(input);
    expect(html).toContain("Casa teste");
    expect(html).not.toContain("NaN");
  });
});
