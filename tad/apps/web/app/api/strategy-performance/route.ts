import { NextRequest, NextResponse } from 'next/server';
import { buildStrategyPerformanceMatrix } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { listPositions } from '../../../lib/store';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const positions=await listPositions(token);
  const recentDays=Math.max(1,Math.min(30,Number(req.nextUrl.searchParams.get('recentDays')||7)));
  const symbol=(req.nextUrl.searchParams.get('symbol')||'').toUpperCase();
  const strategy=(req.nextUrl.searchParams.get('strategy')||'').toUpperCase();
  const matrix=buildStrategyPerformanceMatrix(positions,{recentDays});
  const rows=matrix.rows.filter(r=>(!symbol||r.symbol===symbol)&&(!strategy||r.strategyId===strategy));
  const byStrategy=matrix.byStrategy.filter(r=>!strategy||r.strategyId===strategy);
  return NextResponse.json({mode:'PAPER_OBSERVATIONAL',recentDays,totalClosedTrades:matrix.totalClosedTrades,filters:{symbol:symbol||null,strategy:strategy||null},rows,byStrategy,binding:false,liveExecution:false});
}
