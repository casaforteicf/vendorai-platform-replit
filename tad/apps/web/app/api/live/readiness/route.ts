import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../../lib/auth';
import { getLiveControl, getUserRole, saveLiveControl } from '../../../../lib/live-control';
import { privateReadiness } from '../../../../lib/binance-private';
import { loadMarkets, TRACKED_SYMBOLS } from '../../../../lib/binance';

export async function GET(req:NextRequest){
  const token=bearerToken(req);
  if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const [role,control,exchange,markets]=await Promise.all([
    getUserRole(token),getLiveControl(token),privateReadiness(),loadMarkets().catch(()=>[])
  ]);
  const liveFeatureEnabled=process.env.TAD_LIVE_TRADING_ENABLED==='true';
  const marketFresh=markets.length>0&&markets.every(m=>Date.now()-m.ts<15_000);
  const clockHealthy=exchange.serverTimeSkewMs!=null&&exchange.serverTimeSkewMs<2_000;
  const checks={
    adminAuthorized:role==='ADMIN',
    persistedArmed:control.armed,
    killSwitchClear:!control.killSwitch,
    liveFeatureEnabled,
    exchangeConfigured:exchange.configured,
    exchangeSignedConnectivity:exchange.signedConnectivity,
    exchangeHostAllowed:!exchange.productionHost||exchange.productionExecutionAllowed,
    exchangeClockHealthy:clockHealthy,
    publicMarketFeedFresh:marketFresh,
    trackedSymbols:TRACKED_SYMBOLS,
  };
  const ready=Object.entries(checks).filter(([k])=>k!=='trackedSymbols').every(([,v])=>v===true);
  if(role==='ADMIN')await saveLiveControl(token,{lastReadinessAt:Date.now()}).catch(()=>undefined);
  return NextResponse.json({ready,mode:'LIVE_READINESS_ONLY',liveExecutionTriggered:false,role,control,exchange:{...exchange,error:exchange.error},checks,version:'0.23.0'});
}
