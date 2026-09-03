import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../../lib/auth';
import { getLiveControl, getUserRole, saveLiveControl } from '../../../../lib/live-control';
import { appendAudit } from '../../../../lib/store';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const [role,control]=await Promise.all([getUserRole(token),getLiveControl(token)]);
  return NextResponse.json({role,control,liveFeatureEnabled:process.env.TAD_LIVE_TRADING_ENABLED==='true'});
}

export async function PUT(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const role=await getUserRole(token); if(role!=='ADMIN')return NextResponse.json({error:'ADMIN_AUTHORIZATION_REQUIRED'},{status:403});
  const body=await req.json() as {armed?:boolean;killSwitch?:boolean};
  const patch:{armed?:boolean;killSwitch?:boolean}={};
  if(typeof body.armed==='boolean')patch.armed=body.armed;
  if(typeof body.killSwitch==='boolean')patch.killSwitch=body.killSwitch;
  // Clearing the kill switch never arms LIVE automatically. Arming also never clears it automatically.
  const control=await saveLiveControl(token,patch);
  await appendAudit(token,'LIVE_CONTROL_UPDATED',{armed:control.armed,killSwitch:control.killSwitch,ts:Date.now()});
  return NextResponse.json({control,liveFeatureEnabled:process.env.TAD_LIVE_TRADING_ENABLED==='true',liveOrderSent:false});
}
