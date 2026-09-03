import type { PaperPosition, StrategySignal } from '@tad/core';

type AuditRecord={type:string;payload:any;ts:number};
type RegimeLike={direction?:string;label?:string};

export type ContextLearningResult={
  sampleSize:number;
  matchedSamples:number;
  adjustment:number;
  winRatePct:number|null;
  avgPnl:number|null;
  confidence:'NONE'|'LOW'|'MEDIUM'|'HIGH';
  hourBucket:number;
  dimensions:{hourBucket:boolean;symbolSupport:boolean;sideSupport:boolean;regimeSupport:boolean};
  reason:string;
};

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export const contextHourBucket=(ts:number)=>Math.floor(new Date(ts).getUTCHours()/4)*4;

export function contextualLearning(
  positions:PaperPosition[],
  audit:AuditRecord[],
  signal:StrategySignal,
  regime:RegimeLike,
  now=Date.now(),
):ContextLearningResult{
  const targetHour=contextHourBucket(now);
  const targetRegime=String(regime?.direction??regime?.label??'UNKNOWN');
  const decisions=new Map<string,any>();
  for(const event of audit){
    if(event.type==='DECISION'&&event.payload?.decision?.decisionId)decisions.set(String(event.payload.decision.decisionId),event.payload);
  }

  const strategyRows=positions.filter(p=>p.status==='CLOSED'&&p.strategyId===signal.strategyId).map(p=>{
    const d=decisions.get(String(p.decisionId??''));
    return {
      p,
      hourBucket:contextHourBucket(p.openedAt),
      regime:String(d?.regimeContext?.direction??d?.regimeContext?.label??'UNKNOWN'),
    };
  });
  const hourly=strategyRows.filter(r=>r.hourBucket===targetHour);
  const empty=(confidence:ContextLearningResult['confidence'],reason:string):ContextLearningResult=>({sampleSize:strategyRows.length,matchedSamples:hourly.length,adjustment:0,winRatePct:null,avgPnl:null,confidence,hourBucket:targetHour,dimensions:{hourBucket:hourly.length>0,symbolSupport:false,sideSupport:false,regimeSupport:false},reason});
  if(strategyRows.length<5)return empty('NONE','STRATEGY_SAMPLE_BELOW_5');
  if(hourly.length<5)return empty('LOW','HOUR_BUCKET_SAMPLE_BELOW_5');

  // Hour is the only binding contextual dimension here. Symbol/side/regime only increase confidence,
  // because those dimensions are already scored by Performance Matrix and Regime Performance.
  const weighted=hourly.map(r=>{
    let weight=1;
    if(r.p.symbol===signal.symbol)weight+=.25;
    if(r.p.side===signal.side)weight+=.2;
    if(targetRegime!=='UNKNOWN'&&r.regime===targetRegime)weight+=.15;
    return {...r,weight};
  });
  const totalWeight=weighted.reduce((a,r)=>a+r.weight,0);
  const weightedPnl=weighted.reduce((a,r)=>a+Number(r.p.realizedPnl||0)*r.weight,0)/Math.max(1,totalWeight);
  const wins=weighted.filter(r=>Number(r.p.realizedPnl||0)>0).length;
  const winRatePct=wins/weighted.length*100;
  const avgAbsPnl=weighted.reduce((a,r)=>a+Math.abs(Number(r.p.realizedPnl||0)),0)/Math.max(1,weighted.length);
  const pnlEdge=clamp(weightedPnl/Math.max(1,avgAbsPnl),-1,1);
  const winEdge=clamp((winRatePct-50)/25,-1,1);
  const raw=(winEdge*2.5)+(pnlEdge*1.5);
  const confidence:ContextLearningResult['confidence']=weighted.length>=20?'HIGH':weighted.length>=10?'MEDIUM':'LOW';
  const confidenceMultiplier=confidence==='HIGH'?1:confidence==='MEDIUM'?.75:.5;
  const adjustment=clamp(raw*confidenceMultiplier,-4,4);
  return {
    sampleSize:strategyRows.length,
    matchedSamples:weighted.length,
    adjustment,
    winRatePct,
    avgPnl:weightedPnl,
    confidence,
    hourBucket:targetHour,
    dimensions:{
      hourBucket:true,
      symbolSupport:weighted.some(r=>r.p.symbol===signal.symbol),
      sideSupport:weighted.some(r=>r.p.side===signal.side),
      regimeSupport:targetRegime!=='UNKNOWN'&&weighted.some(r=>r.regime===targetRegime),
    },
    reason:'HOURLY_EDGE_OBSERVATION',
  };
}
