import { NextRequest, NextResponse } from 'next/server';
import { buildStrategyPerformanceMatrix, buildStrategyRegimePerformance, type DecisionRegimeContext, type MarketRegime } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { listAudit, listPositions } from '../../../lib/store';

function regimeFromAudit(row:any):DecisionRegimeContext|null{
  if(row?.type!=='DECISION')return null;
  const payload=row?.payload??{}; const decisionId=payload?.decision?.decisionId;
  const raw=payload?.regimeContext?.regime??payload?.regimeContext?.marketRegime??payload?.regimeContext?.state;
  const allowed:MarketRegime[]=['STRONG_UP','UP','RANGE','DOWN','STRONG_DOWN'];
  const regime=allowed.includes(raw)?raw:'UNKNOWN';
  return decisionId?{decisionId,regime,ts:Number(row?.ts??0)}:null;
}

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const [positions,audit]=await Promise.all([listPositions(token),listAudit(token,500)]);
  const recentDays=Math.max(1,Math.min(30,Number(req.nextUrl.searchParams.get('recentDays')||7)));
  const symbol=(req.nextUrl.searchParams.get('symbol')||'').toUpperCase();
  const strategy=(req.nextUrl.searchParams.get('strategy')||'').toUpperCase();
  const matrix=buildStrategyPerformanceMatrix(positions,{recentDays});
  const contexts=audit.map(regimeFromAudit).filter((x):x is DecisionRegimeContext=>Boolean(x));
  const regimeMatrix=buildStrategyRegimePerformance(positions,contexts);
  const rows=matrix.rows.filter(r=>(!symbol||r.symbol===symbol)&&(!strategy||r.strategyId===strategy));
  const byStrategy=matrix.byStrategy.filter(r=>!strategy||r.strategyId===strategy);
  const byRegime=regimeMatrix.rows.filter(r=>(!symbol||r.symbol===symbol)&&(!strategy||r.strategyId===strategy));
  return NextResponse.json({mode:'PAPER_OBSERVATIONAL',recentDays,totalClosedTrades:matrix.totalClosedTrades,filters:{symbol:symbol||null,strategy:strategy||null},rows,byStrategy,byRegime,regimeCoverage:{matchedTrades:regimeMatrix.matchedRegimeTrades,unknownTrades:regimeMatrix.unknownRegimeTrades,coveragePct:regimeMatrix.coveragePct,auditWindow:500},binding:false,liveExecution:false});
}
