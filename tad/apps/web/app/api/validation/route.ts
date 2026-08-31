import { NextRequest, NextResponse } from 'next/server';
import { computeRobustness, ROBUSTNESS_STRATEGIES, type RobustnessStrategyId } from '../../../lib/robustness';
export async function GET(req:NextRequest){
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  const requested=(req.nextUrl.searchParams.get('strategy')||'TREND_PULLBACK_V1') as RobustnessStrategyId;
  const strategy=ROBUSTNESS_STRATEGIES.includes(requested)?requested:'TREND_PULLBACK_V1';
  const limit=Math.min(1200,Math.max(640,Number(req.nextUrl.searchParams.get('limit')||960)));
  const result=await computeRobustness(symbol,strategy,limit);
  return NextResponse.json({...result,mode:'HISTORICAL_VALIDATION',robust:result.assessment.state==='ROBUST'});
}
