import type { Candle } from '@tad/core';

const PROXY_URL='https://ryijsscpnicjuchqvcqa.supabase.co/functions/v1/tad-binance-proxy';
const PROXY_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_s9yVOMzsWQm4u3jxZg4i8w_CT5TQSDD';
type RawKline=[number,string,string,string,string,string,number,string,number,string,string,string];

async function page(symbol:string,endTime:number,limit=1500):Promise<Candle[]>{
  const path=`/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=5m&limit=${Math.min(1500,limit)}&endTime=${Math.floor(endTime)}`;
  const url=`${PROXY_URL}?forceFunctionRegion=sa-east-1&url=${encodeURIComponent(path)}`;
  const r=await fetch(url,{cache:'no-store',headers:{apikey:PROXY_KEY,authorization:`Bearer ${PROXY_KEY}`,'x-region':'sa-east-1'}});
  if(!r.ok)throw new Error(`BINANCE_HISTORY_${r.status}`);
  const rows=await r.json() as RawKline[];
  return rows.map(k=>({openTime:k[0],open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),closeTime:k[6]}));
}

export async function loadHistorical5m(symbol:string,days=30):Promise<Candle[]>{
  const target=Math.max(3,Math.min(90,days))*24*12;
  const chunks:Candle[]=[];
  let endTime=Date.now();
  for(let i=0;i<Math.ceil(target/1500)+1&&chunks.length<target;i++){
    const rows=await page(symbol,endTime,1500);
    if(!rows.length)break;
    chunks.unshift(...rows);
    endTime=rows[0].openTime-1;
    if(rows.length<1500)break;
  }
  const dedup=[...new Map(chunks.map(c=>[c.openTime,c])).values()].sort((a,b)=>a.openTime-b.openTime);
  return dedup.slice(-target);
}
