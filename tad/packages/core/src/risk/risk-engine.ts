import type { BrainDecision, MarketSnapshot, RiskPolicy, RiskResult } from '../types/index';

export function evaluateRisk(
  decision: BrainDecision,
  market: MarketSnapshot,
  policy: RiskPolicy,
  state: { dailyLossPct: number; openPositions: number; requestedLeverage: number }
): RiskResult {
  const reasons: string[] = [];
  if (state.dailyLossPct >= policy.maxDailyLossPct) reasons.push('DAILY_LOSS_LIMIT');
  if (state.openPositions >= policy.maxOpenPositions) reasons.push('MAX_OPEN_POSITIONS');
  if (state.requestedLeverage > policy.maxLeverage) reasons.push('MAX_LEVERAGE');
  if (market.spreadPct > policy.maxSpreadPct) reasons.push('SPREAD_TOO_WIDE');
  if (decision.consensus < policy.minConsensus) reasons.push('LOW_CONSENSUS');
  if (!Number.isFinite(decision.stop) || decision.stop <= 0) reasons.push('INVALID_STOP');

  return {
    approved: reasons.length === 0,
    reasons,
    effectiveRiskPct: reasons.length ? 0 : Math.min(policy.maxRiskPerTradePct, 0.4),
  };
}
