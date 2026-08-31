import type { Candle } from '../types/index';

export function aggregateCandles(candles:Candle[],targetMs:number):Candle[]{
  if(!candles.length||targetMs<=0)return [];
  const groups=new Map<number,Candle[]>();
  for(const c of candles){const bucket=Math.floor(c.openTime/targetMs)*targetMs;const rows=groups.get(bucket)??[];rows.push(c);groups.set(bucket,rows);}
  const out:Candle[]=[];
  for(const [bucket,rows0] of [...groups.entries()].sort((a,b)=>a[0]-b[0])){
    const rows=rows0.sort((a,b)=>a.openTime-b.openTime);
    const expected=Math.round(targetMs/Math.max(1,rows[0].closeTime-rows[0].openTime+1));
    const bucketEnd=bucket+targetMs-1;
    if(rows.length<expected||rows.at(-1)!.closeTime<bucketEnd-1000)continue;
    out.push({openTime:bucket,open:rows[0].open,high:Math.max(...rows.map(r=>r.high)),low:Math.min(...rows.map(r=>r.low)),close:rows.at(-1)!.close,volume:rows.reduce((a,r)=>a+r.volume,0),closeTime:rows.at(-1)!.closeTime});
  }
  return out;
}
