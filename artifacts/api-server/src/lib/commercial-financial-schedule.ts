/**
 * LOTE 05 — cálculo financeiro determinístico, isolado de tenant e vertical.
 * Valores monetários sempre em centavos inteiros; percentuais físicos em basis points.
 * Este módulo não substitui o orçamento construtivo existente.
 */
export type PhysicalStage = {
  id: string;
  weight: number;
  startsAt?: string;
  endsAt?: string;
};
export type ScheduledStage = PhysicalStage & {
  physicalBasisPoints: number;
  grossCents: number;
  advanceDeductionCents: number;
  balanceCents: number;
};
export type FinancialSchedule = {
  grossCents: number;
  advanceCents: number;
  remainingCents: number;
  stages: ScheduledStage[];
};

function assertSafeNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} deve ser inteiro seguro e não negativo`);
  }
}

/** Distribuição determinística pelo maior resto; fecha exatamente o total. */
export function allocateExactly(total: number, weights: readonly number[]): number[] {
  assertSafeNonNegativeInteger(total, "total");
  if (weights.length === 0) {
    if (total !== 0) throw new Error("Não é possível distribuir total sem etapas");
    return [];
  }
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) throw new Error("Peso inválido");
  }
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (!Number.isFinite(sum) || sum <= 0) throw new Error("Soma dos pesos deve ser positiva");
  // Reject inputs that would lose integer-cent precision in IEEE-754 arithmetic.
  if (!Number.isFinite(sum) || sum > Number.MAX_SAFE_INTEGER) throw new Error("Soma dos pesos fora dos limites seguros");
  const raw = weights.map((weight) => total * (weight / sum));
  if (raw.some((value) => !Number.isFinite(value))) throw new Error("Distribuição fora dos limites numéricos");
  const allocation = raw.map(Math.floor);
  let missing = total - allocation.reduce((acc, value) => acc + value, 0);
  const ordered = raw.map((value, index) => ({ index, remainder: value - allocation[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < missing; i++) allocation[ordered[i % ordered.length].index]++;
  return allocation;
}

export function buildFinancialSchedule(
  grossCents: number,
  advanceCents: number,
  stages: readonly PhysicalStage[],
): FinancialSchedule {
  assertSafeNonNegativeInteger(grossCents, "grossCents");
  assertSafeNonNegativeInteger(advanceCents, "advanceCents");
  if (advanceCents > grossCents) throw new Error("Entrada não pode superar o valor total");
  if (stages.length === 0) throw new Error("Cronograma exige pelo menos uma etapa");
  const ids = new Set<string>();
  for (const stage of stages) {
    if (!stage.id.trim() || ids.has(stage.id)) throw new Error("ID de etapa vazio ou duplicado");
    ids.add(stage.id);
    if (!Number.isFinite(stage.weight) || stage.weight <= 0) throw new Error("Peso da etapa deve ser positivo");
    if (stage.startsAt && stage.endsAt && stage.endsAt < stage.startsAt) {
      throw new Error("Data final anterior à inicial");
    }
  }
  const weights = stages.map((stage) => stage.weight);
  const percentages = allocateExactly(10000, weights);
  const gross = allocateExactly(grossCents, weights);
  const deductions = allocateExactly(advanceCents, grossCents > 0 ? gross : weights);
  const output = stages.map((stage, index) => ({
    ...stage,
    physicalBasisPoints: percentages[index],
    grossCents: gross[index],
    advanceDeductionCents: deductions[index],
    balanceCents: gross[index] - deductions[index],
  }));
  return {
    grossCents,
    advanceCents,
    remainingCents: grossCents - advanceCents,
    stages: output,
  };
}
