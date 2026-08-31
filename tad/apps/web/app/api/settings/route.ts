import { NextRequest, NextResponse } from 'next/server';
import { getOperatingProfile, listMarkets, type OperatingProfileId, type TadMarketId } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { getOperatingSettings, saveOperatingSettings } from '../../../lib/operating-settings';

export const dynamic='force-dynamic';
const PROFILES:OperatingProfileId[]=['CONSERVATIVE','INTERMEDIATE','AGGRESSIVE'];
const MARKETS:TadMarketId[]=['CRYPTO','B3','US','FOREX','COMMODITIES'];

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const settings=await getOperatingSettings(token);
  const profile=getOperatingProfile(settings.profile);
  return NextResponse.json({mode:'PAPER',liveTrading:false,settings,profile,markets:listMarkets(),dailyTradeLimit:null,opportunityDriven:true});
}

export async function PUT(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const current=await getOperatingSettings(token);
  const body=await req.json() as Partial<{profile:OperatingProfileId;dailyTargetReferencePct:number;stopAfterDailyTarget:boolean;primaryMarket:TadMarketId;enabledMarkets:TadMarketId[]}>;
  const profile=PROFILES.includes(body.profile as OperatingProfileId)?body.profile!:current.profile;
  const target=Number(body.dailyTargetReferencePct??current.dailyTargetReferencePct);
  if(!Number.isFinite(target)||target<=0||target>20)return NextResponse.json({error:'INVALID_DAILY_TARGET_REFERENCE'},{status:400});
  const enabled=(Array.isArray(body.enabledMarkets)?body.enabledMarkets:current.enabledMarkets).filter((x):x is TadMarketId=>MARKETS.includes(x as TadMarketId));
  if(!enabled.length)enabled.push('CRYPTO');
  const primary=MARKETS.includes(body.primaryMarket as TadMarketId)?body.primaryMarket!:current.primaryMarket;
  if(!enabled.includes(primary))enabled.push(primary);
  const saved=await saveOperatingSettings(token,{profile,dailyTargetReferencePct:target,stopAfterDailyTarget:Boolean(body.stopAfterDailyTarget??current.stopAfterDailyTarget),primaryMarket:primary,enabledMarkets:[...new Set(enabled)],updatedAt:Date.now()});
  return NextResponse.json({ok:true,mode:'PAPER',liveTrading:false,settings:saved,profile:getOperatingProfile(saved.profile),markets:listMarkets(),dailyTradeLimit:null,opportunityDriven:true});
}
