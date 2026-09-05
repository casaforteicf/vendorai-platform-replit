import { describe, expect, it } from 'vitest';
import { buildPaidMediaBudgetRedistributionPlan } from '../services/paidMediaBudgetOptimizer';

describe('paid media budget optimizer', () => {
  it('moves only unspent budget from a weak campaign to a proven winner', () => {
    const plan = buildPaidMediaBudgetRedistributionPlan({
      planBudgetTotal: 1000,
      maxTransferFractionPerCycle: 0.2,
      campaigns: [
        { campaignId: 'winner', currentAllocation: 500, spend: 200, leads: 8, sales: 3, revenue: 1200, roas: 6 },
        { campaignId: 'weak', currentAllocation: 500, spend: 100, leads: 0, sales: 0, revenue: 0, roas: 0 },
      ],
    });

    expect(plan.hasSufficientEvidence).toBe(true);
    expect(plan.humanCeilingRespected).toBe(true);
    expect(plan.targetAllocatedTotal).toBe(1000);
    expect(plan.decisions.find((row) => row.campaignId === 'weak')).toMatchObject({ action: 'decrease', delta: -100, targetAllocation: 400 });
    expect(plan.decisions.find((row) => row.campaignId === 'winner')).toMatchObject({ action: 'increase', delta: 100, targetAllocation: 600 });
  });

  it('never removes budget already spent', () => {
    const plan = buildPaidMediaBudgetRedistributionPlan({
      planBudgetTotal: 1000,
      maxTransferFractionPerCycle: 1,
      campaigns: [
        { campaignId: 'winner', currentAllocation: 400, spend: 100, leads: 6, sales: 2, revenue: 700, roas: 7 },
        { campaignId: 'weak', currentAllocation: 600, spend: 550, leads: 0, sales: 0, revenue: 0, roas: 0 },
      ],
    });

    const weak = plan.decisions.find((row) => row.campaignId === 'weak');
    expect(weak?.targetAllocation).toBe(550);
    expect(weak?.delta).toBe(-50);
    expect(plan.targetAllocatedTotal).toBe(1000);
  });

  it('keeps budget unchanged when there is no proven winner', () => {
    const plan = buildPaidMediaBudgetRedistributionPlan({
      planBudgetTotal: 1000,
      campaigns: [
        { campaignId: 'learning', currentAllocation: 600, spend: 100, leads: 2, sales: 0, revenue: 0, roas: 0 },
        { campaignId: 'weak', currentAllocation: 300, spend: 60, leads: 0, sales: 0, revenue: 0, roas: 0 },
      ],
    });

    expect(plan.hasSufficientEvidence).toBe(false);
    expect(plan.transferableBudget).toBe(0);
    expect(plan.decisions.every((row) => row.action === 'hold')).toBe(true);
    expect(plan.targetAllocatedTotal).toBe(900);
    expect(plan.humanCeilingRespected).toBe(true);
  });

  it('uses unallocated human-approved balance only when a winner has sales and ROAS evidence', () => {
    const plan = buildPaidMediaBudgetRedistributionPlan({
      planBudgetTotal: 1200,
      campaigns: [
        { campaignId: 'winner-a', currentAllocation: 400, spend: 200, leads: 5, sales: 2, revenue: 800, roas: 4 },
        { campaignId: 'winner-b', currentAllocation: 400, spend: 100, leads: 9, sales: 4, revenue: 1500, roas: 5 },
      ],
    });

    expect(plan.unallocatedBudget).toBe(400);
    expect(plan.targetAllocatedTotal).toBe(1200);
    expect(plan.humanCeilingRespected).toBe(true);
    expect(plan.decisions.find((row) => row.campaignId === 'winner-b')!.delta)
      .toBeGreaterThan(plan.decisions.find((row) => row.campaignId === 'winner-a')!.delta);
  });
});
