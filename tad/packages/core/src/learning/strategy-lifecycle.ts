import type { PaperPosition, StrategyMetric } from '../types/index';
export type StrategyLifecycleState='CANDIDATE'|'ACTIVE'|'DEGRADED'|'QUARANTINED'|'RETIRED';
export interface StrategyLifecycle{strategyId:string;state:StrategyLifecycleState;score:number;reasons:string[];recentTrades:number;recentWinRatePct:number;recentPnl:number;drawdownPct:number;driftPct:number;capitalMultiplier:number;shadowEligible:boolean}
const clamp=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
function maxDrawdownPct(values:number[]){let equity=100,peak=100,max=0;for(const v of values){equity*=1+v/100;peak=Math.max(peak,equity);max=Math.max(max,(peak-equity)/peak*100)}return max}
export function evaluateStrategyLifecycle(metric:StrategyMetric, positions:PaperPosition[]):StrategyLifecycle{
 const ps=positions.filter(p=>p.strategyId===metric.strategyId&&p.status==='CLOSED').slice(-30); const pnl=ps.map(p=>p.realizedPnl); const recent=ps.slice(-10); const recentPnl=recent.reduce((a,p)=>a+p.realizedPnl,0); const wins=recent.filter(p=>p.realizedPnl>0).length; const recentWinRatePct=recent.length?wins/recent.length*100:0;
 const half=Math.max(1,Math.floor(ps.length/2)); const older=ps.slice(0,half); const newer=ps.slice(half); const avg=(a:PaperPosition[])=>a.length?a.reduce((s,p)=>s+p.realizedPnl,0)/a.length:0; const base=Math.max(1,Math.abs(avg(older))); const driftPct=older.length&&newer.length?(avg(newer)-avg(older))/base*100:0;
 const returns=ps.map(p=>p.accountSize?100*p.realizedPnl/p.accountSize:0); const drawdownPct=maxDrawdownPct(returns); let score=50; const reasons:string[]=[];
 if(metric.trades>=20){score+=10}else reasons.push('SAMPLE_SMALL'); if(metric.profitFactor!=null&&metric.profitFactor>=1.3)score+=15;else if(metric.profitFactor!=null&&metric.profitFactor<1) {score-=25;reasons.push('PROFIT_FACTOR_BELOW_1')}
 if(recentWinRatePct>=55)score+=10;else if(recent.length>=8&&recentWinRatePct<40){score-=20;reasons.push('RECENT_WIN_RATE_WEAK')}
 if(recentPnl>0)score+=10;else if(recent.length>=8){score-=15;reasons.push('RECENT_PNL_NEGATIVE')}
 if(driftPct<-50){score-=20;reasons.push('NEGATIVE_DRIFT')} if(drawdownPct>12){score-=20;reasons.push('RECENT_DRAWDOWN_HIGH')} score=clamp(score);
 let state:StrategyLifecycleState='CANDIDATE', capitalMultiplier=.25; if(metric.trades>=20&&score>=70){state='ACTIVE';capitalMultiplier=1}else if(metric.trades>=12&&score>=50){state='DEGRADED';capitalMultiplier=.5}else if(metric.trades>=12&&score<50){state='QUARANTINED';capitalMultiplier=0}else if(metric.trades>=40&&score<30){state='RETIRED';capitalMultiplier=0}
 return {strategyId:metric.strategyId,state,score,reasons,recentTrades:recent.length,recentWinRatePct,recentPnl,drawdownPct,driftPct,capitalMultiplier,shadowEligible:state==='ACTIVE'&&score>=75};
}
