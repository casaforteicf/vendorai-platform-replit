import { describe, expect, it, vi } from "vitest";
vi.mock("./ai-gateway.js", () => ({ callOpenAI: vi.fn(), callAnthropic: vi.fn() }));
import { generateTheme, renderProposalHtml } from "./proposal-engine.js";

function render() {
  const items = Array.from({ length: 5 }, (_, index) => ({
    nome: "Serviço " + index, quantidade: 1, valorUnitario: 200,
    etapaId: "e" + index, etapaNome: "Etapa completa " + index, etapaOrdem: index + 1,
  }));
  return renderProposalHtml({}, generateTheme("#D9673E"), null, "Cliente", "Empresa", null, null, [],
    { titulo: "Orçamento", valorTotal: "1000.00", formaPagamento: "pix", itens: items,
      apresentacao: { entradaPercentual: 10, amortizacaoEntradaPercentual: 10,
        previsaoInicio: "2026-01-01",
        cronogramaEtapas: Object.fromEntries(items.map((item) => [item.etapaId, { inicioPrevisto: "2026-01-01", duracaoDias: 120 }])),
        condicoesPagamentoDetalhadas: "Entrada e medições mensais",
        politicaReajuste: "Após 12 meses", garantiasContratuais: "Conforme contrato",
      },
    }, null, { modules: [{ key: "fisico_financeiro", enabled: true, order: 1 }, { key: "condicoes_comerciais", enabled: true, order: 2 }] });
}
describe("leitura do cronograma e condições no PDF", () => {
  it("separa os meses em cartões e conserva todas as etapas sem limite de quatro nomes", () => {
    const html = render();
    expect(html.match(/class="studio-month-card"/g)).toHaveLength(4);
    expect(html.match(/data-studio-key="fisico_financeiro"/g)).toHaveLength(2);
    expect(html).toContain("Etapa completa 4");
    expect(html).toContain("Desconto da entrada");
    expect(html).toContain("Saldo da entrada a descontar");
    expect(html).not.toContain('class="studio-table studio-monthly"');
  });
  it("destaca entrada, saldo e condições sem substituir o texto comercial cadastrado", () => {
    const html = render();
    const fmt = (amount: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
    expect(html).toContain("Entrada · 10%");
    expect(html).toContain("Saldo após a entrada");
    for (const amount of [1000, 100, 900]) expect(html).toContain(fmt(amount));
    for (const text of ["PIX", "Entrada e medições mensais", "Após 12 meses", "Conforme contrato"]) expect(html).toContain(text);
  });
});
