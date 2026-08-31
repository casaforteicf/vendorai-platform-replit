import type { CandleInterval, MultiTimeframeSnapshot, TechnicalSnapshot } from '../types/index';

export function buildMultiTimeframe(symbol:string, frames:Partial<Record<CandleInterval,TechnicalSnapshot>>):MultiTimeframeSnapshot {
  const vals=Object.values(frames); let bull=0,bear=0,weight=0;
  const weights:Record<string,number>={'1m':1,'5m':2,'15m':3,'1h':4};
  for(const f of vals){ const w=weights[f.interval]??1; weight+=w; if(f.structure==='BULLISH') bull+=w; if(f.structure==='BEARISH') bear+=w; }
  const alignment=bull>bear*1.4?'BULLISH':bear>bull*1.4?'BEARISH':'MIXED';
  const alignmentScore=weight?Math.round(Math.max(bull,bear)/weight*100):0;
  return {symbol,frames,alignment,alignmentScore};
}
