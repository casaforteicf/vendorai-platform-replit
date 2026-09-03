import { BINANCE_REST } from './binance';
import { classifyRegime, type Candle, type HorizonState } from '@tad/core';

const PROXY='https://ryijsscpnicjuchqvcqa.supabase.co/functions/v1/tad-binance-proxy';
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6InJ5aWpzc2NwbmljanVjaHF2Y3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMDA3MDQsImV4cCI6MjEwMzY3NjcwNH0.zZcne9BjkbQlafdOW0iGvYAuRwso_vCiT32vUkTFAeo';
type Raw=[number,string,string,string,string,string,number,string,number,string,string,string];

async function proxyFetch(path:string){
 const url=PROXY+'?forceFunctionRegion=sa-east-1&url='+encodeURIComponent(path);
 return fetch(url,{cache:'no-store',headers:{apikey:ANON,authorization:'Bearer '+ANON,'x-region':'sa-east-1'}});
}

function mapRows(rows:Raw[]):Candle[]{return rows.map(k=>({openTime:k[0],open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),closeTime:k[6]}));}

export async function loadPagedCandles(symbol:string,interval:'1h'|'5m'|'1m',bars:number):Promise<Candle[]>{
 const out:Candle[]=[]; let endTime:number|undefined;
 while(out.length<bars){
  const limit=Math.min(1500,bars-out.length);
  const q=`/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}${endTime?`&endTime=${endTime}`:''}`;
  const r=await proxyFetch(q); if(!r.ok)throw new Error(`PAGED_KLINES_${interval}_${r.status}`);
  const rows=await r.json() as Raw[]; if(!rows.length)break;
  const batch=mapRows(rows); out.unshift(...batch);
  endTime=batch[0].openTime-1;
  if(rows.length<limit)break;
 }
 const dedup=new Map(out.map(c=>[c.openTime,c]));
 return [...dedup.values()].sort((a,b)=>a.openTime-b.openTime).slice(-bars);
}

function stdev(values:number[]){if(values.length<2)return 0;const avg=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((a,b)=>a+(b-avg)**2,0)/(values.length-1));}
function horizonState(horizon:string,candles:Candle[],bars:number):HorizonState{
 const slice=candles.slice(-Math.min(bars,candles.length));
 if(!slice.length)return {horizon,returnPct:0,volatilityPct:0,direction:'NEUTRAL',regime:'RANGE',coverage:false,samples:0};
 const first=slice[0].open,last=slice.at(-1)!.close;
 const ret=first?((last/first)-1)*100:0;
 const returns=slice.length>1?slice.slice(1).map((c,i)=>slice[i].close?((c.close/slice[i].close)-1)*100:0):[ret];
 const vol=stdev(returns);
 const threshold=Math.max(.08,vol*.35);
 const direction=ret>threshold?'BULLISH':ret<-threshold?'BEARISH':'NEUTRAL';
 return {horizon,returnPct:ret,volatilityPct:vol,direction,regime:classifyRegime(ret),coverage:true,samples:slice.length};
}

export async function loadSweepHorizons(symbol:string){
 const [h1,m5,m1]=await Promise.all([
  loadPagedCandles(symbol,'1h',24*90),
  loadPagedCandles(symbol,'5m',12*24*5),
  loadPagedCandles(symbol,'1m',60*6),
 ]);
 const h:Record<string,HorizonState>={};
 const long:[string,number][]=[['90d',2160],['60d',1440],['45d',1080],['30d',720],['15d',360],['5d',120],['1d',24],['12h',12],['6h',6],['3h',3],['1h',1]];
 for(const [name,bars] of long)h[name]=horizonState(name,h1,bars);
 const short:[string,number][]=[['30m',6],['15m',3],['5m',1]];
 for(const [name,bars] of short)h[name]=horizonState(name,m5,bars);
 h['1m']=horizonState('1m',m1,1);
 h['30s']={horizon:'30s',returnPct:0,volatilityPct:0,direction:'NEUTRAL',regime:'RANGE',coverage:false,samples:0};
 h['15s']={horizon:'15s',returnPct:0,volatilityPct:0,direction:'NEUTRAL',regime:'RANGE',coverage:false,samples:0};
 return {horizons:h,availableFrames:['1h','15m','5m','1m'],source:{oneHourBars:h1.length,fiveMinuteBars:m5.length,oneMinuteBars:m1.length,maxHistoryDays:90,microstructureRealtimeOnly:true,upstream:BINANCE_REST}};
}
