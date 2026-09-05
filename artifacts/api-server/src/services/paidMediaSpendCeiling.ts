export type PaidMediaSpendCeilingInput = {
  planBudgetTotal: number;
  spend: number;
  activeDailyBudgetTotal: number;
  guardIntervalMinutes?: number;
};

export type PaidMediaSpendCeilingDecision = {
  shouldPause: boolean;
  reason: 'ceiling_reached' | 'safety_reserve_reached' | 'within_ceiling';
  planBudgetTotal: number;
  spend: number;
  remainingBudget: number;
  projectedIntervalSpend: number;
};

function floorCurrency(value: number): number {
  return Math.max(0, Math.floor((value + Number.EPSILON) * 100) / 100);
}

/**
 * Avalia o teto total aprovado pelo humano usando somente valores observáveis.
 * A reserva é a entrega nominal esperada até a próxima execução do guard,
 * derivada dos orçamentos diários ativos — não é score nem previsão de IA.
 */
export function evaluatePaidMediaSpendCeiling(input: PaidMediaSpendCeilingInput): PaidMediaSpendCeilingDecision {
  const planBudgetTotal = floorCurrency(input.planBudgetTotal);
  const spend = floorCurrency(input.spend);
  const activeDailyBudgetTotal = floorCurrency(input.activeDailyBudgetTotal);
  const guardIntervalMinutes = Number.isFinite(input.guardIntervalMinutes)
    ? Math.min(60, Math.max(1, Number(input.guardIntervalMinutes)))
    : 60;

  if (planBudgetTotal <= 0) {
    throw new Error('Teto total inválido para proteção de mídia paga.');
  }

  const remainingBudget = floorCurrency(Math.max(0, planBudgetTotal - spend));
  const projectedIntervalSpend = floorCurrency(activeDailyBudgetTotal * (guardIntervalMinutes / 1440));

  if (spend >= planBudgetTotal) {
    return {
      shouldPause: true,
      reason: 'ceiling_reached',
      planBudgetTotal,
      spend,
      remainingBudget,
      projectedIntervalSpend,
    };
  }

  if (projectedIntervalSpend > 0 && remainingBudget <= projectedIntervalSpend) {
    return {
      shouldPause: true,
      reason: 'safety_reserve_reached',
      planBudgetTotal,
      spend,
      remainingBudget,
      projectedIntervalSpend,
    };
  }

  return {
    shouldPause: false,
    reason: 'within_ceiling',
    planBudgetTotal,
    spend,
    remainingBudget,
    projectedIntervalSpend,
  };
}
