import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../lib/auth';
import { listPositions } from '../../../lib/store';
import { sessionReport, tradingSession } from '../../../lib/session-intelligence';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const positions=await listPositions(token);
  const report=sessionReport(positions);
  const byStrategy=Object.values(positions.filter(p=>p.status==='CLOSED').reduce((acc:any,p:any)=>{
    const s=tradingSession(p.openedAt); const k=`${p.strategyId}:${s}`; const row=acc[k]??={strategyId:p.strategyId,session:s,trades:0,wins:0,pnl:0};row.trades++;row.wins+=p.realizedPnl>0?1:0;row.pnl+=Number(p.realizedPnl||0);acc[k]=row;return acc;
  },{})).map((r:any)=>({...r,winRatePct:r.trades?r.wins/r.trades*100:0})).sort((a:any,b:any)=>b.pnl-a.pnl);
  const bySymbol=Object.values(positions.filter(p=>p.status==='CLOSED').reduce((acc:any,p:any)=>{
    const s=tradingSession(p.openedAt); const k=`${p.symbol}:${s}`; const row=acc[k]??={symbol:p.symbol,session:s,trades:0,wins:0,pnl:0};row.trades++;row.wins+=p.realizedPnl>0?1:0;row.pnl+=Number(p.realizedPnl||0);acc[k]=row;return acc;
  },{})).map((r:any)=>({...r,winRatePct:r.trades?r.wins/r.trades*100:0})).sort((a:any,b:any)=>b.pnl-a.pnl);
  return NextResponse.json({mode:'PAPER_SHADOW_SESSION_INTELLIGENCE',currentSession:tradingSession(),sessions:report,byStrategy,bySymbol,ts:Date.now(),liveExecution:false});
}
