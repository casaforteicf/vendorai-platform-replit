import type { Candle, MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

export function trendPullbackV2Signal(m:MarketSnapshot,mtf:MultiTimeframeSnapshot,candles:Candle[]):StrategySignal|null{
  const f5=mtf.frames['5m'],f15=mtf.frames['15m'],f1h=mtf.frames['1h'];
  if(!f5||!f15||!f1h||candles.length<60||mtf.alignment==='MIXED'||mtf.alignmentScore<75)return null;
  const last=candles.at(-1)!,prev=candles.at(-2)!;
  const emaDistancePct=Math.abs(f5.close-f5.ema21)/Math.max(f5.close,1e-9)*100;
  const maxPullbackDistance=Math.max(.22,Math.min(.55,f5.atrPct*.65));
  const ribbonLong=f5.ema9>f5.ema21&&f5.ema21>f5.ema50&&f15.ema9>f15.ema21&&f1h.ema9>f1h.ema21;
  const ribbonShort=f5.ema9<f5.ema21&&f5.ema21<f5.ema50&&f15.ema9<f15.ema21&&f1h.ema9<f1h.ema21;
  const confirmLong=last.close>last.open&&last.close>prev.close&&last.low<=Math.max(f5.ema9,f5.ema21)*1.0025;
  const confirmShort=last.close<last.open&&last.close<prev.close&&last.high>=Math.min(f5.ema9,f5.ema21)*.9975;
  const long=mtf.alignment==='BULLISH'&&ribbonLong&&confirmLong&&emaDistancePct<=maxPullbackDistance&&f5.rsi14>=46&&f5.rsi14<=62&&f5.trendStrength>=42;
  const short=mtf.alignment==='BEARISH'&&ribbonShort&&confirmShort&&emaDistancePct<=maxPullbackDistance&&f5.rsi14>=38&&f5.rsi14<=54&&f5.trendStrength>=42;
  if(!long&&!short)return null;
  const side=long?'LONG':'SHORT';
  const recent=candles.slice(-8);
  const swing=side==='LONG'?Math.min(...recent.map(c=>c.low)):Math.max(...recent.map(c=>c.high));
  const atrBuffer=f5.atr14*.18;
  const structuralStop=side==='LONG'?swing-atrBuffer:swing+atrBuffer;
  const minRisk=m.price*.0035,maxRisk=m.price*.0105;
  let risk=Math.abs(m.price-structuralStop);risk=clamp(risk,minRisk,maxRisk);
  const stop=side==='LONG'?m.price-risk:m.price+risk;
  const r=risk/m.price;
  return {strategyId:'TREND_PULLBACK_V2',symbol:m.symbol,side,confidence:clamp(.64+mtf.alignmentScore/500+f5.trendStrength/900,.65,.95),entry:m.price,stop,targets:[m.price*(side==='LONG'?1+r*1.25:1-r*1.25),m.price*(side==='LONG'?1+r*2.4:1-r*2.4)],rationale:[`Pullback EMA21 ${emaDistancePct.toFixed(2)}%`,`MTF ${mtf.alignment} ${mtf.alignmentScore}%`,`confirmação candle 5m`,`stop estrutural + ATR`]};
}
