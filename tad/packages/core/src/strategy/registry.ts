import type { Candle, MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';
import { momentumSignal } from './momentum';
import { trendPullbackSignal } from './trend-pullback';
import { vwapReversionSignal } from './vwap-reversion';
import { breakoutSignal } from './breakout';
import { emaRibbonSignal } from './ema-ribbon';
import { rsiReversalSignal } from './rsi-reversal';
import { rangeScalpSignal } from './range-scalp';
import { liquiditySweepSignal } from './liquidity-sweep';
import { trendPullbackV2Signal } from './trend-pullback-v2';
import { breakoutRetestV2Signal } from './breakout-retest-v2';
import { vwapReclaimV2Signal } from './vwap-reclaim-v2';
import { liquiditySweepV2Signal } from './liquidity-sweep-v2';

export const ACTIVE_STRATEGY_IDS=['MOMENTUM_V1','TREND_PULLBACK_V1','VWAP_REVERSION_V1','BREAKOUT_V1','EMA_RIBBON_V1','RSI_REVERSAL_V1','RANGE_SCALP_V1','LIQUIDITY_SWEEP_V1'] as const;
export const RESEARCH_STRATEGY_IDS=['TREND_PULLBACK_V2','BREAKOUT_RETEST_V2','VWAP_RECLAIM_V2','LIQUIDITY_SWEEP_V2'] as const;
export const STRATEGY_IDS=[...ACTIVE_STRATEGY_IDS,...RESEARCH_STRATEGY_IDS] as const;
export type StrategyId=typeof STRATEGY_IDS[number];

export const STRATEGY_CATALOG:Record<StrategyId,{name:string;family:string;description:string;preferredRegime:string;status?:'ACTIVE'|'RESEARCH'}>={
  MOMENTUM_V1:{name:'Momentum',family:'Trend',description:'Continuação quando força e oportunidade confirmam direção.',preferredRegime:'Tendência/impulso',status:'ACTIVE'},
  TREND_PULLBACK_V1:{name:'Trend Pullback',family:'Trend',description:'Entrada em correção curta dentro de tendência multi-timeframe.',preferredRegime:'Tendência',status:'ACTIVE'},
  VWAP_REVERSION_V1:{name:'VWAP Reversion',family:'Mean Reversion',description:'Retorno à média após afastamento do VWAP.',preferredRegime:'Range/reversão',status:'ACTIVE'},
  BREAKOUT_V1:{name:'Breakout',family:'Breakout',description:'Rompimento confirmado de estrutura recente.',preferredRegime:'Expansão',status:'ACTIVE'},
  EMA_RIBBON_V1:{name:'EMA Ribbon Trend',family:'Trend',description:'Alinhamento 9/21/50 com confirmação multi-timeframe.',preferredRegime:'Tendência forte',status:'ACTIVE'},
  RSI_REVERSAL_V1:{name:'RSI Reversal',family:'Mean Reversion',description:'Reversão após extremos de RSI com confirmação de preço.',preferredRegime:'Exaustão/reversão',status:'ACTIVE'},
  RANGE_SCALP_V1:{name:'Range Scalp',family:'Scalp',description:'Operação curta nas extremidades de mercado lateral.',preferredRegime:'Range',status:'ACTIVE'},
  LIQUIDITY_SWEEP_V1:{name:'Liquidity Sweep',family:'Price Action',description:'Captura varredura de máxima/mínima seguida de reentrada na faixa.',preferredRegime:'Reversão/volatilidade',status:'ACTIVE'},
  TREND_PULLBACK_V2:{name:'Trend Pullback V2',family:'Trend',description:'Pullback seletivo na EMA21 com alinhamento 5m/15m/1h, confirmação de candle e stop estrutural.',preferredRegime:'Tendência limpa',status:'RESEARCH'},
  BREAKOUT_RETEST_V2:{name:'Breakout Retest V2',family:'Breakout',description:'Rompimento com expansão de volume seguido de reteste confirmado da estrutura.',preferredRegime:'Expansão/tendência',status:'RESEARCH'},
  VWAP_RECLAIM_V2:{name:'VWAP Reclaim V2',family:'Trend',description:'Recuperação do VWAP alinhada à estrutura e EMA de 15m, evitando reversão cega.',preferredRegime:'Continuação após correção',status:'RESEARCH'},
  LIQUIDITY_SWEEP_V2:{name:'Liquidity Sweep V2',family:'Price Action',description:'Varredura com wick de rejeição, volume acima da média e confirmação contra falso rompimento.',preferredRegime:'Reversão/volatilidade',status:'RESEARCH'},
};

export function strategySignal(strategy:StrategyId,m:MarketSnapshot,mtf:MultiTimeframeSnapshot,candles:Candle[]=[]):StrategySignal|null {
  if(strategy==='MOMENTUM_V1') return momentumSignal(m);
  if(strategy==='TREND_PULLBACK_V1') return trendPullbackSignal(m,mtf);
  if(strategy==='VWAP_REVERSION_V1') return vwapReversionSignal(m,mtf);
  if(strategy==='BREAKOUT_V1') return breakoutSignal(m,mtf,candles);
  if(strategy==='EMA_RIBBON_V1') return emaRibbonSignal(m,mtf);
  if(strategy==='RSI_REVERSAL_V1') return rsiReversalSignal(m,mtf);
  if(strategy==='RANGE_SCALP_V1') return rangeScalpSignal(m,mtf);
  if(strategy==='LIQUIDITY_SWEEP_V1') return liquiditySweepSignal(m,mtf,candles);
  if(strategy==='TREND_PULLBACK_V2') return trendPullbackV2Signal(m,mtf,candles);
  if(strategy==='BREAKOUT_RETEST_V2') return breakoutRetestV2Signal(m,mtf,candles);
  if(strategy==='VWAP_RECLAIM_V2') return vwapReclaimV2Signal(m,mtf,candles);
  return liquiditySweepV2Signal(m,mtf,candles);
}

export function strategyCandidates(m:MarketSnapshot,mtf:MultiTimeframeSnapshot,candles:Candle[]=[]):Array<StrategySignal|null>{
  return ACTIVE_STRATEGY_IDS.map(id=>strategySignal(id,m,mtf,candles));
}
