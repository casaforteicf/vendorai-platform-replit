import type { MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';
export function trendPullbackSignal(m:MarketSnapshot, mtf:MultiTimeframeSnapshot):StrategySignal|null {
  const f=mtf.frames['5m']; if(!f || mtf.alignmentScore<60 || mtf.alignment==='MIXED') return null;
  const long=mtf.alignment==='BULLISH' && f.rsi14>=42 && f.rsi14<=66 && f.close>=f.ema21;
  const short=mtf.alignment==='BEARISH' && f.rsi14>=34 && f.rsi14<=58 && f.close<=f.ema21;
  if(!long&&!short) return null; const side=long?'LONG':'SHORT'; const d=Math.max(0.0045,Math.min(0.012,f.atrPct/100*1.35));
  return {strategyId:'TREND_PULLBACK_V1',symbol:m.symbol,side,confidence:Math.min(.93,.58+mtf.alignmentScore/300+f.trendStrength/500),entry:m.price,stop:m.price*(side==='LONG'?1-d:1+d),targets:[m.price*(side==='LONG'?1+d*1.5:1-d*1.5),m.price*(side==='LONG'?1+d*2.7:1-d*2.7)],rationale:[`MTF ${mtf.alignment} ${mtf.alignmentScore}%`,`RSI5m ${f.rsi14.toFixed(1)}`,`ATR ${f.atrPct.toFixed(2)}%`]};
}
