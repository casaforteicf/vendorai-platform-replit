import { classifyRegime, opportunityScore, type MarketSnapshot } from '@tad/core';
export const BINANCE_REST='https://fapi.binance.com';
const TAD_BINANCE_PROXY='https://ryijsscpnicjuchqvcqa.supabase.co/functions/v1/tad-binance-proxy';
const TAD_BINANCE_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5aWpzc2NwbmljanVjaHF2Y3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMDA3MDQsImV4cCI6MjEwMzY3NjcwNH0.zZcne9BjkbQlafdOW0iGvYAuRwso_vCiT32vUkTFAeo';
const DIRECT_FETCH=globalThis.fetch.bind(globalThis);
async function tadFetch(input:any,init:any={}){
  const u=input instanceof URL?input.toString():String(input);
  if(u.startsWith(BINANCE_REST)){
    const upstream=u.slice(BINANCE_REST.length);
    const proxy=TAD_BINANCE_PROXY+'?forceFunctionRegion=sa-east-1&url='+encodeURIComponent(upstream);
    const headers={...(init?.headers||{}),apikey:TAD_BINANCE_ANON,authorization:'Bearer '+TAD_BINANCE_ANON,'x-region':'sa-east-1'};
    return DIRECT_FETCH(proxy,{...init,headers});
  }
  return DIRECT_FETCH(input,init);
}

export const TRACKED_SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','SUIUSDT','ADAUSDT'];
type Ticker={symbol:string;lastPrice:string;priceChangePercent:string;quoteVolume:string};
type Book={symbol:string;bidPrice:string;askPrice:string};
type Premium={symbol:string;lastFundingRate:string};

export async function loadMarkets():Promise<MarketSnapshot[]> {
  const [tr,br,pr]=await Promise.all([
    tadFetch(`${BINANCE_REST}/fapi/v1/ticker/24hr`,{cache:'no-store'}),
    tadFetch(`${BINANCE_REST}/fapi/v1/ticker/bookTicker`,{cache:'no-store'}),
    tadFetch(`${BINANCE_REST}/fapi/v1/premiumIndex`,{cache:'no-store'}),
  ]);
  if(!tr.ok||!br.ok||!pr.ok)throw new Error('BINANCE_PUBLIC_API_UNAVAILABLE');
  const tickers=await tr.json() as Ticker[]; const books=await br.json() as Book[]; const premium=await pr.json() as Premium[];
  const bookMap=new Map(books.map(x=>[x.symbol,x])); const premiumMap=new Map(premium.map(x=>[x.symbol,x])); const now=Date.now();
  return tickers.filter(x=>TRACKED_SYMBOLS.includes(x.symbol)).map(x=>{
    const book=bookMap.get(x.symbol); const prem=premiumMap.get(x.symbol); const price=Number(x.lastPrice);
    const bid=Number(book?.bidPrice??price),ask=Number(book?.askPrice??price); const spreadPct=price>0?((ask-bid)/price)*100:0;
    const change24hPct=Number(x.priceChangePercent),fundingRate=Number(prem?.lastFundingRate??0),quoteVolume24h=Number(x.quoteVolume);
    const regime=classifyRegime(change24hPct); const score=opportunityScore({change24hPct,spreadPct,fundingRate,quoteVolume24h});
    return {symbol:x.symbol,price,change24hPct,quoteVolume24h,spreadPct,fundingRate,regime,opportunityScore:score,ts:now};
  }).sort((a,b)=>(b.opportunityScore??0)-(a.opportunityScore??0));
}


import { buildMultiTimeframe, technicalSnapshot, type Candle, type CandleInterval, type MultiTimeframeSnapshot } from '@tad/core';

type RawKline=[number,string,string,string,string,string,number,string,number,string,string,string];
export async function loadCandles(symbol:string, interval:CandleInterval, limit=160):Promise<Candle[]> {
  const url=`${BINANCE_REST}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${Math.min(1500,limit)}`;
  const r=await tadFetch(url,{cache:'no-store'}); if(!r.ok) throw new Error(`BINANCE_KLINES_${r.status}`);
  const rows=await r.json() as RawKline[];
  return rows.map(k=>({openTime:k[0],open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),closeTime:k[6]}));
}

export async function loadTechnical(symbol:string):Promise<{mtf:MultiTimeframeSnapshot;candles5m:Candle[]}> {
  const intervals:CandleInterval[]=['1m','5m','15m','1h'];
  const data=await Promise.all(intervals.map(i=>loadCandles(symbol,i,160)));
  const frames:any={}; intervals.forEach((i,idx)=>{frames[i]=technicalSnapshot(symbol,i,data[idx])});
  return {mtf:buildMultiTimeframe(symbol,frames),candles5m:data[1]};
}

