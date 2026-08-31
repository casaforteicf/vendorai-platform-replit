import type { MarketRegime, MarketSnapshot } from '../types/index';

export function classifyRegime(change24hPct = 0): MarketRegime {
  if (change24hPct >= 5) return 'STRONG_UP';
  if (change24hPct >= 1.25) return 'UP';
  if (change24hPct <= -5) return 'STRONG_DOWN';
  if (change24hPct <= -1.25) return 'DOWN';
  return 'RANGE';
}

export function opportunityScore(input: Pick<MarketSnapshot, 'change24hPct' | 'spreadPct' | 'fundingRate' | 'quoteVolume24h'>): number {
  const momentum = Math.min(35, Math.abs(input.change24hPct ?? 0) * 4.5);
  const liquidity = Math.min(30, Math.log10(Math.max(1, input.quoteVolume24h ?? 1)) * 3.2);
  const spreadQuality = Math.max(0, 25 - input.spreadPct * 1000);
  const fundingPenalty = Math.min(15, Math.abs(input.fundingRate ?? 0) * 100000);
  return Math.max(0, Math.min(100, Math.round(momentum + liquidity + spreadQuality - fundingPenalty)));
}
