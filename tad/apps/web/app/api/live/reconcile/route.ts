import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../../lib/auth';
import { getUserRole, getLiveControl } from '../../../../lib/live-control';
import { getPositionRiskV3, privateReadiness } from '../../../../lib/binance-private';
import { appendAudit, listAudit } from '../../../../lib/store';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const role=await getUserRole(token); if(role!=='ADMIN')return NextResponse.json({error:'ADMIN_AUTHORIZATION_REQUIRED'},{status:403});
  const [control,exchange,positions,audit]=await Promise.all([
    getLiveControl(token),privateReadiness(),getPositionRiskV3().catch(()=>null),listAudit(token,100)
  ]);
  const liveEvents=audit.filter((e:any)=>String(e.type).startsWith('LIVE_')).slice(0,50);
  const openPositions=Array.isArray(positions)?positions.filter((p:any)=>Math.abs(Number(p.positionAmt||0))>0):[];
  const reconciliation={
    exchangeReachable:exchange.signedConnectivity,
    killSwitch:control.killSwitch,
    armed:control.armed,
    exchangeOpenPositions:openPositions,
    recentLiveEvents:liveEvents,
    ts:Date.now(),
  };
  await appendAudit(token,'LIVE_RECONCILIATION',{exchangeReachable:exchange.signedConnectivity,openPositionCount:openPositions.length,armed:control.armed,killSwitch:control.killSwitch});
  return NextResponse.json(reconciliation);
}
