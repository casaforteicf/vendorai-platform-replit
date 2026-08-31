import type { BrainDecision, MarketSnapshot, RiskPolicy, RiskResult } from '../types/index';
import { GLOBAL_PAPER_SAFETY_CAPS } from './operating-profiles';

export function evaluateRisk(
  decision: BrainDecision,
  market: MarketSnapshot,
  policy: RiskPolicy,
  state: { dailyLossPct: number; openPositions: number; requestedLeverage: number }
): RiskResult {
  const reasons: string[] = [];
  const cappedPolicy: RiskPolicy = {
    ...policy,
    maxRiskPerTradePct: Math.min(policy.maxRiskPerTradePct, GLOBAL_PAPER_SAFETY_CAPS.maxRiskPerTradePct),
    maxDailyLossPct: Math.min(policy.maxDailyLossPct, GLOBAL_PAPER_SAFETY_CAPS.maxDailyLossPct),
    maxLeverage: Math.min(policy.maxLeverage, GLOBAL_PAPER_SAFETY_CAPS.maxLeverage),
    maxOpenPositions: Math.min(policy.maxOpenPositions, GLOBAL_PAPER_SAFETY_CAPS.maxOpenPositions),
  };

  if (state.dailyLossPct >= cappedPolicy.maxDailyLossPct) reasons.push('DAILY_LOSS_LIMIT');
  if (state.openPositions >= cappedPolicy.maxOpenPositions) reasons.push('MAX_OPEN_POSITIONS');
  if (state.requestedLeverage > cappedPolicy.maxLeverage) reasons.push('MAX_LEVERAGE');
  if (market.spreadPct > cappedPolicy.maxSpreadPct) reasons.push('SPREAD_TOO_WIDE');
  if (decision.consensus < cappedPolicy.minConsensus) reasons.push('LOW_CONSENSUS');
  if (!Number.isFinite(decision.stop) || decision.stop <= 0) reasons.push('INVALID_STOP');

  return {
    approved: reasons.length === 0,
    reasons,
    effectiveRiskPct: reasons.length ? 0 : cappedPolicy.maxRiskPerTradePct,
  };
}
