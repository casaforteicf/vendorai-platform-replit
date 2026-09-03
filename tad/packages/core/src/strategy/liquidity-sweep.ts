import type { Candle, MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';

export function liquiditySweepSignal(m:MarketSnapshot, mtf:MultiTimeframeSnapshot, candles:Candle[]):StrategySignal|null {
  const f5=mtf.frames['5m']; if(!f5||candles.length<25) return null;
  const recent=candles.slice(-21,-1); const last=candles.at(-1); if(!last||recent.length<20) return null;
  const priorHigh=Math.max(...recent.map(c=>c.high)); const priorLow=Math.min(...recent.map(c=>c.low));
  const sweptLow=last.low<priorLow&&last.close>priorLow&&f5.rsi14<=48;
  const sweptHigh=last.high>priorHigh&&last.close<priorHigh&&f5.rsi14>=52;
  if(!sweptLow&&!sweptHigh) return null;
  const side=sweptLow?'LONG':'SHORT'; const d=Math.max(.004,Math.min(.012,f5.atrPct/100*1.4));
  const reclaim=side==='LONG'?(last.close-priorLow)/Math.max(1,last.close)*100:(priorHigh-last.close)/Math.max(1,last.close)*100;
  const confidence=Math.min(.92,.62+Math.min(.12,Math.abs(reclaim)/2)+(mtf.alignment==='MIXED'?.04:0));
  return {strategyId:'LIQUIDITY_SWEEP_V1',symbol:m.symbol,side,confidence,entry:m.price,stop:m.price*(side==='LONG'?1-d:1+d),targets:[m.price*(side==='LONG'?1+d*1.4:1-d*1.4),m.price*(side==='LONG'?1+d*2.5:1-d*2.5)],rationale:[`${side==='LONG'?'Varredura da mínima':'Varredura da máxima'} de 20 candles`,`Reentrada ${Math.abs(reclaim).toFixed(3)}%`,`RSI5m ${f5.rsi14.toFixed(1)}`,`MTF ${mtf.alignment}`]};
}
