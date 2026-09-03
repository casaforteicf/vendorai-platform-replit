import type { Candle, MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';
import { momentumSignal } from './momentum';
import { trendPullbackSignal } from './trend-pullback';
import { vwapReversionSignal } from './vwap-reversion';
import { breakoutSignal } from './breakout';
import { emaRibbonSignal } from './ema-ribbon';
import { rsiReversalSignal } from './rsi-reversal';
import { rangeScalpSignal } from './range-scalp';
import { liquiditySweepSignal } from './liquidity-sweep';
import { applyStrategyTiming, STRATEGY_TIMING_PROFILES } from './timing-profile';

export const STRATEGY_IDS=['MOMENTUM_V1','TREND_PULLBACK_V1','VWAP_REVERSION_V1','BREAKOUT_V1','EMA_RIBBON_V1','RSI_REVERSAL_V1','RANGE_SCALP_V1','LIQUIDITY_SWEEP_V1'] as const;
export type StrategyId=typeof STRATEGY_IDS[number];

export const STRATEGY_CATALOG:Record<StrategyId,{name:string;family:string;description:string;preferredRegime:string}>={
  MOMENTUM_V1:{name:'Momentum',family:'Trend',description:'Continuação quando força e oportunidade confirmam direção.',preferredRegime:'Tendência/impulso'},
  TREND_PULLBACK_V1:{name:'Trend Pullback',family:'Trend',description:'Entrada em correção curta dentro de tendência multi-timeframe.',preferredRegime:'Tendência'},
  VWAP_REVERSION_V1:{name:'VWAP Reversion',family:'Mean Reversion',description:'Retorno à média após afastamento do VWAP.',preferredRegime:'Range/reversão'},
  BREAKOUT_V1:{name:'Breakout',family:'Breakout',description:'Rompimento confirmado de estrutura recente.',preferredRegime:'Expansão'},
  EMA_RIBBON_V1:{name:'EMA Ribbon Trend',family:'Trend',description:'Alinhamento 9/21/50 com confirmação multi-timeframe.',preferredRegime:'Tendência forte'},
  RSI_REVERSAL_V1:{name:'RSI Reversal',family:'Mean Reversion',description:'Reversão após extremos de RSI com confirmação de preço.',preferredRegime:'Exaustão/reversão'},
  RANGE_SCALP_V1:{name:'Range Scalp',family:'Scalp',description:'Operação curta nas extremidades de mercado lateral.',preferredRegime:'Range'},
  LIQUIDITY_SWEEP_V1:{name:'Liquidity Sweep',family:'Price Action',description:'Captura varredura de máxima/mínima seguida de reentrada na faixa.',preferredRegime:'Reversão/volatilidade'},
};

function rawStrategySignal(strategy:StrategyId,m:MarketSnapshot,mtf:MultiTimeframeSnapshot,candles:Candle[]=[]):StrategySignal|null {
  if(strategy==='MOMENTUM_V1') return momentumSignal(m);
  if(strategy==='TREND_PULLBACK_V1') return trendPullbackSignal(m,mtf);
  if(strategy==='VWAP_REVERSION_V1') return vwapReversionSignal(m,mtf);
  if(strategy==='BREAKOUT_V1') return breakoutSignal(m,mtf,candles);
  if(strategy==='EMA_RIBBON_V1') return emaRibbonSignal(m,mtf);
  if(strategy==='RSI_REVERSAL_V1') return rsiReversalSignal(m,mtf);
  if(strategy==='RANGE_SCALP_V1') return rangeScalpSignal(m,mtf);
  return liquiditySweepSignal(m,mtf,candles);
}

export function strategySignal(strategy:StrategyId,m:MarketSnapshot,mtf:MultiTimeframeSnapshot,candles:Candle[]=[]):StrategySignal|null {
  return applyStrategyTiming(rawStrategySignal(strategy,m,mtf,candles),mtf);
}

export function strategyCandidates(m:MarketSnapshot,mtf:MultiTimeframeSnapshot,candles:Candle[]=[]):Array<StrategySignal|null>{
  return STRATEGY_IDS.map(id=>strategySignal(id,m,mtf,candles));
}

export function strategyTimingProfile(strategy:StrategyId){
  return STRATEGY_TIMING_PROFILES[strategy]??null;
}
