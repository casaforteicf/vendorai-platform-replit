import type { MarketSnapshot, StrategySignal } from '../types/index';

export function momentumSignal(market: MarketSnapshot): StrategySignal | null {
  const change = market.change24hPct ?? 0;
  if (Math.abs(change) < 1.25 || (market.opportunityScore ?? 0) < 60) return null;
  const side = change > 0 ? 'LONG' : 'SHORT';
  const stopDistance = 0.006;
  const target1 = 0.009;
  const target2 = 0.015;
  return {
    strategyId: 'MOMENTUM_V1',
    symbol: market.symbol,
    side,
    confidence: Math.min(0.92, 0.55 + (market.opportunityScore ?? 0) / 250),
    entry: market.price,
    stop: market.price * (side === 'LONG' ? 1 - stopDistance : 1 + stopDistance),
    targets: [
      market.price * (side === 'LONG' ? 1 + target1 : 1 - target1),
      market.price * (side === 'LONG' ? 1 + target2 : 1 - target2),
    ],
    rationale: [`24h ${change.toFixed(2)}%`, `score ${market.opportunityScore ?? 0}`, `regime ${market.regime ?? 'N/A'}`],
  };
}
