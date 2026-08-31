import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../lib/auth';
import { listAudit, storageMode } from '../../../lib/store';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){const token=bearerToken(req);if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});const limit=Number(req.nextUrl.searchParams.get('limit')??100);return NextResponse.json({storage:storageMode(),events:await listAudit(token,limit)})}
