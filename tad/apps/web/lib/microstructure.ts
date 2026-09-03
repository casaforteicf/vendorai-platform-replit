const PROXY_URL='https://ryijsscpnicjuchqvcqa.supabase.co/functions/v1/tad-binance-proxy';
const PROXY_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_s9yVOMzsWQm4u3jxZg4i8w_CT5TQSDD';

type AggTrade={a:number;p:string;q:string;f:number;l:number;T:number;m:boolean};
export type MicroBar={start:number;end:number;open:number;high:number;low:number;close:number;volume:number;aggressiveBuyVolume:number;aggressiveSellVolume:number;tradeCount:number;imbalance:number;returnPct:number};
export type MicrostructureQuality={status:'HEALTHY'|'DEGRADED'|'BLOCKED';approved:boolean;reasons:string[];freshnessMs:number|null;binding:boolean};
export type MicrostructureDirection={status:'CONFIRMED'|'NEUTRAL'|'CONTRADICTED';approved:boolean;side:'LONG'|'SHORT';reasons:string[];score:number;binding:boolean};

async function proxyFetch(path:string){
  const url=`${PROXY_URL}?forceFunctionRegion=sa-east-1&url=${encodeURIComponent(path)}`;
  return fetch(url,{cache:'no-store',headers:{apikey:PROXY_KEY,authorization:`Bearer ${PROXY_KEY}`,'x-region':'sa-east-1'}});
}
const clamp=(n:number,min=-1,max=1)=>Math.max(min,Math.min(max,n));

function aggregate(trades:AggTrade[],bucketMs:number):MicroBar[]{
  const groups=new Map<number,AggTrade[]>();
  for(const t of trades){const start=Math.floor(t.T/bucketMs)*bucketMs;(groups.get(start)??groups.set(start,[]).get(start)!).push(t);}
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([start,rows])=>{
    const prices=rows.map(r=>Number(r.p)),qty=rows.map(r=>Number(r.q));
    const buy=rows.reduce((s,r)=>s+(r.m?0:Number(r.q)),0);
    const sell=rows.reduce((s,r)=>s+(r.m?Number(r.q):0),0);
    const total=buy+sell;
    const open=prices[0],close=prices.at(-1)??open;
    return {start,end:start+bucketMs,open,high:Math.max(...prices),low:Math.min(...prices),close,volume:qty.reduce((a,b)=>a+b,0),aggressiveBuyVolume:buy,aggressiveSellVolume:sell,tradeCount:rows.length,imbalance:total?clamp((buy-sell)/total):0,returnPct:open?((close/open)-1)*100:0};
  });
}
function stdev(values:number[]){if(values.length<2)return 0;const mean=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/(values.length-1));}

export async function loadMicrostructure(symbol:string,limit=1000){
  const q=`/fapi/v1/aggTrades?symbol=${encodeURIComponent(symbol.toUpperCase())}&limit=${Math.max(100,Math.min(1000,limit))}`;
  const r=await proxyFetch(q); if(!r.ok)throw new Error(`MICROSTRUCTURE_AGGTRADES_${r.status}`);
  const trades=await r.json() as AggTrade[];
  const bars15s=aggregate(trades,15_000).slice(-40);
  const bars30s=aggregate(trades,30_000).slice(-30);
  const latest15=bars15s.at(-1)??null,latest30=bars30s.at(-1)??null;
  const totalBuy=trades.reduce((s,t)=>s+(t.m?0:Number(t.q)),0),totalSell=trades.reduce((s,t)=>s+(t.m?Number(t.q):0),0),total=totalBuy+totalSell;
  const firstPrice=trades.length?Number(trades[0].p):0,lastPrice=trades.length?Number(trades.at(-1)!.p):0;
  const durationSec=trades.length?Math.max(1,(trades.at(-1)!.T-trades[0].T)/1000):0;
  const priceVelocityPctPerMin=firstPrice&&durationSec?(((lastPrice/firstPrice)-1)*100)/(durationSec/60):0;
  const returns=bars15s.map(b=>b.returnPct);
  const microVolatilityPct=stdev(returns);
  const flowImbalance=total?clamp((totalBuy-totalSell)/total):0;
  const score=Math.max(0,Math.min(100,Math.round(50+flowImbalance*25+Math.max(-15,Math.min(15,priceVelocityPctPerMin*8)))));
  return {symbol:symbol.toUpperCase(),source:'BINANCE_FUTURES_AGGTRADES',syntheticFrames:true,nativeKlines:false,tradeCount:trades.length,window:{from:trades[0]?.T??null,to:trades.at(-1)?.T??null,durationSec},flow:{aggressiveBuyVolume:totalBuy,aggressiveSellVolume:totalSell,imbalance:flowImbalance},priceVelocityPctPerMin,microVolatilityPct,score,latest15s:latest15,latest30s:latest30,bars15s,bars30s,ts:Date.now()};
}

