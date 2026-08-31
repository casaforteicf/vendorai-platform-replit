import { NextRequest, NextResponse } from 'next/server';
import { assessShadowReadiness, evaluateStrategyLifecycle, strategyMetrics } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { listPositions } from '../../../lib/store';
export async function GET(req:NextRequest){const token=bearerToken(req);if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});const positions=await listPositions(token);const metrics=strategyMetrics(positions);const lifecycles=metrics.map(m=>evaluateStrategyLifecycle(m,positions));const closed=positions.filter(p=>p.status==='CLOSED').length;const shadow=assessShadowReadiness(lifecycles,closed,true);return NextResponse.json({mode:'LEARNING_CONTROLLED',lifecycles,shadow,closedTrades:closed,liveExecution:false,ts:Date.now()});}
