type Impact='LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
type EventLike={id?:string;title?:string;source?:string;publishedAt:number;impact:Impact|string;sentiment?:string;symbols?:string[];confidence?:number};

export type EventRiskState='UNCONFIGURED'|'CLEAR'|'PRE_EVENT'|'EVENT_ACTIVE'|'POST_EVENT';
export type EventRiskAssessment={
  state:EventRiskState;
  approved:boolean;
  riskMultiplier:number;
  reason:string;
  nearestEvent:null|{id?:string;title?:string;source?:string;impact:string;eventAt:number;minutesFromNow:number;sentiment?:string;confidence?:number};
  relevantEvents:number;
};

function severity(impact:string){return ({LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4} as Record<string,number>)[String(impact).toUpperCase()]??2;}

export function assessEventRisk(events:EventLike[],provider:'CONFIGURED'|'UNCONFIGURED',now=Date.now()):EventRiskAssessment{
  if(provider==='UNCONFIGURED')return {state:'UNCONFIGURED',approved:true,riskMultiplier:1,reason:'EVENT_FEED_UNCONFIGURED',nearestEvent:null,relevantEvents:0};
  if(!events.length)return {state:'CLEAR',approved:true,riskMultiplier:1,reason:'NO_RELEVANT_EVENTS',nearestEvent:null,relevantEvents:0};
  const ranked=events.map(e=>({...e,deltaMin:(Number(e.publishedAt)-now)/60_000,sev:severity(String(e.impact))}))
    .filter(e=>Number.isFinite(e.deltaMin)&&e.deltaMin>=-120&&e.deltaMin<=240)
    .sort((a,b)=>Math.abs(a.deltaMin)-Math.abs(b.deltaMin)||b.sev-a.sev);
  if(!ranked.length)return {state:'CLEAR',approved:true,riskMultiplier:1,reason:'NO_EVENTS_IN_RISK_WINDOW',nearestEvent:null,relevantEvents:0};
  const critical=ranked.filter(e=>e.sev>=3);
  const pool=critical.length?critical:ranked;
  const e=pool[0];
  const nearest={id:e.id,title:e.title,source:e.source,impact:String(e.impact).toUpperCase(),eventAt:Number(e.publishedAt),minutesFromNow:e.deltaMin,sentiment:e.sentiment,confidence:e.confidence};
  if(e.sev>=3){
    if(e.deltaMin>5&&e.deltaMin<=30)return {state:'PRE_EVENT',approved:true,riskMultiplier:.25,reason:'HIGH_IMPACT_EVENT_APPROACHING',nearestEvent:nearest,relevantEvents:ranked.length};
    if(e.deltaMin>=-10&&e.deltaMin<=5)return {state:'EVENT_ACTIVE',approved:false,riskMultiplier:0,reason:'HIGH_IMPACT_EVENT_ACTIVE',nearestEvent:nearest,relevantEvents:ranked.length};
    if(e.deltaMin>=-30&&e.deltaMin<-10)return {state:'POST_EVENT',approved:true,riskMultiplier:.4,reason:'HIGH_IMPACT_POST_EVENT_STABILIZATION',nearestEvent:nearest,relevantEvents:ranked.length};
  }
  if(e.sev===2){
    if(e.deltaMin>=-5&&e.deltaMin<=10)return {state:'EVENT_ACTIVE',approved:true,riskMultiplier:.6,reason:'MEDIUM_IMPACT_EVENT_WINDOW',nearestEvent:nearest,relevantEvents:ranked.length};
    if(e.deltaMin>10&&e.deltaMin<=30)return {state:'PRE_EVENT',approved:true,riskMultiplier:.8,reason:'MEDIUM_IMPACT_EVENT_APPROACHING',nearestEvent:nearest,relevantEvents:ranked.length};
  }
  return {state:'CLEAR',approved:true,riskMultiplier:1,reason:'EVENT_RISK_CLEAR',nearestEvent:nearest,relevantEvents:ranked.length};
}
