import type { MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';

export function emaRibbonSignal(m:MarketSnapshot, mtf:MultiTimeframeSnapshot):StrategySignal|null {
  const f5=mtf.frames['5m']; const f15=mtf.frames['15m']; if(!f5||!f15) return null;
  const long=mtf.alignment==='BULLISH'&&mtf.alignmentScore>=66&&f5.ema9>f5.ema21&&f5.ema21>f5.ema50&&f15.ema9>f15.ema21&&f5.rsi14>=50&&f5.rsi14<=70;
  const short=mtf.alignment==='BEARISH'&&mtf.alignmentScore>=66&&f5.ema9<f5.ema21&&f5.ema21<f5.ema50&&f15.ema9<f15.ema21&&f5.rsi14>=30&&f5.rsi14<=50;
  if(!long&&!short) return null;
  const side=long?'LONG':'SHORT'; const d=Math.max(.004,Math.min(.011,f5.atrPct/100*1.25));
  const separation=Math.abs(f5.ema9-f5.ema21)/Math.max(1,f5.close)*100;
  const confidence=Math.min(.94,.6+mtf.alignmentScore/320+Math.min(.08,separation/4)+f5.trendStrength/700);
  return {strategyId:'EMA_RIBBON_V1',symbol:m.symbol,side,confidence,entry:m.price,stop:m.price*(side==='LONG'?1-d:1+d),targets:[m.price*(side==='LONG'?1+d*1.6:1-d*1.6),m.price*(side==='LONG'?1+d*2.8:1-d*2.8)],rationale:[`Ribbon EMA 9/21/50 ${side==='LONG'?'ascendente':'descendente'}`,`MTF ${mtf.alignment} ${mtf.alignmentScore}%`,`RSI5m ${f5.rsi14.toFixed(1)}`,`Separação EMA ${separation.toFixed(3)}%`]};
}
