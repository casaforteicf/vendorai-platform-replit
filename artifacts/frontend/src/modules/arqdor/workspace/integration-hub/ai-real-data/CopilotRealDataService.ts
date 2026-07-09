import { AIContextRepository, type AIProjectContext } from "./AIContextRepository";

export type CopilotRealDataInsight = {
  title: string;
  module: string;
  severity: "info" | "warning" | "critical";
  description: string;
  action: string;
};

export class CopilotRealDataService {
  constructor(private readonly contextRepository = new AIContextRepository()) {}

  async analyze(projectId: string): Promise<CopilotRealDataInsight[]> {
    const context = await this.contextRepository.loadProjectContext(projectId);
    return this.buildInsights(context);
  }

  buildInsights(context: AIProjectContext): CopilotRealDataInsight[] {
    const insights: CopilotRealDataInsight[] = [];

    if (!context.project) {
      insights.push({
        title: "Projeto não encontrado na API real",
        module: "Project",
        severity: "critical",
        description: "O Copilot não conseguiu carregar o projeto real. Deve manter fallback antes de executar ações.",
        action: "Verificar Project API",
      });
    }

    if (!context.specifications?.length) {
      insights.push({
        title: "Especificações ausentes",
        module: "Specification",
        severity: "warning",
        description: "Ainda não há especificações reais vinculadas ao projeto.",
        action: "Sincronizar Specification",
      });
    }

    if (!context.budget) {
      insights.push({
        title: "Orçamento real ausente",
        module: "Budget",
        severity: "warning",
        description: "Sem orçamento real, Procurement não deve ser liberado automaticamente.",
        action: "Gerar orçamento",
      });
    }

    if (context.budget && !context.procurement?.length) {
      insights.push({
        title: "Compras ainda não foram geradas",
        module: "Procurement",
        severity: "info",
        description: "Existe orçamento, mas ainda não há solicitações de compra reais.",
        action: "Aguardar budget.approved",
      });
    }

    return insights;
  }
}
