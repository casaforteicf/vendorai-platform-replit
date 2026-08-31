import type { BacktestSummary } from '../backtest/engine';
import type { WalkForwardSummary } from './walk-forward';
import type { MonteCarloSummary } from './monte-carlo';

export type RobustnessState='UNVALIDATED'|'WEAK'|'ROBUST';
export interface RobustnessAssessment{
  state:RobustnessState;
  approved:boolean;
  riskMultiplier:number;
  score:number;
  trades:number;
  walkForwardPassRatePct:number;
  ruinProbabilityPct:number;
  p95MaxDrawdownPct:number;
  reasons:string[];
}

export function assessRobustness(summary:BacktestSummary,wf:WalkForwardSummary,mc:MonteCarloSummary):RobustnessAssessment{
  const reasons:string[]=[];
  const trades=summary.trades;
  if(trades<8) reasons.push('INSUFFICIENT_TRADES');
  if(wf.windows.length<2) reasons.push('INSUFFICIENT_WALK_FORWARD_WINDOWS');
  if(wf.passRatePct<60) reasons.push('WALK_FORWARD_PASS_RATE_LOW');
  if(mc.ruinProbabilityPct>=5) reasons.push('MONTE_CARLO_RUIN_HIGH');
  if(mc.p95MaxDrawdownPct>=20) reasons.push('MONTE_CARLO_P95_DRAWDOWN_HIGH');
  if(summary.netReturnPct<=0) reasons.push('NON_POSITIVE_FULL_SAMPLE_RETURN');

  let score=100;
  if(trades<8) score-=35; else if(trades<16) score-=12;
  score-=Math.max(0,60-wf.passRatePct)*.6;
  score-=Math.min(35,mc.ruinProbabilityPct*5);
  score-=Math.max(0,mc.p95MaxDrawdownPct-10)*1.5;
  if(summary.netReturnPct<=0) score-=20;
  score=Math.max(0,Math.min(100,Math.round(score)));

  const robust=trades>=8&&wf.windows.length>=2&&wf.passRatePct>=60&&mc.ruinProbabilityPct<5&&mc.p95MaxDrawdownPct<20&&summary.netReturnPct>0;
  const state:RobustnessState=trades<8||wf.windows.length<2?'UNVALIDATED':robust?'ROBUST':'WEAK';
  const riskMultiplier=state==='ROBUST'?1:state==='WEAK'?.35:0;
  return {state,approved:state==='ROBUST',riskMultiplier,score,trades,walkForwardPassRatePct:wf.passRatePct,ruinProbabilityPct:mc.ruinProbabilityPct,p95MaxDrawdownPct:mc.p95MaxDrawdownPct,reasons:reasons.length?reasons:['ROBUSTNESS_OK']};
}
