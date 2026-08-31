import { NextRequest, NextResponse } from 'next/server';
import { strategyMetrics } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { listPositions, storageMode } from '../../../lib/store';
export async function GET(req:NextRequest){const token=bearerToken(req);if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});const positions=await listPositions(token);return NextResponse.json({metrics:strategyMetrics(positions),storage:storageMode(),ts:Date.now()});}
