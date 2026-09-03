import { NextRequest, NextResponse } from 'next/server';
import { STRATEGY_IDS, STRATEGY_LIBRARY, buildStrategyPerformanceMatrix, buildStrategyRegimePerformance, evaluateStrategyLifecycle, strategyMetrics, type PaperPosition, type StrategyMetric } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { listAudit, listPositions } from '../../../lib/store';

function stats(ps:PaperPosition[]){
  const closed=ps.filter(p=>p.status==='CLOSED');
  const wins=closed.filter(p=>p.realizedPnl>0),losses=closed.filter(p=>p.realizedPnl<=0);
  const pos=wins.reduce((a,p)=>a+p.realizedPnl,0),neg=Math.abs(losses.reduce((a,p)=>a+p.realizedPnl,0));
  const pnl=closed.reduce((a,p)=>a+p.realizedPnl,0);
  return {trades:closed.length,wins:wins.length,losses:losses.length,winRatePct:closed.length?wins.length/closed.length*100:0,realizedPnl:pnl,avgPnl:closed.length?pnl/closed.length:0,profitFactor:neg?pos/neg:(pos>0?3:null)};
}
function friendly(state:string){return state==='ACTIVE'?'ATIVA':state==='DEGRADED'?'OBSERVAÇÃO':state==='QUARANTINED'?'PAUSADA':state==='RETIRED'?'RETIRADA':'CANDIDATA'}

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const [positions,audit]=await Promise.all([listPositions(token),listAudit(token,500)]);
  const metrics=strategyMetrics(positions);
  const performance=buildStrategyPerformanceMatrix(positions,{recentDays:7});
  const contexts=audit.filter(a=>a.type==='DECISION').map(a=>{const p=a.payload as any;return {decisionId:String(p?.decision?.decisionId??''),regime:(p?.regimeContext?.direction??'UNKNOWN') as any,ts:a.ts}}).filter(x=>x.decisionId);
  const regimePerformance=buildStrategyRegimePerformance(positions,contexts);
  const executable=new Set<string>(STRATEGY_IDS as readonly string[]);

  const strategies=STRATEGY_LIBRARY.map(meta=>{
    const implemented=executable.has(meta.id);
    const metric:StrategyMetric=metrics.find(m=>m.strategyId===meta.id)??{strategyId:meta.id,trades:0,wins:0,losses:0,winRatePct:0,realizedPnl:0,avgPnl:0,profitFactor:null};
    const lifecycle=implemented?evaluateStrategyLifecycle(metric,positions):null;
    const own=positions.filter(p=>p.strategyId===meta.id);
    const bySymbol=[...new Set(own.map(p=>p.symbol))].map(symbol=>({symbol,...stats(own.filter(p=>p.symbol===symbol))})).sort((a,b)=>b.realizedPnl-a.realizedPnl);
    const bySide=(['LONG','SHORT'] as const).map(side=>({side,...stats(own.filter(p=>p.side===side))})).filter(x=>x.trades>0);
    const byHour=[...new Set(own.map(p=>new Date(p.openedAt).getUTCHours()))].map(hour=>({hour,...stats(own.filter(p=>new Date(p.openedAt).getUTCHours()===hour))})).sort((a,b)=>a.hour-b.hour);
    const perf=performance.byStrategy.find(r=>r.strategyId===meta.id)??null;
    const regimeRows=regimePerformance.rows.filter(r=>r.strategyId===meta.id).slice(0,12);
    const governanceState=!implemented?'PESQUISA':friendly(lifecycle?.state??'CANDIDATE');
    const rankScore=implemented?Math.round((lifecycle?.score??50)*.55+(perf?.score??50)*.45):0;
    return {...meta,implemented,actionable:implemented&&meta.status==='ACTIVE_PAPER'&&(lifecycle?.capitalMultiplier??0)>0,governanceState,rankScore,metric,lifecycle,performance:perf,regimeRows,bySymbol,bySide,byHour};
  }).sort((a,b)=>Number(b.implemented)-Number(a.implemented)||b.rankScore-a.rankScore||a.name.localeCompare(b.name)).map((x,i)=>({...x,rank:i+1}));

  return NextResponse.json({
    mode:'PAPER_STRATEGY_GOVERNANCE',
    strategies,
    totalLibrary:STRATEGY_LIBRARY.length,
    executableStrategies:STRATEGY_IDS.length,
    researchStrategies:strategies.filter(s=>!s.implemented).length,
    positions:positions.length,
    closedPositions:performance.totalClosedTrades,
    regimeCoverage:{matched:regimePerformance.matchedRegimeTrades,unknown:regimePerformance.unknownRegimeTrades,coveragePct:regimePerformance.coveragePct,auditWindow:audit.length},
    binding:'LIFECYCLE_ALREADY_BINDING_IN_AUTOPILOT',
    researchCanTrade:false,
    liveExecution:false,
    ts:Date.now()
  });
}
