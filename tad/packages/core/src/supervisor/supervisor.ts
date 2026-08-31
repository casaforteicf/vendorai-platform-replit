export type SupervisorState='OPERATE'|'REDUCE_RISK'|'OBSERVE'|'STOP';
export interface SupervisorInput{
  portfolioRiskApproved:boolean;
  portfolioEffectiveRiskPct:number;
  maxPairCorrelation:number;
  dailyDrawdownPct:number;
  volatilityPct:number;
  strategyRobust:boolean;
  walkForwardPassRatePct:number;
  ruinProbabilityPct:number;
  p95MaxDrawdownPct:number;
  marketIntelligenceScore:number;
  eventRisk:'LOW'|'MEDIUM'|'HIGH'|'UNKNOWN';
  dataHealthStatus?:'HEALTHY'|'DEGRADED'|'CRITICAL';
  dataHealthScore?:number;
}
export interface SupervisorDecision{
  state:SupervisorState;
  riskMultiplier:number;
  autoScannerAllowed:boolean;
  reasons:string[];
  score:number;
}
const clamp=(x:number,a=0,b=100)=>Math.max(a,Math.min(b,x));
export function supervise(i:SupervisorInput):SupervisorDecision{
  const reasons:string[]=[];
  let score=100;
  if(!i.portfolioRiskApproved){score-=45;reasons.push('PORTFOLIO_RISK_BLOCKED')}
  if(i.portfolioEffectiveRiskPct>1.0){score-=20;reasons.push('PORTFOLIO_RISK_ELEVATED')}
  if(i.maxPairCorrelation>.85){score-=20;reasons.push('CORRELATION_ELEVATED')}
  if(i.dailyDrawdownPct>=2){score-=60;reasons.push('DAILY_DRAWDOWN_LIMIT')}
  else if(i.dailyDrawdownPct>=1){score-=25;reasons.push('DAILY_DRAWDOWN_ELEVATED')}
  if(i.volatilityPct>2.5){score-=20;reasons.push('VOLATILITY_EXTREME')}
  else if(i.volatilityPct>1.5){score-=10;reasons.push('VOLATILITY_HIGH')}
  if(!i.strategyRobust){score-=20;reasons.push('STRATEGY_NOT_ROBUST')}
  if(i.walkForwardPassRatePct<60){score-=15;reasons.push('WALK_FORWARD_WEAK')}
  if(i.ruinProbabilityPct>=5){score-=35;reasons.push('MONTE_CARLO_RUIN_RISK')}
  if(i.p95MaxDrawdownPct>=20){score-=20;reasons.push('MONTE_CARLO_DRAWDOWN_HIGH')}
  if(i.marketIntelligenceScore<40){score-=10;reasons.push('MARKET_INTELLIGENCE_WEAK')}
  if(i.eventRisk==='HIGH'){score-=35;reasons.push('HIGH_IMPACT_EVENT_RISK')}
  else if(i.eventRisk==='MEDIUM'){score-=10;reasons.push('EVENT_RISK_MEDIUM')}
  if(i.dataHealthStatus==='CRITICAL'){score-=100;reasons.push('DATA_HEALTH_CRITICAL')}
  else if(i.dataHealthStatus==='DEGRADED'){score-=45;reasons.push('DATA_HEALTH_DEGRADED')}
  if(i.dataHealthScore!=null&&i.dataHealthScore<60){score-=10;reasons.push('DATA_HEALTH_SCORE_LOW')}
  score=clamp(score);
  let state:SupervisorState='OPERATE',riskMultiplier=1;
  if(i.dataHealthStatus==='CRITICAL'||score<35||i.dailyDrawdownPct>=2||(!i.portfolioRiskApproved&&i.portfolioEffectiveRiskPct>1.2)){state='STOP';riskMultiplier=0}
  else if(i.dataHealthStatus==='DEGRADED'||score<55){state='OBSERVE';riskMultiplier=0}
  else if(score<75){state='REDUCE_RISK';riskMultiplier=.5}
  return {state,riskMultiplier,autoScannerAllowed:state==='OPERATE'||state==='REDUCE_RISK',reasons,score};
}
