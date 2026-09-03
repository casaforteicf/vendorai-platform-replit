import type { PaperPosition, StrategySignal } from '@tad/core';
import { sessionEdge } from './session-intelligence';

type AuditRecord={type:string;payload:any;ts:number};
type RegimeLike={label?:string};

export type ContextLearningResult={
  sampleSize:number;
  matchedSamples:number;
  adjustment:number;
  winRatePct:number|null;
  avgPnl:number|null;
  confidence:'NONE'|'LOW'|'MEDIUM'|'HIGH';
  dimensions:{symbol:boolean;side:boolean;hourBucket:boolean;regime:boolean};
  session?:ReturnType<typeof sessionEdge>;
};

function bucket(ts:number){return Math.floor(new Date(ts).getUTCHours()/4)*4;}
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}

export function contextualLearning(
  positions:PaperPosition[],
  audit:AuditRecord[],
  signal:StrategySignal,
  regime:RegimeLike,
  now=Date.now(),
):ContextLearningResult{
  const session=sessionEdge(positions,signal,now);
  const decisions=new Map<string,any>();
  for(const event of audit){
    if(event.type==='DECISION'&&event.payload?.decision?.decisionId){
      decisions.set(String(event.payload.decision.decisionId),event.payload);
    }
  }
  const rows=positions.filter(p=>p.status==='CLOSED'&&p.strategyId===signal.strategyId).map(p=>{
    const d=decisions.get(p.decisionId);
    return {p,regime:String(d?.regimeContext?.label??''),hourBucket:bucket(p.openedAt)};
  });
  if(rows.length<3)return {sampleSize:rows.length,matchedSamples:0,adjustment:session.adjustment,winRatePct:null,avgPnl:null,confidence:'NONE',dimensions:{symbol:false,side:false,hourBucket:false,regime:false},session};

  const targetHour=bucket(now); const targetRegime=String(regime?.label??'');
  const scored=rows.map(r=>{
    let match=0,weight=1;
    if(r.p.symbol===signal.symbol){match+=1;weight+=2;}
    if(r.p.side===signal.side){match+=1;weight+=1.5;}
    if(r.hourBucket===targetHour){match+=1;weight+=1;}
    if(targetRegime&&r.regime===targetRegime){match+=1;weight+=2.5;}
    return {...r,match,weight};
  }).filter(r=>r.match>=2);

  if(scored.length<3)return {sampleSize:rows.length,matchedSamples:scored.length,adjustment:session.adjustment,winRatePct:null,avgPnl:null,confidence:'LOW',dimensions:{symbol:false,side:false,hourBucket:false,regime:false},session};
  const totalWeight=scored.reduce((a,r)=>a+r.weight,0);
  const weightedPnl=scored.reduce((a,r)=>a+r.p.realizedPnl*r.weight,0)/Math.max(1,totalWeight);
  const wins=scored.filter(r=>r.p.realizedPnl>0).length;
  const winRate=wins/scored.length*100;
  const pnlScale=clamp(weightedPnl/Math.max(1,Math.abs(scored.reduce((a,r)=>a+r.p.realizedPnl,0)/scored.length)||1),-1,1);
  const winEdge=clamp((winRate-50)/25,-1,1);
  const raw=(winEdge*4)+(pnlScale*4);
  const confidence:ContextLearningResult['confidence']=scored.length>=20?'HIGH':scored.length>=8?'MEDIUM':'LOW';
  const confidenceMultiplier=confidence==='HIGH'?1:confidence==='MEDIUM'?.75:.45;
  const contextualAdjustment=raw*confidenceMultiplier;
  const adjustment=clamp(contextualAdjustment+session.adjustment,-8,8);
  return {
    sampleSize:rows.length,matchedSamples:scored.length,adjustment,winRatePct:winRate,avgPnl:weightedPnl,confidence,session,
    dimensions:{
      symbol:scored.some(r=>r.p.symbol===signal.symbol),
      side:scored.some(r=>r.p.side===signal.side),
      hourBucket:scored.some(r=>r.hourBucket===targetHour),
      regime:Boolean(targetRegime&&scored.some(r=>r.regime===targetRegime)),
    }
  };
}
