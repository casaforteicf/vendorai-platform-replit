import type { MarketSnapshot } from '../types/index';

export interface DerivativesIntelligence {
  symbol: string;
  openInterest?: number;
  openInterestChangePct?: number;
  globalLongShortRatio?: number;
  topTraderLongShortRatio?: number;
  takerBuySellRatio?: number;
  basisRate?: number;
  annualizedBasisRate?: number;
  adlRisk?: 'low'|'medium'|'high'|string;
  score: number;
  bias: 'BULLISH'|'BEARISH'|'NEUTRAL';
  flags: string[];
  ts: number;
}

export interface EventSignal {
  id: string;
  title: string;
  source: string;
  publishedAt: number;
  impact: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
  sentiment: 'POSITIVE'|'NEGATIVE'|'NEUTRAL';
  symbols: string[];
  confidence: number;
}

export interface MarketIntelligenceSnapshot {
  market: MarketSnapshot;
  derivatives: DerivativesIntelligence;
  events: EventSignal[];
  eventProvider: 'CONFIGURED'|'UNCONFIGURED';
  combinedScore: number;
  combinedBias: 'BULLISH'|'BEARISH'|'NEUTRAL';
}

function clamp(n:number,min=0,max=100){return Math.max(min,Math.min(max,n));}

export function scoreDerivatives(input:Omit<DerivativesIntelligence,'score'|'bias'|'flags'|'ts'>):DerivativesIntelligence {
  let bullish=0,bearish=0; const flags:string[]=[];
  if(input.openInterestChangePct!=null){
    if(input.openInterestChangePct>2){bullish+=8;flags.push('OI_EXPANDING')} else if(input.openInterestChangePct<-2){bearish+=4;flags.push('OI_CONTRACTING')}
  }
  if(input.globalLongShortRatio!=null){
    if(input.globalLongShortRatio>1.15){bullish+=6;flags.push('LONG_BIAS')} else if(input.globalLongShortRatio<0.87){bearish+=6;flags.push('SHORT_BIAS')}
  }
  if(input.topTraderLongShortRatio!=null){
    if(input.topTraderLongShortRatio>1.1) bullish+=8; else if(input.topTraderLongShortRatio<0.9) bearish+=8;
  }
  if(input.takerBuySellRatio!=null){
    if(input.takerBuySellRatio>1.05){bullish+=10;flags.push('TAKER_BUY_PRESSURE')} else if(input.takerBuySellRatio<0.95){bearish+=10;flags.push('TAKER_SELL_PRESSURE')}
  }
  if(input.basisRate!=null){
    if(input.basisRate>0.0008) bullish+=4; else if(input.basisRate<-0.0008) bearish+=4;
  }
  if(input.adlRisk==='high'){bearish+=12;flags.push('ADL_HIGH')} else if(input.adlRisk==='medium'){bearish+=5;flags.push('ADL_MEDIUM')}
  const delta=bullish-bearish; const score=clamp(50+delta);
  return {...input,score,bias:delta>5?'BULLISH':delta<-5?'BEARISH':'NEUTRAL',flags,ts:Date.now()};
}

export function combineIntelligence(market:MarketSnapshot, derivatives:DerivativesIntelligence, events:EventSignal[], eventProvider:'CONFIGURED'|'UNCONFIGURED'):MarketIntelligenceSnapshot {
  const marketScore=market.opportunityScore??50;
  const eventNet=events.reduce((a,e)=>a+(e.sentiment==='POSITIVE'?1:e.sentiment==='NEGATIVE'?-1:0)*e.confidence*(e.impact==='CRITICAL'?1:e.impact==='HIGH'?.8:e.impact==='MEDIUM'?.5:.25),0);
  const eventScore=events.length?clamp(50+eventNet*25):50;
  const combinedScore=clamp(marketScore*.5+derivatives.score*.35+eventScore*.15);
  const signed=(market.change24hPct??0)+((derivatives.score-50)/12)+(eventScore-50)/18;
  return {market,derivatives,events,eventProvider,combinedScore,combinedBias:signed>1?'BULLISH':signed<-1?'BEARISH':'NEUTRAL'};
}
