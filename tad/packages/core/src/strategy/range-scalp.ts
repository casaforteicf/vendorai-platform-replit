import type { MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';

export function rangeScalpSignal(m:MarketSnapshot, mtf:MultiTimeframeSnapshot):StrategySignal|null {
  const f5=mtf.frames['5m']; const f15=mtf.frames['15m']; if(!f5||!f15) return null;
  const lowTrend=f5.trendStrength<=38&&f15.trendStrength<=42;
  const stretchedBelow=f5.close<f5.vwap&&f5.rsi14<=38;
  const stretchedAbove=f5.close>f5.vwap&&f5.rsi14>=62;
  const long=lowTrend&&stretchedBelow&&mtf.alignment!=='BEARISH';
  const short=lowTrend&&stretchedAbove&&mtf.alignment!=='BULLISH';
  if(!long&&!short) return null;
  const side=long?'LONG':'SHORT'; const d=Math.max(.0028,Math.min(.0075,f5.atrPct/100*.95));
  const vwapDistance=Math.abs(f5.close-f5.vwap)/Math.max(1,f5.close)*100;
  const confidence=Math.min(.88,.56+Math.min(.12,vwapDistance/3)+(lowTrend?.08:0));
  return {strategyId:'RANGE_SCALP_V1',symbol:m.symbol,side,confidence,entry:m.price,stop:m.price*(side==='LONG'?1-d:1+d),targets:[m.price*(side==='LONG'?1+d*1.1:1-d*1.1),m.price*(side==='LONG'?1+d*1.8:1-d*1.8)],rationale:[`Mercado lateral: força 5m ${f5.trendStrength.toFixed(1)}`,`Distância VWAP ${vwapDistance.toFixed(3)}%`,`RSI5m ${f5.rsi14.toFixed(1)}`,`Reversão curta em range`]};
}
