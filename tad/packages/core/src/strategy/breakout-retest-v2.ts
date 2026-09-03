import type { Candle, MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;

export function breakoutRetestV2Signal(m:MarketSnapshot,mtf:MultiTimeframeSnapshot,candles:Candle[]):StrategySignal|null{
  const f5=mtf.frames['5m'],f15=mtf.frames['15m']; if(!f5||!f15||candles.length<70)return null;
  const history=candles.slice(-55,-5),recent=candles.slice(-5),last=recent.at(-1)!;
  const hi=Math.max(...history.map(c=>c.high)),lo=Math.min(...history.map(c=>c.low));
  const avgVol=avg(history.slice(-20).map(c=>c.volume));
  const breakoutLong=recent.slice(0,-1).some(c=>c.close>hi&&c.volume>=avgVol*1.15);
  const breakoutShort=recent.slice(0,-1).some(c=>c.close<lo&&c.volume>=avgVol*1.15);
  const tol=Math.max(m.price*.0015,f5.atr14*.18);
  const retestLong=breakoutLong&&last.low<=hi+tol&&last.close>hi&&last.close>last.open;
  const retestShort=breakoutShort&&last.high>=lo-tol&&last.close<lo&&last.close<last.open;
  const trendLong=mtf.alignment==='BULLISH'&&mtf.alignmentScore>=66&&f5.ema9>f5.ema21&&f15.ema9>f15.ema21&&f5.rsi14>=52&&f5.rsi14<=68;
  const trendShort=mtf.alignment==='BEARISH'&&mtf.alignmentScore>=66&&f5.ema9<f5.ema21&&f15.ema9<f15.ema21&&f5.rsi14>=32&&f5.rsi14<=48;
  const long=retestLong&&trendLong,short=retestShort&&trendShort;if(!long&&!short)return null;
  const side=long?'LONG':'SHORT';
  const invalidation=side==='LONG'?hi-tol:lo+tol;
  const minRisk=m.price*.0038,maxRisk=m.price*.012;
  const risk=clamp(Math.abs(m.price-invalidation),minRisk,maxRisk); const stop=side==='LONG'?m.price-risk:m.price+risk; const r=risk/m.price;
  const volumeBoost=clamp(last.volume/Math.max(avgVol,1),1,2);
  return {strategyId:'BREAKOUT_RETEST_V2',symbol:m.symbol,side,confidence:clamp(.63+mtf.alignmentScore/550+(volumeBoost-1)*.08,.64,.94),entry:m.price,stop,targets:[m.price*(side==='LONG'?1+r*1.35:1-r*1.35),m.price*(side==='LONG'?1+r*2.7:1-r*2.7)],rationale:[`rompimento + reteste de ${side==='LONG'?'resistência':'suporte'}`,`volume breakout >= 1.15x média`,`MTF ${mtf.alignment} ${mtf.alignmentScore}%`,`invalidação estrutural`]};
}
