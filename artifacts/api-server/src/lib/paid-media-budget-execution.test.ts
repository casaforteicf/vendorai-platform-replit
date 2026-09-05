import { describe, expect, it } from 'vitest';
import { buildRemainingBudgetSchedule } from '../services/paidMediaBudgetExecution';

describe('paid media budget execution schedule', () => {
  it('uses only the unspent target balance across the remaining approved days', () => {
    const schedule = buildRemainingBudgetSchedule({
      targetAllocation: 600,
      spend: 200,
      endDate: '2026-09-08',
      now: new Date('2026-09-05T15:00:00-03:00'),
    });

    expect(schedule.remainingBudget).toBe(400);
    expect(schedule.remainingDays).toBe(4);
    expect(schedule.dailyBudget).toBe(100);
  });

  it('never recreates budget that has already been spent', () => {
    const schedule = buildRemainingBudgetSchedule({
      targetAllocation: 550,
      spend: 500,
      endDate: '2026-09-06',
      now: new Date('2026-09-05T10:00:00-03:00'),
    });

    expect(schedule.remainingBudget).toBe(50);
    expect(schedule.remainingDays).toBe(2);
    expect(schedule.dailyBudget).toBe(25);
  });

  it('blocks a target allocation below observed spend', () => {
    expect(() => buildRemainingBudgetSchedule({
      targetAllocation: 499.99,
      spend: 500,
      endDate: '2026-09-10',
      now: new Date('2026-09-05T10:00:00-03:00'),
    })).toThrow(/abaixo do gasto/);
  });
});
