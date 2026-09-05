import type { BusinessObserverSnapshot } from './business-observer';
import type { RoutedOpportunity } from './intelligence-routing';

export interface ExecutivePriority {
  rank: number;
  area: RoutedOpportunity['target'];
  title: string;
  reason: string;
  recommendedAction: string;
  priority: RoutedOpportunity['priority'];
  signalType: string;
}

export interface BusinessAgentExecutiveBrief {
  tenantId: string;
  generatedAt: string;
  priorities: ExecutivePriority[];
  summary: string;
}

const AREA_LABEL: Record<RoutedOpportunity['target'], string> = {
  sales: 'Comercial',
  marketing: 'Marketing',
  finance: 'Financeiro',
  operations: 'Operação',
  support: 'Suporte',
};

/**
 * Builds a concise executive view from Business Observer output. Execution is
 * delegated to specialist agents/tools; Business Agent itself does not write to
 * domain stores.
 */
export function buildBusinessAgentExecutiveBrief(
  snapshot: BusinessObserverSnapshot,
  limit = 5,
): BusinessAgentExecutiveBrief {
  const priorities = snapshot.topOpportunities.slice(0, limit).map((item, index) => ({
    rank: index + 1,
    area: item.target,
    title: `${AREA_LABEL[item.target]} — ${item.opportunityType}`,
    reason: item.reason,
    recommendedAction: item.recommendedAction,
    priority: item.priority,
    signalType: item.signalType,
  }));

  const summary = priorities.length
    ? `${priorities.length} prioridade(s) executiva(s) identificada(s). ${snapshot.highCount} de alta prioridade e ${snapshot.criticalCount} crítica(s).`
    : 'Nenhuma prioridade executiva relevante foi identificada nos sinais disponíveis.';

  return {
    tenantId: snapshot.tenantId,
    generatedAt: new Date().toISOString(),
    priorities,
    summary,
  };
}
