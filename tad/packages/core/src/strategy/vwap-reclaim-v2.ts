import type { Candle, MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

export function vwapReclaimV2Signal(m:MarketSnapshot,mtf:MultiTimeframeSnapshot,candles:Candle[]):StrategySignal|null{
  const f5=mtf.frames['5m'],f15=mtf.frames['15m']; if(!f5||!f15||candles.length<50)return null;
  const last=candles.at(-1)!,prev=candles.at(-2)!;
  const prevBelow=prev.close<f5.vwap,prevAbove=prev.close>f5.vwap;
  const reclaimLong=prevBelow&&last.close>f5.vwap&&last.close>last.open;
  const reclaimShort=prevAbove&&last.close<f5.vwap&&last.close<last.open;
  const trendLong=mtf.alignment!=='BEARISH'&&f5.ema21>f5.ema50&&f15.ema9>f15.ema21&&f5.rsi14>=48&&f5.rsi14<=64;
  const trendShort=mtf.alignment!=='BULLISH'&&f5.ema21<f5.ema50&&f15.ema9<f15.ema21&&f5.rsi14>=36&&f5.rsi14<=52;
  const vwapDist=Math.abs(last.close-f5.vwap)/Math.max(last.close,1e-9)*100;
  const long=reclaimLong&&trendLong&&vwapDist<=Math.max(.18,f5.atrPct*.45);
  const short=reclaimShort&&trendShort&&vwapDist<=Math.max(.18,f5.atrPct*.45);
  if(!long&&!short)return null;
  const side=long?'LONG':'SHORT';
  const recent=candles.slice(-6);const swing=side==='LONG'?Math.min(...recent.map(c=>c.low)):Math.max(...recent.map(c=>c.high));
  const structural=side==='LONG'?Math.min(f5.vwap,swing):Math.max(f5.vwap,swing);
  const risk=clamp(Math.abs(m.price-structural)+f5.atr14*.12,m.price*.0032,m.price*.0095);
  const stop=side==='LONG'?m.price-risk:m.price+risk;const r=risk/m.price;
  return {strategyId:'VWAP_RECLAIM_V2',symbol:m.symbol,side,confidence:clamp(.62+mtf.alignmentScore/650+f5.trendStrength/1100,.63,.92),entry:m.price,stop,targets:[m.price*(side==='LONG'?1+r*1.2:1-r*1.2),m.price*(side==='LONG'?1+r*2.2:1-r*2.2)],rationale:[`reclaim VWAP ${side}`,`distância VWAP ${vwapDist.toFixed(2)}%`,`EMA21/50 favorável`,`confirmação 15m`]};
}
