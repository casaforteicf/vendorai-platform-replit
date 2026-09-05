import { describe, expect, it } from 'vitest';
import { evaluatePaidMediaSpendCeiling } from '../services/paidMediaSpendCeiling';

describe('paid media spend ceiling', () => {
  it('pauses when actual spend reaches the human ceiling', () => {
    const result = evaluatePaidMediaSpendCeiling({
      planBudgetTotal: 1000,
      spend: 1000,
      activeDailyBudgetTotal: 240,
      guardIntervalMinutes: 15,
    });

    expect(result.shouldPause).toBe(true);
    expect(result.reason).toBe('ceiling_reached');
    expect(result.remainingBudget).toBe(0);
  });

  it('pauses proactively when remaining budget fits inside the next guard interval reserve', () => {
    const result = evaluatePaidMediaSpendCeiling({
      planBudgetTotal: 1000,
      spend: 995,
      activeDailyBudgetTotal: 960,
      guardIntervalMinutes: 15,
    });

    expect(result.projectedIntervalSpend).toBe(10);
    expect(result.shouldPause).toBe(true);
    expect(result.reason).toBe('safety_reserve_reached');
  });

  it('keeps delivery running while the approved balance safely exceeds the interval reserve', () => {
    const result = evaluatePaidMediaSpendCeiling({
      planBudgetTotal: 1000,
      spend: 900,
      activeDailyBudgetTotal: 96,
      guardIntervalMinutes: 15,
    });

    expect(result.projectedIntervalSpend).toBe(1);
    expect(result.shouldPause).toBe(false);
    expect(result.reason).toBe('within_ceiling');
  });

  it('rejects an invalid human ceiling', () => {
    expect(() => evaluatePaidMediaSpendCeiling({
      planBudgetTotal: 0,
      spend: 0,
      activeDailyBudgetTotal: 0,
    })).toThrow(/Teto total inválido/);
  });
});
