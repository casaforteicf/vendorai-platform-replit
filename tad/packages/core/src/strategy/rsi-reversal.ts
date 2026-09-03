import type { MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';

export function rsiReversalSignal(m:MarketSnapshot, mtf:MultiTimeframeSnapshot):StrategySignal|null {
  const f5=mtf.frames['5m']; const f15=mtf.frames['15m']; if(!f5||!f15) return null;
  const long=f5.rsi14<=31&&f15.rsi14<=42&&f5.close<f5.ema21&&f5.close<f5.vwap;
  const short=f5.rsi14>=69&&f15.rsi14>=58&&f5.close>f5.ema21&&f5.close>f5.vwap;
  if(!long&&!short) return null;
  const side=long?'LONG':'SHORT'; const d=Math.max(.0038,Math.min(.01,f5.atrPct/100*1.15));
  const extreme=long?(31-f5.rsi14):(f5.rsi14-69);
  const confidence=Math.min(.9,.58+Math.max(0,extreme)/80+Math.min(.1,f5.atrPct/25)+(mtf.alignment==='MIXED'?.05:0));
  return {strategyId:'RSI_REVERSAL_V1',symbol:m.symbol,side,confidence,entry:m.price,stop:m.price*(side==='LONG'?1-d:1+d),targets:[m.price*(side==='LONG'?1+d*1.25:1-d*1.25),m.price*(side==='LONG'?1+d*2.15:1-d*2.15)],rationale:[`RSI5m extremo ${f5.rsi14.toFixed(1)}`,`RSI15m ${f15.rsi14.toFixed(1)}`,`Preço ${side==='LONG'?'abaixo':'acima'} da EMA21 e VWAP`,`MTF ${mtf.alignment}`]};
}
