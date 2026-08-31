import type { Candle, TechnicalSnapshot, CandleInterval } from '../types/index';

export function ema(values:number[], period:number):number {
  if (!values.length) return 0;
  const k=2/(period+1);
  let out=values[0];
  for (let i=1;i<values.length;i++) out=values[i]*k+out*(1-k);
  return out;
}

export function rsi(values:number[], period=14):number {
  if (values.length < period+1) return 50;
  let gains=0, losses=0;
  for(let i=values.length-period;i<values.length;i++){ const d=values[i]-values[i-1]; if(d>=0) gains+=d; else losses-=d; }
  if(losses===0) return 100; const rs=(gains/period)/(losses/period); return 100-(100/(1+rs));
}

export function atr(candles:Candle[], period=14):number {
  if(candles.length<2) return 0;
  const trs:number[]=[];
  for(let i=Math.max(1,candles.length-period);i<candles.length;i++){
    const c=candles[i], prev=candles[i-1].close;
    trs.push(Math.max(c.high-c.low, Math.abs(c.high-prev), Math.abs(c.low-prev)));
  }
  return trs.reduce((a,b)=>a+b,0)/Math.max(1,trs.length);
}

export function vwap(candles:Candle[]):number {
  let pv=0,v=0; for(const c of candles){ const tp=(c.high+c.low+c.close)/3; pv+=tp*c.volume; v+=c.volume; }
  return v?pv/v:(candles.at(-1)?.close??0);
}

export function technicalSnapshot(symbol:string, interval:CandleInterval, candles:Candle[]):TechnicalSnapshot {
  const closes=candles.map(c=>c.close); const close=closes.at(-1)??0;
  const ema9=ema(closes.slice(-120),9), ema21=ema(closes.slice(-120),21), ema50=ema(closes.slice(-160),50);
  const rsi14=rsi(closes,14), atr14=atr(candles,14), atrPct=close?atr14/close*100:0, vw=vwap(candles.slice(-50));
  const bull=close>ema9 && ema9>ema21 && ema21>ema50; const bear=close<ema9 && ema9<ema21 && ema21<ema50;
  const structure=bull?'BULLISH':bear?'BEARISH':'NEUTRAL';
  const gap=close?Math.abs(ema9-ema21)/close*100:0; const trendStrength=Math.min(100, Math.round(gap*1200 + Math.abs(rsi14-50)*1.2));
  return {symbol,interval,close,ema9,ema21,ema50,rsi14,atr14,atrPct,vwap:vw,structure,trendStrength,ts:Date.now()};
}