import { scoreDerivatives, type DerivativesIntelligence, type EventSignal } from '@tad/core';

async function safeJson<T>(url:string):Promise<T|undefined>{
  try{const r=await tadFetch(url,{cache:'no-store'}); if(!r.ok)return undefined; return await r.json() as T}catch{return undefined}
}

type OIHist={sumOpenInterest:string;sumOpenInterestValue:string;timestamp:number};
type RatioRow={longShortRatio:string;longAccount?:string;shortAccount?:string;buySellRatio?:string;timestamp:number};
type BasisRow={basisRate:string;annualizedBasisRate:string;timestamp:number};
type AdlRow={symbol:string;adlRisk:string;updateTime:number};

export async function loadDerivativesIntelligence(symbol:string):Promise<DerivativesIntelligence>{
  const q=encodeURIComponent(symbol);
  const [oi,globalRatio,topRatio,taker,basis,adl]=await Promise.all([
    safeJson<OIHist[]>(`${BINANCE_REST}/futures/data/openInterestHist?symbol=${q}&period=5m&limit=2`),
    safeJson<RatioRow[]>(`${BINANCE_REST}/futures/data/globalLongShortAccountRatio?symbol=${q}&period=5m&limit=1`),
    safeJson<RatioRow[]>(`${BINANCE_REST}/futures/data/topLongShortPositionRatio?symbol=${q}&period=5m&limit=1`),
    safeJson<RatioRow[]>(`${BINANCE_REST}/futures/data/takerlongshortRatio?symbol=${q}&period=5m&limit=1`),
    safeJson<BasisRow[]>(`${BINANCE_REST}/futures/data/basis?pair=${q}&contractType=PERPETUAL&period=5m&limit=1`),
    safeJson<AdlRow|AdlRow[]>(`${BINANCE_REST}/fapi/v1/symbolAdlRisk?symbol=${q}`),
  ]);
  const oiLast=oi?.at(-1),oiPrev=oi?.at(-2); const oiNow=Number(oiLast?.sumOpenInterest??0),oiBefore=Number(oiPrev?.sumOpenInterest??0);
  const adlRow=Array.isArray(adl)?adl[0]:adl;
  return scoreDerivatives({
    symbol,
    openInterest:oiNow||undefined,
    openInterestChangePct:oiBefore?((oiNow/oiBefore)-1)*100:undefined,
    globalLongShortRatio:Number(globalRatio?.at(-1)?.longShortRatio)||undefined,
    topTraderLongShortRatio:Number(topRatio?.at(-1)?.longShortRatio)||undefined,
    takerBuySellRatio:Number(taker?.at(-1)?.buySellRatio??taker?.at(-1)?.longShortRatio)||undefined,
    basisRate:Number(basis?.at(-1)?.basisRate)||undefined,
    annualizedBasisRate:Number(basis?.at(-1)?.annualizedBasisRate)||undefined,
    adlRisk:adlRow?.adlRisk,
  });
}

export async function loadConfiguredEvents(symbol:string):Promise<{events:EventSignal[];provider:'CONFIGURED'|'UNCONFIGURED'}>{
  const base=process.env.MARKET_EVENT_FEED_URL;
  if(!base)return {events:[],provider:'UNCONFIGURED'};
  try{
    const url=new URL(base); url.searchParams.set('symbol',symbol);
    const r=await tadFetch(url,{cache:'no-store',headers:process.env.MARKET_EVENT_FEED_TOKEN?{authorization:`Bearer ${process.env.MARKET_EVENT_FEED_TOKEN}`}:{}});
    if(!r.ok)return {events:[],provider:'CONFIGURED'};
    const raw=await r.json() as any; const rows=Array.isArray(raw)?raw:Array.isArray(raw?.events)?raw.events:[];
    const events:EventSignal[]=rows.slice(0,30).map((e:any,i:number)=>({
      id:String(e.id??`${symbol}-${i}-${e.publishedAt??Date.now()}`),title:String(e.title??'Evento de mercado'),source:String(e.source??'configured-feed'),publishedAt:Number(e.publishedAt??Date.now()),
      impact:['LOW','MEDIUM','HIGH','CRITICAL'].includes(String(e.impact).toUpperCase())?String(e.impact).toUpperCase():'MEDIUM',
      sentiment:['POSITIVE','NEGATIVE','NEUTRAL'].includes(String(e.sentiment).toUpperCase())?String(e.sentiment).toUpperCase():'NEUTRAL',
      symbols:Array.isArray(e.symbols)?e.symbols.map(String):[symbol],confidence:Math.max(0,Math.min(1,Number(e.confidence??.5))),
    }));
    return {events:events as EventSignal[],provider:'CONFIGURED'};
  }catch{return {events:[],provider:'CONFIGURED'};}
}
