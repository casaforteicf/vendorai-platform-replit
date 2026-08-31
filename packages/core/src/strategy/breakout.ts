import type { Candle, MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';
export function breakoutSignal(m:MarketSnapshot, mtf:MultiTimeframeSnapshot, candles5m:Candle[]):StrategySignal|null {
  const f=mtf.frames['5m']; if(!f || candles5m.length<25) return null; const prev=candles5m.slice(-21,-1); const hi=Math.max(...prev.map(c=>c.high)), lo=Math.min(...prev.map(c=>c.low));
  const long=m.price>hi && f.rsi14>55, short=m.price<lo && f.rsi14<45; if(!long&&!short) return null; const side=long?'LONG':'SHORT'; const d=Math.max(.005,Math.min(.013,f.atrPct/100*1.5));
  return {strategyId:'BREAKOUT_V1',symbol:m.symbol,side,confidence:Math.min(.91,.60+f.trendStrength/400+mtf.alignmentScore/500),entry:m.price,stop:m.price*(side==='LONG'?1-d:1+d),targets:[m.price*(side==='LONG'?1+d*1.7:1-d*1.7),m.price*(side==='LONG'?1+d*3:1-d*3)],rationale:[`20-bar breakout ${side}`,`trend ${f.trendStrength}`,`MTF ${mtf.alignment}`]};
}