export function assessMicrostructureQuality(snapshot:Awaited<ReturnType<typeof loadMicrostructure>>,now=Date.now()):MicrostructureQuality{
  const reasons:string[]=[];
  const lastTs=snapshot.window.to;
  const freshnessMs=lastTs==null?null:Math.max(0,now-lastTs);
  if(!snapshot.tradeCount||!snapshot.latest15s||!snapshot.latest30s||lastTs==null)reasons.push('MICROSTRUCTURE_EMPTY');
  if(freshnessMs!=null&&freshnessMs>30_000)reasons.push('LAST_TRADE_STALE');
  if(snapshot.tradeCount<25)reasons.push('TRADE_SAMPLE_CRITICAL');
  if(reasons.some(r=>['MICROSTRUCTURE_EMPTY','LAST_TRADE_STALE','TRADE_SAMPLE_CRITICAL'].includes(r)))return {status:'BLOCKED',approved:false,reasons,freshnessMs,binding:true};
  if(snapshot.tradeCount<100)reasons.push('TRADE_SAMPLE_LOW');
  if(snapshot.window.durationSec>900)reasons.push('ACTIVITY_WINDOW_TOO_LONG');
  if((snapshot.latest15s?.tradeCount??0)<3)reasons.push('LATEST_15S_THIN');
  if(snapshot.microVolatilityPct>1.5)reasons.push('MICRO_VOLATILITY_EXTREME');
  return {status:reasons.length?'DEGRADED':'HEALTHY',approved:true,reasons:reasons.length?reasons:['MICROSTRUCTURE_HEALTHY'],freshnessMs,binding:true};
}

export function assessMicrostructureDirection(snapshot:Awaited<ReturnType<typeof loadMicrostructure>>,side:'LONG'|'SHORT'):MicrostructureDirection{
  const sign=side==='LONG'?1:-1;
  const latest15=snapshot.latest15s;
  const latest30=snapshot.latest30s;
  if(!latest15||!latest30)return {status:'NEUTRAL',approved:true,side,reasons:['MICRO_DIRECTION_INSUFFICIENT_BARS'],score:50,binding:false};
  const flow=sign*snapshot.flow.imbalance;
  const velocity=sign*snapshot.priceVelocityPctPerMin;
  const shortFlow=sign*latest15.imbalance;
  const mediumFlow=sign*latest30.imbalance;
  const score=Math.max(0,Math.min(100,Math.round(50+flow*20+shortFlow*15+mediumFlow*10+Math.max(-10,Math.min(10,velocity*6)))));
  const reasons:string[]=[];
  if(flow>=0.12)reasons.push('FLOW_ALIGNED');
  if(shortFlow>=0.12)reasons.push('LATEST_15S_ALIGNED');
  if(mediumFlow>=0.10)reasons.push('LATEST_30S_ALIGNED');
  if(velocity>0)reasons.push('PRICE_VELOCITY_ALIGNED');
  const stronglyContradicted=(flow<=-0.35&&shortFlow<=-0.25)||(shortFlow<=-0.45&&mediumFlow<=-0.25)||(flow<=-0.25&&velocity<=-0.08);
  if(stronglyContradicted)return {status:'CONTRADICTED',approved:false,side,reasons:['STRONG_MICRO_FLOW_CONTRADICTION'],score,binding:false};
  const confirmed=score>=62&&(flow>0||shortFlow>0||mediumFlow>0);
  return {status:confirmed?'CONFIRMED':'NEUTRAL',approved:true,side,reasons:reasons.length?reasons:['MICRO_DIRECTION_NEUTRAL'],score,binding:false};
}
