export type RiskBudgetLayerName='TRADE_RISK'|'DATA_INTEGRITY'|'ROBUSTNESS'|'LIFECYCLE'|'REGIME'|'PORTFOLIO_INTELLIGENCE'|'SUPERVISOR'|'EXECUTION_INTELLIGENCE';
export interface RiskBudgetLayer {
  name:RiskBudgetLayerName;
  approved:boolean;
  multiplier:number;
  binding:boolean;
  reason:string;
  score?:number;
  source?:string;
}
export interface RiskBudgetDecision {
  approved:boolean;
  baseRiskPct:number;
  finalRiskPct:number;
  finalMultiplier:number;
  bindingConstraint:RiskBudgetLayerName|'NONE';
  layers:RiskBudgetLayer[];
  reasons:string[];
  policy:{combination:'CONSTRAINT_ENVELOPE';maxMultiplier:1;canIncreaseRisk:false;liveExecution:false};
}
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function evaluateRiskBudget(params:{baseRiskPct:number;layers:RiskBudgetLayer[]}):RiskBudgetDecision{
  const layers=params.layers.map(l=>({...l,multiplier:clamp(l.multiplier)}));
  const hardVeto=layers.find(l=>l.binding&&!l.approved);
  const binding=layers.filter(l=>l.binding&&l.approved);
  const lowest=binding.reduce<RiskBudgetLayer|null>((best,l)=>!best||l.multiplier<best.multiplier?l:best,null);
  const finalMultiplier=hardVeto?0:(lowest?.multiplier??1);
  const reasons:string[]=[];
  for(const l of layers){
    if(l.binding&&!l.approved) reasons.push(`${l.name}_VETO:${l.reason}`);
    else if(l.binding&&l.multiplier<1) reasons.push(`${l.name}_LIMIT:${Math.round(l.multiplier*100)}%:${l.reason}`);
    else if(!l.binding) reasons.push(`${l.name}_ADVISORY:${l.reason}`);
  }
  return {
    approved:!hardVeto&&params.baseRiskPct>0,
    baseRiskPct:Math.max(0,params.baseRiskPct),
    finalRiskPct:Math.max(0,params.baseRiskPct)*finalMultiplier,
    finalMultiplier,
    bindingConstraint:hardVeto?.name??lowest?.name??'NONE',
    layers,reasons,
    policy:{combination:'CONSTRAINT_ENVELOPE',maxMultiplier:1,canIncreaseRisk:false,liveExecution:false}
  };
}
