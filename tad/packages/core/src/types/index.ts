export type TradingMode = 'PAPER' | 'SHADOW' | 'LIVE';
export type Side = 'LONG' | 'SHORT';
export type MarketRegime = 'STRONG_UP' | 'UP' | 'RANGE' | 'DOWN' | 'STRONG_DOWN';
export type PaperPositionStatus = 'OPEN' | 'CLOSED';
export type PaperCloseReason = 'STOP' | 'BREAK_EVEN' | 'TRAILING_STOP' | 'TP2' | 'MANUAL' | 'RISK_KILL';

export interface MarketSnapshot {
  symbol: string;
  price: number;
  change24hPct?: number;
  quoteVolume24h?: number;
  spreadPct: number;
  fundingRate?: number;
  openInterest?: number;
  regime?: MarketRegime;
  opportunityScore?: number;
  ts: number;
}

export interface StrategySignal {
  strategyId: string;
  symbol: string;
  side: Side;
  confidence: number;
  entry: number;
  stop: number;
  targets: number[];
  rationale: string[];
}

export interface BrainDecision extends StrategySignal {
  decisionId: string;
  agentScores: Record<string, number>;
  consensus: number;
}

export interface RiskPolicy {
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxLeverage: number;
  maxOpenPositions: number;
  maxSpreadPct: number;
  minConsensus: number;
}

export interface RiskResult {
  approved: boolean;
  reasons: string[];
  effectiveRiskPct: number;
}

export interface PaperPosition {
  id: string;
  orderId: string;
  decisionId: string;
  strategyId: string;
  symbol: string;
  side: Side;
  quantity: number;
  leverage: number;
  entry: number;
  markPrice: number;
  stop: number;
  targets: number[];
  accountSize: number;
  riskPct: number;
  riskAmount: number;
  notional: number;
  marginUsed: number;
  unrealizedPnl: number;
  realizedPnl: number;
  status: PaperPositionStatus;
  closeReason?: PaperCloseReason;
  openedAt: number;
  updatedAt: number;
  closedAt?: number;
}

export interface PortfolioSummary {
  startingBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  equity: number;
  openPositions: number;
  closedPositions: number;
  winRatePct: number;
  grossExposure: number;
}

export type CandleInterval = '1m' | '5m' | '15m' | '1h';

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface TechnicalSnapshot {
  symbol: string;
  interval: CandleInterval;
  close: number;
  ema9: number;
  ema21: number;
  ema50: number;
  rsi14: number;
  atr14: number;
  atrPct: number;
  vwap: number;
  structure: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendStrength: number;
  ts: number;
}

export interface MultiTimeframeSnapshot {
  symbol: string;
  frames: Partial<Record<CandleInterval, TechnicalSnapshot>>;
  alignment: 'BULLISH' | 'BEARISH' | 'MIXED';
  alignmentScore: number;
}

export interface StrategyMetric {
  strategyId: string;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  realizedPnl: number;
  avgPnl: number;
  profitFactor: number | null;
}

export type ShadowState = 'LOCKED' | 'OBSERVING' | 'READY';
