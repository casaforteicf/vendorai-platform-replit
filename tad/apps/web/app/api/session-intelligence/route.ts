import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../lib/auth';
import { listPositions } from '../../../lib/store';
import { sessionReport, tradingSession } from '../../../lib/session-intelligence';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const positions=await listPositions(token);
  return NextResponse.json({mode:'PAPER_SESSION_INTELLIGENCE',currentSession:tradingSession(),report:sessionReport(positions),closedTrades:positions.filter(p=>p.status==='CLOSED').length,binding:true,maxAdjustmentAbs:2,liveExecution:false,ts:Date.now()});
}
