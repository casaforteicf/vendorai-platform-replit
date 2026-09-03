import type { Candle, MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;

export function liquiditySweepV2Signal(m:MarketSnapshot,mtf:MultiTimeframeSnapshot,candles:Candle[]):StrategySignal|null{
  const f5=mtf.frames['5m'];if(!f5||candles.length<60)return null;
  const last=candles.at(-1)!,base=candles.slice(-31,-1);const recentHigh=Math.max(...base.map(c=>c.high)),recentLow=Math.min(...base.map(c=>c.low));
  const range=Math.max(last.high-last.low,m.price*.0001);const body=Math.abs(last.close-last.open);const upperWick=last.high-Math.max(last.open,last.close),lowerWick=Math.min(last.open,last.close)-last.low;
  const avgVol=avg(base.slice(-20).map(c=>c.volume));const volumeSpike=last.volume>=avgVol*1.2;
  const bullSweep=last.low<recentLow&&last.close>recentLow&&lowerWick/range>=.42&&body/range<=.55&&volumeSpike&&f5.rsi14<=46;
  const bearSweep=last.high>recentHigh&&last.close<recentHigh&&upperWick/range>=.42&&body/range<=.55&&volumeSpike&&f5.rsi14>=54;
  const long=bullSweep&&mtf.alignment!=='BEARISH',short=bearSweep&&mtf.alignment!=='BULLISH';if(!long&&!short)return null;
  const side=long?'LONG':'SHORT';
  const extreme=side==='LONG'?last.low:last.high;const risk=clamp(Math.abs(m.price-extreme)+f5.atr14*.15,m.price*.003,m.price*.0095);const stop=side==='LONG'?m.price-risk:m.price+risk;const r=risk/m.price;
  const wickRatio=side==='LONG'?lowerWick/range:upperWick/range;
  return {strategyId:'LIQUIDITY_SWEEP_V2',symbol:m.symbol,side,confidence:clamp(.62+wickRatio*.22+Math.min(.08,last.volume/Math.max(avgVol,1)*.025)+mtf.alignmentScore/900,.64,.94),entry:m.price,stop,targets:[m.price*(side==='LONG'?1+r*1.2:1-r*1.2),m.price*(side==='LONG'?1+r*2.35:1-r*2.35)],rationale:[`sweep 30 barras + reentrada`, `wick ${(wickRatio*100).toFixed(0)}% do candle`,`volume >= 1.2x média`,`MTF não contrário`]};
}
