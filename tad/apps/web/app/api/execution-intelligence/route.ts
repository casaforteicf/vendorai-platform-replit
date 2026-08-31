import { NextResponse } from 'next/server';
import { buildExecutionProfile, executionEdgeGate, executionHealthScore, type ExecutionObservation } from '@tad/core';

export async function POST(req:Request){
  const body=await req.json().catch(()=>({}));
  const observations=(body.observations??[]) as ExecutionObservation[];
  const symbol=body.symbol??'BTCUSDT', strategyId=body.strategyId??'TREND_PULLBACK_V1', regime=body.regime??'UNKNOWN', hourUtc=body.hourUtc??new Date().getUTCHours();
  const profile=buildExecutionProfile(observations,symbol,strategyId,regime,hourUtc);
  const gate=executionEdgeGate(profile,{expectedEdgeBps:Number(body.expectedEdgeBps??12),safetyBufferBps:Number(body.safetyBufferBps??3)});
  return NextResponse.json({profile,gate,healthScore:executionHealthScore(profile),mode:'SHADOW_ONLY',liveExecution:false});
}
