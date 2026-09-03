import { NextRequest, NextResponse } from 'next/server';
import { evaluateStrategyLifecycle, strategyCatalog, strategyMetrics, type PaperPosition } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { listPositions } from '../../../lib/store';

function group<T>(items:T[], key:(item:T)=>string){
  const out:Record<string,T[]>={};
  for(const item of items){const k=key(item);(out[k]??=[]).push(item)}
  return out;
}
function stats(ps:PaperPosition[]){
  const closed=ps.filter(p=>p.status==='CLOSED');
  const wins=closed.filter(p=>p.realizedPnl>0); const losses=closed.filter(p=>p.realizedPnl<=0);
  const pos=wins.reduce((a,p)=>a+p.realizedPnl,0); const neg=Math.abs(losses.reduce((a,p)=>a+p.realizedPnl,0));
  const pnl=closed.reduce((a,p)=>a+p.realizedPnl,0);
  return {trades:closed.length,wins:wins.length,losses:losses.length,winRatePct:closed.length?wins.length/closed.length*100:0,realizedPnl:pnl,avgPnl:closed.length?pnl/closed.length:0,profitFactor:neg?pos/neg:null};
}
function friendly(state:string){return state==='ACTIVE'?'ATIVA':state==='DEGRADED'?'OBSERVAÇÃO':state==='QUARANTINED'?'PAUSADA':state==='RETIRED'?'RETIRADA':'CANDIDATA'}
export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const positions=await listPositions(token); const metrics=strategyMetrics(positions);
  const rows=strategyCatalog.map(meta=>{
    const metric=metrics.find(m=>m.strategyId===meta.id)??{strategyId:meta.id,trades:0,wins:0,losses:0,winRatePct:0,realizedPnl:0,avgPnl:0,profitFactor:null};
    const lifecycle=evaluateStrategyLifecycle(metric,positions);
    const own=positions.filter(p=>p.strategyId===meta.id);
    const bySymbol=Object.entries(group(own,p=>p.symbol)).map(([symbol,ps])=>({symbol,...stats(ps)})).sort((a,b)=>b.realizedPnl-a.realizedPnl);
    const bySide=Object.entries(group(own,p=>p.side)).map(([side,ps])=>({side,...stats(ps)}));
    const byHour=Object.entries(group(own,p=>String(new Date(p.openedAt).getUTCHours()).padStart(2,'0'))).map(([hour,ps])=>({hour:Number(hour),...stats(ps)})).sort((a,b)=>a.hour-b.hour);
    const rankScore=lifecycle.score+(metric.profitFactor==null?0:Math.min(20,Math.max(-20,(metric.profitFactor-1)*20)))+Math.max(-20,Math.min(20,metric.realizedPnl/10));
    return {...meta,metric,lifecycle:{...lifecycle,friendlyState:friendly(lifecycle.state)},rankScore,bySymbol,bySide,byHour};
  }).sort((a,b)=>b.rankScore-a.rankScore).map((x,i)=>({...x,rank:i+1}));
  return NextResponse.json({strategies:rows,positions:positions.length,closedPositions:positions.filter(p=>p.status==='CLOSED').length,ts:Date.now()});
}
