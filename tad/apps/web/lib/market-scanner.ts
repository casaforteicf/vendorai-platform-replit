import { classifyRegime, opportunityScore, type MarketSnapshot } from '@tad/core';

const PROXY_URL='https://ryijsscpnicjuchqvcqa.supabase.co/functions/v1/tad-binance-proxy';
const PROXY_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_s9yVOMzsWQm4u3jxZg4i8w_CT5TQSDD';

async function scannerFetch(path:string){
  const url=`${PROXY_URL}?forceFunctionRegion=sa-east-1&url=${encodeURIComponent(path)}`;
  return fetch(url,{cache:'no-store',headers:{apikey:PROXY_KEY,authorization:`Bearer ${PROXY_KEY}`,'x-region':'sa-east-1'}});
}

type ExchangeInfo={symbols:Array<{symbol:string;contractType:string;status:string;quoteAsset:string}>};
type Ticker={symbol:string;lastPrice:string;priceChangePercent:string;quoteVolume:string;highPrice:string;lowPrice:string};
type Book={symbol:string;bidPrice:string;askPrice:string};
type Premium={symbol:string;lastFundingRate:string};

export type ScannerRow=MarketSnapshot&{
  scannerScore:number;
  liquidityScore:number;
  spreadScore:number;
  volatilityScore:number;
  fundingScore:number;
  volumeScore:number;
  intradayRangePct:number;
  eligible:boolean;
  exclusionReasons:string[];
};

const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));

export async function scanFuturesUniverse(options:{limit?:number;minQuoteVolume?:number;maxSpreadPct?:number;maxAbsFunding?:number}={}):Promise<ScannerRow[]> {
  const limit=Math.max(10,Math.min(100,options.limit??60));
  const minQuoteVolume=options.minQuoteVolume??25_000_000;
  const maxSpreadPct=options.maxSpreadPct??0.12;
  const maxAbsFunding=options.maxAbsFunding??0.0015;
  const [er,tr,br,pr]=await Promise.all([
    scannerFetch('/fapi/v1/exchangeInfo'),
    scannerFetch('/fapi/v1/ticker/24hr'),
    scannerFetch('/fapi/v1/ticker/bookTicker'),
    scannerFetch('/fapi/v1/premiumIndex'),
  ]);
  if(!er.ok||!tr.ok||!br.ok||!pr.ok)throw new Error('MARKET_SCANNER_BINANCE_UNAVAILABLE');
  const exchange=await er.json() as ExchangeInfo;
  const tickers=await tr.json() as Ticker[];
  const books=await br.json() as Book[];
  const premium=await pr.json() as Premium[];
  const tickerMap=new Map(tickers.map(x=>[x.symbol,x]));
  const bookMap=new Map(books.map(x=>[x.symbol,x]));
  const premiumMap=new Map(premium.map(x=>[x.symbol,x]));
  const now=Date.now();
  const rows:ScannerRow[]=[];
  for(const s of exchange.symbols){
    if(s.status!=='TRADING'||s.contractType!=='PERPETUAL'||s.quoteAsset!=='USDT'||!s.symbol.endsWith('USDT'))continue;
    const t=tickerMap.get(s.symbol),book=bookMap.get(s.symbol),prem=premiumMap.get(s.symbol); if(!t||!book)continue;
    const price=Number(t.lastPrice),bid=Number(book.bidPrice),ask=Number(book.askPrice),volume=Number(t.quoteVolume),change=Number(t.priceChangePercent),funding=Number(prem?.lastFundingRate??0);
    if(!(price>0&&bid>0&&ask>0&&volume>=0))continue;
    const spreadPct=((ask-bid)/price)*100;
    const high=Number(t.highPrice),low=Number(t.lowPrice); const intradayRangePct=low>0?((high-low)/low)*100:0;
    const exclusionReasons:string[]=[];
    if(volume<minQuoteVolume)exclusionReasons.push('LOW_QUOTE_VOLUME');
    if(spreadPct>maxSpreadPct)exclusionReasons.push('SPREAD_TOO_WIDE');
    if(Math.abs(funding)>maxAbsFunding)exclusionReasons.push('FUNDING_EXTREME');
    if(intradayRangePct<0.6)exclusionReasons.push('VOLATILITY_TOO_LOW');
    if(intradayRangePct>35)exclusionReasons.push('VOLATILITY_EXTREME');
    const volumeScore=clamp((Math.log10(Math.max(1,volume))-7)*28);
    const spreadScore=clamp(100-(spreadPct/maxSpreadPct)*80);
    const fundingScore=clamp(100-(Math.abs(funding)/maxAbsFunding)*75);
    const volatilityScore=intradayRangePct<1?clamp(intradayRangePct*55):intradayRangePct<=12?clamp(65+intradayRangePct*2.2):clamp(95-(intradayRangePct-12)*4);
    const liquidityScore=clamp(volumeScore*.65+spreadScore*.35);
    const regime=classifyRegime(change);
    const baseOpportunity=opportunityScore({change24hPct:change,spreadPct,fundingRate:funding,quoteVolume24h:volume});
    const scannerScore=clamp(baseOpportunity*.38+liquidityScore*.24+volatilityScore*.18+fundingScore*.10+volumeScore*.10);
    rows.push({symbol:s.symbol,price,change24hPct:change,quoteVolume24h:volume,spreadPct,fundingRate:funding,regime,opportunityScore:baseOpportunity,ts:now,scannerScore,liquidityScore,spreadScore,volatilityScore,fundingScore,volumeScore,intradayRangePct,eligible:exclusionReasons.length===0,exclusionReasons});
  }
  return rows.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.scannerScore-a.scannerScore).slice(0,limit);
}
